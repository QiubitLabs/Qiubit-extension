import { Buffer } from 'buffer';
import nacl from 'tweetnacl';

/**
 * Generate a random session key (exported as hex string)
 */
export function generateSessionKey(): string {
    const key = nacl.randomBytes(32);
    return Buffer.from(key).toString('hex');
}

/**
 * Encrypt string with session key (AES-GCM via Crypto API)
 */
export async function encryptSession(text: string, keyHex: string): Promise<string | null> {
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
        return null;
    }
}

/**
 * Decrypt string with session key
 */
export async function decryptSession(encryptedText: string, keyHex: string): Promise<string | null> {
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
        // OperationError = wrong key or stale data — normal after extension reload
        const msg = err instanceof DOMException ? `${err.name}: ${err.message}` : String(err);
        console.warn('[crypto] Session decryption failed (stale session):', msg);
        return null;
    }
}
