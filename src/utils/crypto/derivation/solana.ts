import nacl from 'tweetnacl';
import { hmacSha512, mnemonicToSeed } from './octra';
import { base58Encode, bufferToHex } from '../format';

/**
 * Derive Solana keys from a 64-byte master seed using standard SLIP-0010 Ed25519 derivation.
 * Path: m/44'/501'/index'/0'
 */
export async function deriveSolanaKeysFromMasterSeed(
    masterSeed: Uint8Array,
    index: number = 0
): Promise<{ address: string; privateKeyHex: string }> {
    // Derive master node
    // Key: "ed25519 seed"
    // Data: master seed
    const textEncoder = new TextEncoder();
    const masterKeyBytes = textEncoder.encode('ed25519 seed');
    const masterI = await hmacSha512(masterKeyBytes, masterSeed);
    
    let currentKey = masterI.slice(0, 32);
    let currentChainCode = masterI.slice(32, 64);

    // Derive standard Solana BIP44/SLIP-0010 path: m/44'/501'/index'/0'
    // Every path component MUST be hardened for Ed25519 (SLIP-0010 standard)
    const path = [
        44 + 0x80000000,
        501 + 0x80000000,
        index + 0x80000000,
        0 + 0x80000000
    ];

    for (const pathIndex of path) {
        const data = new Uint8Array(1 + 32 + 4);
        data[0] = 0x00;
        data.set(currentKey, 1);
        
        // Encode index as 4-byte big-endian
        data[33] = (pathIndex >> 24) & 0xff;
        data[34] = (pathIndex >> 16) & 0xff;
        data[35] = (pathIndex >> 8) & 0xff;
        data[36] = pathIndex & 0xff;

        const childI = await hmacSha512(currentChainCode, data);
        currentKey = childI.slice(0, 32);
        currentChainCode = childI.slice(32, 64);
    }

    // Generate Ed25519 keypair from the derived seed
    const keyPair = nacl.sign.keyPair.fromSeed(currentKey);
    const publicKey = keyPair.publicKey;

    // Generate standard Solana address (base58 encoded public key)
    const address = base58Encode(publicKey);
    const privateKeyHex = bufferToHex(currentKey);

    return {
        address,
        privateKeyHex
    };
}

/**
 * Derive Solana keys from a mnemonic using standard SLIP-0010 Ed25519 derivation.
 * Path: m/44'/501'/index'/0'
 */
export async function deriveSolanaKeysFromMnemonic(
    mnemonicPhrase: string,
    index: number = 0
): Promise<{ address: string; privateKeyHex: string }> {
    try {
        const mnemonic = mnemonicPhrase.trim().toLowerCase();
        
        // 1. Get 64-byte master seed from mnemonic
        const seed = await mnemonicToSeed(mnemonic);

        // 2. Derive using master seed
        return await deriveSolanaKeysFromMasterSeed(seed, index);
    } catch (e) {
        console.error('Failed to derive Solana keys from mnemonic:', e);
        throw new Error('Failed to derive Solana keys: ' + (e instanceof Error ? e.message : String(e)));
    }
}
