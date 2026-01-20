/**
 * Octra Wallet Cryptographic Utilities
 * Ed25519 keypair generation with BIP39 mnemonic support
 */

import * as bip39 from 'bip39';
import nacl from 'tweetnacl';
import { Buffer } from 'buffer';

// Ensure Buffer is globally available
if (typeof window !== 'undefined') {
    window.Buffer = Buffer;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encode a buffer to base58
 */
export function base58Encode(buffer) {
    if (buffer.length === 0) return '';

    let num = BigInt('0x' + Buffer.from(buffer).toString('hex'));
    let encoded = '';

    while (num > 0n) {
        const remainder = num % 58n;
        num = num / 58n;
        encoded = BASE58_ALPHABET[Number(remainder)] + encoded;
    }

    // Handle leading zeros
    for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
        encoded = '1' + encoded;
    }

    return encoded;
}

/**
 * Decode base58 string to buffer
 */
export function base58Decode(str) {
    if (str.length === 0) return Buffer.alloc(0);

    let num = 0n;
    for (const char of str) {
        const index = BASE58_ALPHABET.indexOf(char);
        if (index === -1) throw new Error('Invalid base58 character');
        num = num * 58n + BigInt(index);
    }

    let hex = num.toString(16);
    if (hex.length % 2) hex = '0' + hex;

    // Count leading zeros
    let leadingZeros = 0;
    for (const char of str) {
        if (char === '1') leadingZeros++;
        else break;
    }

    return Buffer.concat([
        Buffer.alloc(leadingZeros),
        Buffer.from(hex, 'hex')
    ]);
}

/**
 * Convert buffer to hex string
 */
export function bufferToHex(buffer) {
    return Buffer.from(buffer).toString('hex');
}

/**
 * Convert hex string to buffer
 */
export function hexToBuffer(hex) {
    return Buffer.from(hex, 'hex');
}

/**
 * Convert buffer to base64
 */
export function bufferToBase64(buffer) {
    return Buffer.from(buffer).toString('base64');
}

/**
 * Convert base64 to buffer
 */
export function base64ToBuffer(base64) {
    return Buffer.from(base64, 'base64');
}

/**
 * Create SHA256 hash using Web Crypto API
 */
export async function sha256(data) {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    return Buffer.from(hashBuffer);
}

/**
 * Derive master key using HMAC-SHA512
 */
async function deriveMasterKey(seed) {
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode('Octra seed'),
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
    );

    const mac = await crypto.subtle.sign('HMAC', key, seed);
    const macBuffer = Buffer.from(mac);

    return {
        masterPrivateKey: macBuffer.slice(0, 32),
        masterChainCode: macBuffer.slice(32, 64)
    };
}

/**
 * Derive child key for Ed25519 (hardened derivation)
 */
async function deriveChildKeyEd25519(privateKey, chainCode, index) {
    let data;

    if (index >= 0x80000000) {
        // Hardened derivation
        data = Buffer.concat([
            Buffer.from([0x00]),
            privateKey,
            Buffer.from([
                (index >>> 24) & 0xff,
                (index >>> 16) & 0xff,
                (index >>> 8) & 0xff,
                index & 0xff
            ])
        ]);
    } else {
        // Non-hardened derivation
        const keyPair = nacl.sign.keyPair.fromSeed(privateKey);
        const publicKey = Buffer.from(keyPair.publicKey);
        data = Buffer.concat([
            publicKey,
            Buffer.from([
                (index >>> 24) & 0xff,
                (index >>> 16) & 0xff,
                (index >>> 8) & 0xff,
                index & 0xff
            ])
        ]);
    }

    const key = await crypto.subtle.importKey(
        'raw',
        chainCode,
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign']
    );

    const mac = await crypto.subtle.sign('HMAC', key, data);
    const macBuffer = Buffer.from(mac);

    return {
        childPrivateKey: macBuffer.slice(0, 32),
        childChainCode: macBuffer.slice(32, 64)
    };
}

/**
 * Derive key path from seed
 */
