import { Buffer } from 'buffer';

// Ensure Buffer is globally available
if (typeof window !== 'undefined' && !window.Buffer) {
    window.Buffer = Buffer;
}

export const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Encode a buffer to base58
 */
export function base58Encode(buffer: Buffer | Uint8Array): string {
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
export function base58Decode(str: string): Buffer {
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
export function bufferToHex(buffer: Buffer | Uint8Array): string {
    return Buffer.from(buffer).toString('hex');
}

/**
 * Convert hex string to buffer
 */
export function hexToBuffer(hex: string): Buffer {
    return Buffer.from(hex, 'hex');
}

/**
 * Convert buffer to base64
 */
export function bufferToBase64(buffer: Buffer | Uint8Array): string {
    return Buffer.from(buffer).toString('base64');
}

/**
 * Convert base64 to buffer
 */
export function base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
}

/**
 * Create SHA256 hash using Web Crypto API
 */
export async function sha256(data: string | Buffer | Uint8Array): Promise<Buffer> {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as unknown as BufferSource);
    return Buffer.from(hashBuffer);
}

/**
 * Create Octra address from public key
 * Matches CLI derive_address(): sha256(pk) -> base58 -> pad to 44 chars -> "oct" + result
 * Total address length is always exactly 47 characters
 */
export async function createOctraAddress(publicKey: Buffer | Uint8Array): Promise<string> {
    const hash = await sha256(publicKey);
    let b58 = base58Encode(hash);
    // CLI pads to exactly 44 chars with leading '1's
    while (b58.length < 44) b58 = '1' + b58;
    return 'oct' + b58;
}

/** @deprecated Use createOctraAddress instead */
export const createQiubitAddress = createOctraAddress;

/**
 * Verify Octra address format
 * CLI enforces: addr.size() == 47 && addr.substr(0,3) == "oct"
 */
export function verifyAddressFormat(address: string): boolean {
    if (!address.startsWith('oct')) return false;
    if (address.length !== 47) return false;

    const base58Part = address.slice(3);
    for (const char of base58Part) {
        if (!BASE58_ALPHABET.includes(char)) return false;
    }

    return true;
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string | null | undefined, startChars: number = 10, endChars: number = 8): string {
    if (!address) return '';
    if (address.length <= startChars + endChars) return address;
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format amount with proper decimals and thousand separators
 * If decimals is 0 or not provided, return the string as is without rounding/truncation.
 */
export function formatAmount(amount: string | number | null | undefined, decimals?: number): string {
    if (amount === null || amount === undefined) return '0';

    let str = typeof amount === 'number' ? amount.toString() : amount;

    // Handle scientific notation if present (e.g. 1e-7)
    if (str.includes('e')) {
        str = Number(amount).toFixed(20).replace(/\.?0+$/, "");
    }

    // If no specific decimal constraint, return the full precision string
    if (decimals === undefined) {
        return str;
    }

    const parts = str.split('.');
    let integerPart = parts[0];
    let fractionalPart = parts[1] || '';

    // Truncate/Pad based on requested decimals
    fractionalPart = fractionalPart.substring(0, decimals);
    while (fractionalPart.length < decimals) {
        fractionalPart += '0';
    }

    // Add thousand separators to integer part
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return decimals > 0 ? `${integerPart}.${fractionalPart}` : integerPart;
}
