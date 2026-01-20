/**
 * OSM-1 Implementation for Octra Wallet
 * Octra Sign Message Standard
 */

const OSM_VERSION = 'OSM-1';
const MESSAGE_PREFIX = '\x19Octra Signed Message:\n';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Utility functions
export function base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function uint8ArrayToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function base58Encode(bytes) {
    if (bytes.length === 0) return '';
    let num = 0n;
    for (const byte of bytes) {
        num = num * 256n + BigInt(byte);
    }
    let encoded = '';
    while (num > 0n) {
        const remainder = Number(num % 58n);
        num = num / 58n;
        encoded = BASE58_ALPHABET[remainder] + encoded;
    }
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
        encoded = '1' + encoded;
    }
    return encoded;
}

export async function sha256(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
}

export function bufferToHex(buffer) {
    return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Serialize payload with sorted keys (OSM-1 spec)
 */
export function serializePayload(payload) {
    const sortedKeys = Object.keys(payload).sort();
    const sortedPayload = {};
    for (const key of sortedKeys) {
        if (payload[key] !== undefined) {
            sortedPayload[key] = payload[key];
        }
    }
    return JSON.stringify(sortedPayload);
}

/**
 * Create the signing message with OSM-1 prefix
 */
export function createSigningMessage(payload) {
    const serialized = serializePayload(payload);
    return MESSAGE_PREFIX + serialized.length.toString() + '\n' + serialized;
}

/**
 * Create OSM-1 payload for signing
 */
export function createOSM1Payload(options) {
    const { message, address, domain, chainId, expiresIn } = options;

    const payload = {
        version: OSM_VERSION,
        message,
        address,
        domain: domain || 'unknown',
        nonce: crypto.randomUUID(),
        timestamp: Date.now()
    };

    if (chainId !== undefined) {
        payload.chainId = chainId;
    }

    if (expiresIn) {
        payload.expiresAt = Date.now() + expiresIn;
    }

    return payload;
}

/**
 * Verify OSM-1 signature
 */
export async function verifyOSM1Signature(response, nacl, options = {}) {
    try {
        const { expectedDomain, checkExpiry = true } = options;

        // Recreate signing message
        const signedMessage = createSigningMessage(response.payload);
        const messageBytes = new TextEncoder().encode(signedMessage);

        // Decode signature and public key
        const signature = base64ToUint8Array(response.signature);
        const publicKey = base64ToUint8Array(response.publicKey);

        // Verify signature
        const signatureValid = nacl.sign.detached.verify(messageBytes, signature, publicKey);

        // Verify version
        const versionValid = response.payload.version === OSM_VERSION;

        // Verify domain if specified
        const domainMatch = !expectedDomain || response.payload.domain === expectedDomain;

        // Verify not expired
        const notExpired = !checkExpiry || !response.payload.expiresAt || Date.now() < response.payload.expiresAt;

        // Verify address matches public key
        const publicKeyHash = await sha256(publicKey);
        const expectedAddress = 'oct' + base58Encode(publicKeyHash);
        const addressMatch = expectedAddress === response.address;

        return {
            valid: signatureValid && versionValid && domainMatch && notExpired && addressMatch,
            validations: {
                signatureValid,
                versionValid,
                domainMatch,
                notExpired,
                addressMatch
            }
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
}

// OTX-1: Transaction Format
const MICRO_UNITS = 1_000_000;

export function octToMicro(oct) {
    const str = oct.toString();
    const parts = str.split('.');
    let intPart = parts[0];
    let fracPart = parts[1] || '';
    fracPart = fracPart.padEnd(6, '0').substring(0, 6);
    const result = (intPart + fracPart).replace(/^0+/, '') || '0';
    return result;
}

export function microToOct(micro) {
    const num = BigInt(micro);
    return Number(num) / MICRO_UNITS;
}

/**
 * Create transaction payload (OTX-1)
 */
export function createTransactionPayload(options) {
    const { from, to, amount, nonce, message } = options;

    const amountMicro = typeof amount === 'string' ? amount : octToMicro(amount);
    const amountNum = typeof amount === 'string' ? microToOct(amount) : amount;

    const payload = {
        from,
        to_: to,
        amount: amountMicro,
        nonce: Number(nonce),
        ou: amountNum < 1000 ? '1' : '3',
        timestamp: Date.now() / 1000
    };

    return { payload, message };
}

export { OSM_VERSION, MESSAGE_PREFIX };