async function derivePath(seed, path) {
    const { masterPrivateKey, masterChainCode } = await deriveMasterKey(seed);
    let key = masterPrivateKey;
    let chain = masterChainCode;

    for (const index of path) {
        const derived = await deriveChildKeyEd25519(key, chain, index);
        key = derived.childPrivateKey;
        chain = derived.childChainCode;
    }

    return { key, chain };
}

/**
 * Create Octra address from public key
 */
export async function createOctraAddress(publicKey) {
    const hash = await sha256(publicKey);
    const base58Hash = base58Encode(hash);
    return 'oct' + base58Hash;
}

/**
 * Verify Octra address format
 */
export function verifyAddressFormat(address) {
    if (!address.startsWith('oct')) return false;
    // Base 58 encoding of 32-byte hash can be 43 or 44 chars.
    // Plus 3 chars for 'oct' prefix = 46 or 47.
    if (address.length < 46 || address.length > 47) return false;

    const base58Part = address.slice(3);
    for (const char of base58Part) {
        if (!BASE58_ALPHABET.includes(char)) return false;
    }

    return true;
}

/**
 * Generate new wallet with mnemonic
 */
export async function generateWallet() {
    // Generate 128-bit entropy (12 words)
    const entropy = crypto.getRandomValues(new Uint8Array(16));
    const entropyHex = bufferToHex(entropy);

    // Generate mnemonic
    const mnemonic = bip39.entropyToMnemonic(entropyHex);

    // Derive seed from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Derive master key with Octra-specific derivation path
    const path = [
        0x80000000 + 345, // Purpose (Octra)
        0x80000000 + 0,   // Coin type
        0x80000000 + 0,   // Network
        0x80000000 + 0,   // Contract
        0x80000000 + 0,   // Account
        0x80000000 + 0,   // Token
        0x80000000 + 0,   // Subnet
        0                  // Index
    ];

    const { key: derivedKey, chain: derivedChain } = await derivePath(Buffer.from(seed), path);

    // Create Ed25519 keypair from derived key
    const keyPair = nacl.sign.keyPair.fromSeed(derivedKey);
    const privateKey = Buffer.from(keyPair.secretKey.slice(0, 32));
    const publicKey = Buffer.from(keyPair.publicKey);

    // Create address
    const address = await createOctraAddress(publicKey);

    return {
        mnemonic: mnemonic.split(' '),
        seedHex: bufferToHex(seed),
        privateKeyHex: bufferToHex(privateKey),
        publicKeyHex: bufferToHex(publicKey),
        privateKeyB64: bufferToBase64(privateKey),
        publicKeyB64: bufferToBase64(publicKey),
        address,
        entropyHex
    };
}

/**
 * Import wallet from mnemonic
 */
export async function importFromMnemonic(mnemonicPhrase) {
    const mnemonic = mnemonicPhrase.trim().toLowerCase();

    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
    }

    // Derive seed from mnemonic
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // Derive master key with Octra-specific derivation path
    const path = [
        0x80000000 + 345,
        0x80000000 + 0,
        0x80000000 + 0,
        0x80000000 + 0,
        0x80000000 + 0,
        0x80000000 + 0,
        0x80000000 + 0,
        0
    ];

    const { key: derivedKey } = await derivePath(Buffer.from(seed), path);

    // Create Ed25519 keypair
    const keyPair = nacl.sign.keyPair.fromSeed(derivedKey);
    const privateKey = Buffer.from(keyPair.secretKey.slice(0, 32));
    const publicKey = Buffer.from(keyPair.publicKey);

    // Create address
    const address = await createOctraAddress(publicKey);

    return {
        mnemonic: mnemonic.split(' '),
        seedHex: bufferToHex(seed),
        privateKeyHex: bufferToHex(privateKey),
        publicKeyHex: bufferToHex(publicKey),
        privateKeyB64: bufferToBase64(privateKey),
        publicKeyB64: bufferToBase64(publicKey),
        address
    };
}

/**
 * Import wallet from private key (hex or base64)
 */
