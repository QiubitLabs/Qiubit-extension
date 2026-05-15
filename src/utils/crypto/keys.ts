import * as bip39 from 'bip39';
import nacl from 'tweetnacl';
import { ethers } from 'ethers';
import {
    bufferToHex,
    hexToBuffer,
    bufferToBase64,
    base64ToBuffer,
    createOctraAddress
} from './format';

export interface WalletKeys {
    mnemonic: string[] | null;
    seedHex?: string;
    privateKeyHex: string;
    publicKeyHex: string;
    privateKeyB64: string;
    publicKeyB64: string;
    address: string;
    evmAddress?: string;
    entropyHex?: string;
    hdIndex?: number;
    hdVersion?: number;
    masterSeedB64?: string;
}

/**
 * HMAC-SHA512 using Web Crypto API
 * Matches CLI: hmac_sha512(key, key_len, data, data_len)
 */
async function hmacSha512(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    // Ensure pure ArrayBuffer for Web Crypto API
    const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
    const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
    return new Uint8Array(sig);
}

/**
 * Derive HD seed from master seed
 * Exact port of CLI derive_hd_seed() from crypto_utils.hpp
 * 
 * hd_version=1, index=0: first 32 bytes of master_seed directly
 * hd_version=2, index=0: HMAC-SHA512("Octra seed", master_seed)[0:32]
 * else: HMAC-SHA512("Octra seed", master_seed || index_le32)[0:32]
 */
async function deriveHdSeed(masterSeed: Uint8Array, index: number = 0, hdVersion: number = 2): Promise<Uint8Array> {
    if (hdVersion === 1 && index === 0) {
        // Version 1, index 0: use first 32 bytes of master seed directly
        return masterSeed.slice(0, 32);
    } else if (hdVersion === 2 && index === 0) {
        // Version 2, index 0: HMAC-SHA512("Octra seed", master_seed)[0:32]
        const key = new TextEncoder().encode('Octra seed');
        const mac = await hmacSha512(key, masterSeed);
        return mac.slice(0, 32);
    } else {
        // Any other index: HMAC-SHA512("Octra seed", master_seed || index_le32)[0:32]
        // Index is stored as 4 bytes little-endian
        const data = new Uint8Array(masterSeed.length + 4);
        data.set(masterSeed, 0);
        data[masterSeed.length]     = (index)       & 0xFF;
        data[masterSeed.length + 1] = (index >> 8)  & 0xFF;
        data[masterSeed.length + 2] = (index >> 16) & 0xFF;
        data[masterSeed.length + 3] = (index >> 24) & 0xFF;

        const key = new TextEncoder().encode('Octra seed');
        const mac = await hmacSha512(key, data);
        return mac.slice(0, 32);
    }
}

/**
 * Convert mnemonic to 64-byte seed
 * Matches CLI: PKCS5_PBKDF2_HMAC(mnemonic, "mnemonic", 2048, SHA512, 64)
 * bip39.mnemonicToSeed does exactly this
 */
async function mnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
    const seedBuffer = await bip39.mnemonicToSeed(mnemonic);
    return new Uint8Array(seedBuffer);
}

/**
 * Derive EVM address from mnemonic
 * Path: m/44'/60'/0'/0/index
 */
export function deriveEvmAddressFromMnemonic(mnemonic: string, index: number = 0): string {
    try {
        const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
        return wallet.address;
    } catch (e) {
        console.error('Failed to derive EVM address:', e);
        return '';
    }
}

/**
 * Generate new wallet with mnemonic
 * Matches CLI create_wallet() from wallet.hpp:
 *   1. generate_mnemonic_12()
 *   2. mnemonic_to_seed(mnemonic) -> 64 bytes
 *   3. derive_hd_seed(seed, 0, 2) -> 32 bytes
 *   4. keypair_from_seed(hd_seed) -> Ed25519 keypair
 *   5. derive_address(pk) -> "oct" + base58(sha256(pk))
 */
