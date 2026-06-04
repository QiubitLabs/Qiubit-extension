import { ethers } from 'ethers';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values: number[]): number {
    let chk = 1;
    for (let p = 0; p < values.length; ++p) {
        const top = chk >> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ values[p];
        for (let i = 0; i < 5; ++i) {
            if ((top >> i) & 1) {
                chk ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i];
            }
        }
    }
    return chk;
}

function hrpExpand(hrp: string): number[] {
    const ret: number[] = [];
    for (let p = 0; p < hrp.length; ++p) {
        ret.push(hrp.charCodeAt(p) >> 5);
    }
    ret.push(0);
    for (let p = 0; p < hrp.length; ++p) {
        ret.push(hrp.charCodeAt(p) & 31);
    }
    return ret;
}

function createChecksum(hrp: string, data: number[]): number[] {
    const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const mod = polymod(values) ^ 1; // 1 for Bech32 (BIP173)
    const ret: number[] = [];
    for (let p = 0; p < 6; ++p) {
        ret.push((mod >> (5 * (5 - p))) & 31);
    }
    return ret;
}

function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean): number[] | null {
    let acc = 0;
    let bits = 0;
    const ret: number[] = [];
    const maxv = (1 << toBits) - 1;
    for (let p = 0; p < data.length; ++p) {
        const value = data[p];
        if (value < 0 || (value >> fromBits) !== 0) {
            return null;
        }
        acc = (acc << fromBits) | value;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            ret.push((acc >> bits) & maxv);
        }
    }
    if (pad) {
        if (bits > 0) {
            ret.push((acc << (toBits - bits)) & maxv);
        }
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
        return null;
    }
    return ret;
}

export function encodeBech32(hrp: string, data: number[]): string {
    const combined = data.concat(createChecksum(hrp, data));
    let ret = hrp + '1';
    for (let p = 0; p < combined.length; ++p) {
        ret += CHARSET[combined[p]];
    }
    return ret;
}

export function toBech32Address(witnessHash: Uint8Array): string {
    // witnessHash is 20-byte ripemd160(sha256(pubkey))
    // For P2WPKH, witness version is 0.
    const words = convertBits(Array.from(witnessHash), 8, 5, true);
    if (!words) throw new Error('Failed to convert witness hash bits');
    const combined = [0].concat(words); // Prepend witness version 0
    return encodeBech32('bc', combined);
}

/**
 * Derive Bitcoin keys from a mnemonic using BIP-84 Native SegWit (Bech32 P2WPKH) derivation.
 * Path: m/84'/0'/0'/0/index
 */
export async function deriveBitcoinKeysFromMnemonic(
    mnemonicPhrase: string,
    index: number = 0
): Promise<{ address: string; privateKeyHex: string }> {
    try {
        const mnemonic = mnemonicPhrase.trim().toLowerCase();
        
        // Derive standard BIP-84 path: m/84'/0'/0'/0/index
        const path = `m/84'/0'/0'/0/${index}`;
        const wallet = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(mnemonic),
            path
        );

        // Get 32-byte private key (strip '0x' prefix for internal keys)
        let privateKeyHex = wallet.privateKey;
        if (privateKeyHex.startsWith('0x')) {
            privateKeyHex = privateKeyHex.slice(2);
        }

        // Get compressed public key (ethers.HDNodeWallet uses compressed keys by default)
        const compressedPubKey = wallet.publicKey; // Hex string with '0x'
        const pubKeyBytes = ethers.getBytes(compressedPubKey);

        // Compute P2WPKH Witness Program: ripemd160(sha256(pubkey))
        const sha = sha256(pubKeyBytes);
        const rip = ripemd160(sha);

        // Encode to Native SegWit address (starts with bc1q)
        const address = toBech32Address(rip);

        return {
            address,
            privateKeyHex
        };
    } catch (e) {
        console.error('Failed to derive Bitcoin keys from mnemonic:', e);
        throw new Error('Failed to derive Bitcoin keys: ' + (e instanceof Error ? e.message : String(e)));
    }
}