export async function importFromPrivateKey(input) {
    if (!input) throw new Error('Private key is required');

    let privateKey;
    let privateKeyB64;

    let cleanInput = input.trim();
    if (cleanInput.startsWith('0x')) {
        cleanInput = cleanInput.substring(2);
    }

    // Detect format
    if (/^[a-fA-F0-9]{64}$/.test(cleanInput)) {
        // Hex format
        privateKey = hexToBuffer(cleanInput);
        privateKeyB64 = bufferToBase64(privateKey);
    } else {
        // Assume Base64
        try {
            privateKey = base64ToBuffer(cleanInput);
            privateKeyB64 = cleanInput;
        } catch (e) {
            throw new Error('Invalid private key format. Use 64-character hex or base64.');
        }
    }

    if (privateKey.length !== 32) {
        throw new Error('Invalid private key length. Must be 32 bytes (64 hex characters).');
    }

    // Create Ed25519 keypair
    const keyPair = nacl.sign.keyPair.fromSeed(privateKey);
    const publicKey = Buffer.from(keyPair.publicKey);

    // Create address
    const address = await createOctraAddress(publicKey);

    return {
        mnemonic: null,
        privateKeyHex: bufferToHex(privateKey),
        publicKeyHex: bufferToHex(publicKey),
        privateKeyB64,
        publicKeyB64: bufferToBase64(publicKey),
        address
    };
}

/**
 * Sign a message with private key
 */
export function signMessage(message, privateKeyB64) {
    const privateKey = base64ToBuffer(privateKeyB64);
    const keyPair = nacl.sign.keyPair.fromSeed(privateKey);

    const messageBytes = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : message;

    const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
    return bufferToBase64(signature);
}

/**
 * Verify a signature
 */
export function verifySignature(message, signature, publicKeyB64) {
    const publicKey = base64ToBuffer(publicKeyB64);
    const signatureBytes = base64ToBuffer(signature);

    const messageBytes = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : message;

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey);
}

/**
 * Create and sign a transaction
 * Now supports dynamic 'ou' via RPC fee estimation
 */
export async function createTransaction(from, to, amount, nonce, privateKeyB64, message = null, fee = null) {
    // FIX: Use string manipulation to avoid floating point errors
    // e.g. 0.29 * 1000000 = 289999.99... (WRONG)
    // We want 0.29 -> 290000 (CORRECT)

    // Convert to string and normalize
    let amountStr = typeof amount === 'number' ? amount.toString() : amount;

    // Handle scientific notation if small
    if (amountStr.includes('e')) {
        amountStr = Number(amount).toFixed(20);
    }

    const parts = amountStr.split('.');
    let integerPart = parts[0];
    let fractionalPart = parts[1] || '';

    // Pad or truncate to 6 decimal places (micro-units)
    if (fractionalPart.length > 6) {
        fractionalPart = fractionalPart.substring(0, 6);
    } else {
        while (fractionalPart.length < 6) {
            fractionalPart += '0';
        }
    }

    // Combine to get raw micro-units
    // Remove leading zeros from integer part unless it's just "0"
    if (integerPart === '0') integerPart = '';

    const amountRaw = integerPart + fractionalPart;
    // If result is emptyString (0.000000), default to '0'. 
    // But usually we send at least 1 micro unit.
    const finalAmount = amountRaw.replace(/^0+/, '') || '0';

    // Operation Unit (ou) calculation - micro-units based
    // Connects to RPC if fee is not provided
    const microUnits = 1_000_000;
    let ouValue;

    if (fee !== null) {
        ouValue = String(Math.floor(parseFloat(fee) * microUnits));
    } else {
        try {
            // Lazy load RPC client to avoid circular dependencies if any
            const { getRpcClient } = await import('./rpc');
            const rpc = getRpcClient();
            const estimates = await rpc.getFeeEstimate(parseFloat(amount));
            ouValue = String(Math.floor(estimates.medium * microUnits));
        } catch (e) {
            // Fallback: 1000 (0.001 OCT) for small tx, 2000 (0.002 OCT) for others
            ouValue = parseFloat(amount) < 0.001 ? '1000' : '2000';
        }
    }

    const tx = {
        from,
        to_: to,
        amount: finalAmount, // String representation of integer micro-units
        nonce: parseInt(nonce),
        ou: ouValue,
        timestamp: Date.now() / 1000
    };

    if (message) {
        tx.message = message;
    }

    // Create signature payload (without message)
    const signPayload = JSON.stringify({
        from: tx.from,
        to_: tx.to_,
        amount: tx.amount,
        nonce: tx.nonce,
        ou: tx.ou,
        timestamp: tx.timestamp
    });

    const signature = signMessage(signPayload, privateKeyB64);
    const privateKey = base64ToBuffer(privateKeyB64);
    const keyPair = nacl.sign.keyPair.fromSeed(privateKey);
    const publicKeyB64 = bufferToBase64(keyPair.publicKey);

    return {
        ...tx,
        signature,
        public_key: publicKeyB64
    };
}