export async function generateWallet(): Promise<WalletKeys> {
    // Generate 128-bit entropy (12 words) - matches CLI generate_mnemonic_12()
    const entropy = crypto.getRandomValues(new Uint8Array(16));
    const entropyHex = bufferToHex(entropy);

    // Generate mnemonic from entropy
    const mnemonic = bip39.entropyToMnemonic(entropyHex);

    // Derive seed from mnemonic (PBKDF2, 2048 iterations, SHA-512)
    const seed = await mnemonicToSeed(mnemonic);

    // Derive HD seed using Octra protocol (version 2, index 0)
    const hdSeed = await deriveHdSeed(seed, 0, 2);

    // Create Ed25519 keypair from HD seed
    const keyPair = nacl.sign.keyPair.fromSeed(hdSeed);
    const privateKey = hdSeed; // 32-byte seed IS the private key
    const publicKey = keyPair.publicKey;

    // Create address: "oct" + base58(sha256(pk)), padded to 44 chars
    const address = await createOctraAddress(publicKey);

    // Derive EVM address
    const evmAddress = deriveEvmAddressFromMnemonic(mnemonic, 0);

    // Master seed as base64 (matches CLI w.master_seed_b64)
    const masterSeedB64 = bufferToBase64(seed);

    return {
        mnemonic: mnemonic.split(' '),
        seedHex: bufferToHex(seed),
        privateKeyHex: bufferToHex(privateKey),
        publicKeyHex: bufferToHex(publicKey),
        privateKeyB64: bufferToBase64(privateKey),
        publicKeyB64: bufferToBase64(publicKey),
        address,
        evmAddress,
        entropyHex,
        hdIndex: 0,
        hdVersion: 2,
        masterSeedB64
    };
}

/**
 * Import wallet from mnemonic
 * Matches CLI import flow with hd_version=2
 */
export async function importFromMnemonic(mnemonicPhrase: string, hdIndex: number = 0, hdVersion: number = 2): Promise<WalletKeys> {
    const mnemonic = mnemonicPhrase.trim().toLowerCase();

    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
    }

    // Derive seed from mnemonic
    const seed = await mnemonicToSeed(mnemonic);

    // Derive HD seed using Octra protocol
    const hdSeed = await deriveHdSeed(seed, hdIndex, hdVersion);

    // Create Ed25519 keypair
    const keyPair = nacl.sign.keyPair.fromSeed(hdSeed);
    const privateKey = hdSeed;
    const publicKey = keyPair.publicKey;

    // Create address
    const address = await createOctraAddress(publicKey);

    // Derive EVM address
    const evmAddress = deriveEvmAddressFromMnemonic(mnemonic, hdIndex);

    const masterSeedB64 = bufferToBase64(seed);

    return {
        mnemonic: mnemonic.split(' '),
        seedHex: bufferToHex(seed),
        privateKeyHex: bufferToHex(privateKey),
        publicKeyHex: bufferToHex(publicKey),
        privateKeyB64: bufferToBase64(privateKey),
        publicKeyB64: bufferToBase64(publicKey),
        address,
        evmAddress,
        hdIndex,
        hdVersion,
        masterSeedB64
    };
}

/**
 * Import wallet from private key (hex or base64)
 * Matches CLI load_wallet flow
 */
