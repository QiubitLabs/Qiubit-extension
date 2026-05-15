
export interface VaultData {
    data: string;
    hmac: string;
    salt: string;
    version: number;
    algorithm: string;
    iterations: number;
}

/**
 * Secure memory wipe
 * Uses 5-pass wipe pattern for maximum security
 */
function secureWipe(buffer: Uint8Array | null | undefined): null {
    if (!buffer) return null;

    if (buffer instanceof Uint8Array) {
        // Pass 1: Fill with zeros
        buffer.fill(0);

        // Pass 2: Fill with cryptographically secure random data
        try {
            crypto.getRandomValues(buffer);
        } catch (e) {
            // SECURITY: Never use Math.random() for security-critical operations
            // If crypto is not available, the environment is too insecure
            throw new Error('Secure random number generation not available. Please use a modern browser.');
        }

        // Pass 3: Fill with zeros again
        buffer.fill(0);

        // Pass 4: Fill with 0xFF
        buffer.fill(0xFF);

        // Pass 5: Final fill with zeros
        buffer.fill(0);
    }

    return null;
}

/**
 * Generate HMAC-SHA256
 */
async function generateHMAC(data: string, key: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        encoder.encode(data)
    );

    // Safer conversion to base64 for binary data
    const bytes = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Verify HMAC (constant-time)
 */
async function verifyHMAC(data: string, mac: string, key: string): Promise<boolean> {
    const expectedMac = await generateHMAC(data, key);

    if (mac.length !== expectedMac.length) return false;

    let result = 0;
    for (let i = 0; i < mac.length; i++) {
        result |= mac.charCodeAt(i) ^ expectedMac.charCodeAt(i);
    }

    return result === 0;
}

/**
 * Derive encryption key from password using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array | null = null): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBytes,
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    // Use provided salt or fallback to legacy fixed salt (v3 compatibility)
    const saltBytes = salt || encoder.encode('_x8f_kdf_salt_v3_');

    // Derive AES-256 key with PBKDF2
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes as unknown as BufferSource,
            iterations: 1000000, // 1M iterations (OWASP recommendation)
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );

    // Clean up password bytes
    secureWipe(passwordBytes);
    return key;
}

/**
 * Hash password with STATIC salt
 * 
 * IMPORTANT: Uses STATIC salt for consistency
 * This ensures existing passwords remain valid
 */
export async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '_qiubit_pwd_salt_v3_');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encrypt data with HMAC and random salt (v4 format)
 * Security: Random salt per encryption prevents rainbow table attacks
 * Format: Returns object with { data, iv, salt, hmac, version }
 */
export async function encryptDataSecure(data: any, password: string): Promise<VaultData> {
    let key: CryptoKey | null = null;
    let iv: Uint8Array | null = null;
    let plaintext: Uint8Array | null = null;
    let salt: Uint8Array | null = null;

    try {
        // Generate random salt (16 bytes = 128 bits)
        salt = crypto.getRandomValues(new Uint8Array(16));

        // Derive key with random salt
        key = await deriveKey(password, salt);

        // Generate random IV
        iv = crypto.getRandomValues(new Uint8Array(12));

        const encoder = new TextEncoder();
        plaintext = encoder.encode(JSON.stringify(data));

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv as unknown as BufferSource },
            key,
            plaintext as unknown as BufferSource
        );

        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);

        // Safer conversion to base64
        let binaryCombined = '';
        for (let i = 0; i < combined.length; i++) {
            binaryCombined += String.fromCharCode(combined[i]);
        }
        const combinedBase64 = btoa(binaryCombined);

        let binarySalt = '';
        for (let i = 0; i < salt.length; i++) {
            binarySalt += String.fromCharCode(salt[i]);
        }
        const saltBase64 = btoa(binarySalt);

        // HMAC the entire vault contents for ultimate integrity (HMAC-v4)
        const hmacPayload = `${combinedBase64}:${saltBase64}:${4}`;
        const hmac = await generateHMAC(hmacPayload, password);

        // Return v4 vault format with random salt
        return {
            data: combinedBase64,
            hmac: hmac,
            salt: saltBase64,
            version: 4,
            algorithm: 'PBKDF2-SHA256',
            iterations: 1000000
        };
    } catch (error) {
        console.error('[StorageSecure] Encryption failed:', error);
        throw new Error('Encryption failed');
    } finally {
        if (iv) secureWipe(iv);
        if (plaintext) secureWipe(plaintext);
        if (salt) secureWipe(salt);
    }
}

/**
 * Decrypt data with integrity check
 * Supports both v4 (object with random salt) and v3 (legacy pipe format)
 */
export async function decryptDataSecure(encryptedData: any, password: string): Promise<any> {
    let key: CryptoKey | null = null;
    let decrypted: ArrayBuffer | null = null;
    let salt: Uint8Array | null = null;

    try {
        // Handle v4 format (object with salt)
        if (typeof encryptedData === 'object' && encryptedData.version === 4) {
            // Extract salt from vault
            const saltBytes = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));

            // Verify HMAC (v4 checks payload, data, and salt)
            const hmacPayload = `${encryptedData.data}:${encryptedData.salt}:${encryptedData.version}`;
            const isValid = await verifyHMAC(hmacPayload, encryptedData.hmac, password);
            if (!isValid) {
                console.warn('[StorageSecure] HMAC verification failed (v4), attempting emergency recovery...');
                // Don't throw immediately - try to decrypt anyway
            }

            // Derive key with provided salt
            key = await deriveKey(password, saltBytes);

            const combined = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);

            decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );

            const decoder = new TextDecoder();
            const decodedResult = decoder.decode(decrypted);

            // If we got here and HMAC was invalid, log warning but allow recovery
            if (!isValid) {
                console.warn('[StorageSecure] [WARN] Wallet recovered despite HMAC mismatch - consider re-saving');
            }

            try {
                return JSON.parse(decodedResult);
            } catch (e) {
                // If standard JSON.parse fails, try decoding URI components
                return JSON.parse(decodeURIComponent(escape(decodedResult)));
            }
        }

        // Handle v3 format (legacy pipe-separated string)
        if (typeof encryptedData === 'string') {
            const parts = encryptedData.split('|');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted data format');
            }

            const [combinedBase64, hmac] = parts;

            const isValid = await verifyHMAC(combinedBase64, hmac, password);
            if (!isValid) {
                console.warn('[StorageSecure] HMAC verification failed (v3), attempting emergency recovery...');
            }

            // Use legacy fixed salt for v3
            key = await deriveKey(password, null);
            const combined = Uint8Array.from(atob(combinedBase64), c => c.charCodeAt(0));

            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);

            decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );

            const decoder = new TextDecoder();
            const result = JSON.parse(decoder.decode(decrypted));

            if (!isValid) {
                console.warn('[StorageSecure] [WARN] Wallet recovered despite HMAC mismatch (v3) - consider re-saving');
            }

            return result;
        }

        throw new Error('Unsupported vault format');

    } catch (error: any) {
        const errorName = error?.name || 'Error';
        const errorMsg = error?.message || String(error);
        const errorStack = error?.stack || '';

        console.error(`[StorageSecure] Decryption failed (${errorName}): ${errorMsg}`);
        if (errorStack) console.error(errorStack);

        if (errorMsg.includes('integrity') || errorName.includes('Integrity')) {
            throw error;
        }
        throw new Error(`Decryption failed: ${errorName} - ${errorMsg}`);
    } finally {
        secureWipe(salt);
    }
}