/**
 * Validate Octra address
 */
export function isValidAddress(address) {
    return verifyAddressFormat(address);
}

/**
 * Truncate address for display
 */
export function truncateAddress(address, startChars = 10, endChars = 8) {
    if (!address || address.length <= startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format amount with proper decimals and thousand separators
 * Defaults to 3 decimal places as per user preference
 */
export function formatAmount(amount, decimals = 3) {
    if (amount === null || amount === undefined) return '0.000';

    // Ensure we work with a string to avoid floating point math rounding
    let str = typeof amount === 'number' ? amount.toString() : amount;

    // Handle scientific notation if present (e.g. 1e-7)
    if (str.includes('e')) {
        str = Number(amount).toFixed(20);
    }

    const parts = str.split('.');
    let integerPart = parts[0];
    let fractionalPart = parts[1] || '';

    // Strict truncation: take exactly 'decimals' characters, no rounding
    fractionalPart = fractionalPart.substring(0, decimals);

    // Pad with zeros if needed
    while (fractionalPart.length < decimals) {
        fractionalPart += '0';
    }

    // Add thousand separators to integer part using Intl
    try {
        integerPart = BigInt(integerPart).toLocaleString('en-US');
    } catch (e) {
        // Fallback or just standard regex replacement
        integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    return `${integerPart}.${fractionalPart}`;
}
/**
 * Generate a random session key (exported as hex string)
 */
export function generateSessionKey() {
    const key = nacl.randomBytes(32);
    return Buffer.from(key).toString('hex');
}

/**
 * Encrypt string with session key (AES-GCM via Crypto API)
 */
export async function encryptSession(text, keyHex) {
    if (!text || !keyHex) return null;
    try {
        const keyBuffer = Buffer.from(keyHex, 'hex');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedText = new TextEncoder().encode(text);

        const key = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            'AES-GCM',
            false,
            ['encrypt']
        );

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encodedText
        );

        // Return as IV:Ciphertext (hex)
        const ivHex = Buffer.from(iv).toString('hex');
        const cipherHex = Buffer.from(encrypted).toString('hex');
        return `${ivHex}:${cipherHex}`;
    } catch (err) {
        console.error('[Crypto] Session encryption failed:', err);
        if (typeof crypto === 'undefined') console.error('CRITICAL: Trace 1 - crypto undefined');
        else if (!crypto.subtle) console.error('CRITICAL: Trace 2 - crypto.subtle undefined');

        return null;
    }
}

/**
 * Decrypt string with session key
 */
export async function decryptSession(encryptedText, keyHex) {
    if (!encryptedText || !keyHex) return null;
    try {
        const [ivHex, cipherHex] = encryptedText.split(':');
        if (!ivHex || !cipherHex) return null;

        const keyBuffer = Buffer.from(keyHex, 'hex');
        const iv = new Uint8Array(Buffer.from(ivHex, 'hex'));
        const cipher = Buffer.from(cipherHex, 'hex');

        const key = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            'AES-GCM',
            false,
            ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            cipher
        );

        return new TextDecoder().decode(decrypted);
    } catch (err) {
        console.error('Session decryption failed:', err);
        return null;
    }
}