export async function importFromPrivateKey(input: string): Promise<WalletKeys> {
    if (!input) throw new Error('Private key is required');

    let privateKey: Uint8Array;
    let privateKeyB64: string;

    let cleanInput = input.trim();
    if (cleanInput.startsWith('0x')) {
        cleanInput = cleanInput.substring(2);
    }

    // Detect format
    if (/^[a-fA-F0-9]{64}$/.test(cleanInput)) {
        // Hex format (32 bytes = 64 hex chars)
        privateKey = new Uint8Array(hexToBuffer(cleanInput));
        privateKeyB64 = bufferToBase64(privateKey);
    } else if (/^[a-fA-F0-9]{128}$/.test(cleanInput)) {
        // Full 64-byte secret key in hex (sk = seed + pk)
        // CLI stores base64 of first 32 bytes as priv_b64
        const full = new Uint8Array(hexToBuffer(cleanInput));
        privateKey = full.slice(0, 32);
        privateKeyB64 = bufferToBase64(privateKey);
    } else {
        // Assume Base64
        try {
            const decoded = base64ToBuffer(cleanInput);
            if (decoded.length >= 64) {
                // Full 64-byte secret key
                privateKey = new Uint8Array(decoded.slice(0, 32));
                privateKeyB64 = bufferToBase64(privateKey);
            } else if (decoded.length === 32) {
                privateKey = new Uint8Array(decoded);
                privateKeyB64 = cleanInput;
            } else {
                throw new Error('Invalid key length');
            }
        } catch (e) {
            throw new Error('Invalid private key format. Use 64-character hex or base64.');
        }
    }

    if (privateKey.length !== 32) {
        throw new Error('Invalid private key length. Must be 32 bytes (64 hex characters).');
    }

    // Create Ed25519 keypair
    const keyPair = nacl.sign.keyPair.fromSeed(privateKey);
    const publicKey = keyPair.publicKey;

    // Create address
    const address = await createOctraAddress(publicKey);

    // Derive EVM address from private key
    // For EVM, we use the 32-byte seed directly as the private key
    const evmWallet = new ethers.Wallet(bufferToHex(privateKey));
    const evmAddress = evmWallet.address;

    return {
        mnemonic: null,
        privateKeyHex: bufferToHex(privateKey),
        publicKeyHex: bufferToHex(publicKey),
        privateKeyB64,
        publicKeyB64: bufferToBase64(publicKey),
        address,
        evmAddress
    };
}

/**
 * Derive a new HD account from master seed
 * Matches CLI derive_hd_seed for index > 0
 */
export async function deriveHdAccount(masterSeedB64: string, index: number, hdVersion: number = 2): Promise<WalletKeys> {
    const masterSeed = new Uint8Array(base64ToBuffer(masterSeedB64));
    if (masterSeed.length !== 64) {
        throw new Error('Invalid master seed length. Must be 64 bytes.');
    }

    const hdSeed = await deriveHdSeed(masterSeed, index, hdVersion);
    const keyPair = nacl.sign.keyPair.fromSeed(hdSeed);
    const privateKey = hdSeed;
    const publicKey = keyPair.publicKey;
    const address = await createOctraAddress(publicKey);

    // Derive EVM address from master seed if possible
    // Note: masterSeed (64 bytes) can be used to create an HDNode
    let evmAddress: string | undefined;
    try {
        const rootNode = ethers.HDNodeWallet.fromSeed(masterSeed);
        const childNode = rootNode.derivePath(`m/44'/60'/0'/0/${index}`);
        evmAddress = childNode.address;
    } catch (e) {
        console.error('Failed to derive EVM address from seed:', e);
    }
    
    return {
        mnemonic: null,
        privateKeyHex: bufferToHex(privateKey),
        publicKeyHex: bufferToHex(publicKey),
        privateKeyB64: bufferToBase64(privateKey),
        publicKeyB64: bufferToBase64(publicKey),
        address,
        evmAddress,
        hdIndex: index,
        hdVersion,
        masterSeedB64
    };
}

/**
 * Validate mnemonic phrase
 * Matches CLI validate_mnemonic()
 */
export function validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
}

/**
 * Check if input looks like a mnemonic (has 11+ spaces)
 * Matches CLI looks_like_mnemonic()
 */
export function looksLikeMnemonic(input: string): boolean {
    let spaces = 0;
    for (const c of input) {
        if (c === ' ') spaces++;
    }
    return spaces >= 11;
}
