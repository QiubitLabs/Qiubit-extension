import { STORAGE_KEYS } from '../../constants';
import { encryptDataSecure, decryptDataSecure } from './encryption';
import { storage } from './adapter';

/**
 * Save balance cache securely (Encrypted)
 */
export async function saveBalanceCacheSecure(address: string, data: any, password: string): Promise<void> {
    if (!password || !address) return;

    try {
        const vaultData = await encryptDataSecure(data, password);
        const encrypted = JSON.stringify(vaultData);
        // Use address-specific key to avoid huge blob for all accounts
        const key = `${STORAGE_KEYS.BALANCE_CACHE}_${address}`;

        await storage.set({ [key]: encrypted });
    } catch (error) {
        console.warn('[Storage] Failed to save balance cache:', error);
    }
}

/**
 * Get balance cache securely
 */
export async function getBalanceCacheSecure(address: string, password: string): Promise<any | null> {
    if (!password || !address) return null;

    try {
        const key = `${STORAGE_KEYS.BALANCE_CACHE}_${address}`;
        const result = await storage.get(key);
        const encrypted = (result[key] as string) || null;

        if (!encrypted) return null;

        const vaultData = encrypted.startsWith('{') ? JSON.parse(encrypted) : encrypted;
        return await decryptDataSecure(vaultData, password);
    } catch (error) {
        console.warn('[Storage] Failed to load balance cache:', error);
        return null;
    }
}

/**
 * Save token cache securely
 */
export async function saveTokenCacheSecure(address: string, tokens: any[], password: string): Promise<void> {
    if (!password || !address) return;

    try {
        const vaultData = await encryptDataSecure(tokens, password);
        const encrypted = JSON.stringify(vaultData);
        const key = `${STORAGE_KEYS.TOKEN_CACHE}_${address}`;

        await storage.set({ [key]: encrypted });
    } catch (error) {
        console.warn('[Storage] Failed to save token cache:', error);
    }
}

/**
 * Get token cache securely
 */
export async function getTokenCacheSecure(address: string, password: string): Promise<any[] | null> {
    if (!password || !address) return null;

    try {
        const key = `${STORAGE_KEYS.TOKEN_CACHE}_${address}`;
        const result = await storage.get(key);
        const encrypted = (result[key] as string) || null;

        if (!encrypted) return null;

        const vaultData = encrypted.startsWith('{') ? JSON.parse(encrypted) : encrypted;
        return await decryptDataSecure(vaultData, password);
    } catch (error) {
        console.warn('[Storage] Failed to load token cache:', error);
        return null;
    }
}

/**
 * Save custom tokens securely
 */
export async function saveCustomTokensSecure(tokens: any, password: string): Promise<void> {
    if (!password) return;

    try {
        const vaultData = await encryptDataSecure(tokens, password);
        const encrypted = JSON.stringify(vaultData);

        await storage.set({ [STORAGE_KEYS.CUSTOM_TOKENS]: encrypted });
    } catch (error) {
        console.warn('[Storage] Failed to save custom tokens:', error);
    }
}

/**
 * Load custom tokens securely
 */
export async function loadCustomTokensSecure(password: string): Promise<any> {
    if (!password) return {};

    try {
        const result = await storage.get(STORAGE_KEYS.CUSTOM_TOKENS);
        const encrypted = (result[STORAGE_KEYS.CUSTOM_TOKENS] as string) || null;

        if (!encrypted) return {};

        const vaultData = encrypted.startsWith('{') ? JSON.parse(encrypted) : encrypted;
        const tokens = await decryptDataSecure(vaultData, password);
        return tokens || {};
    } catch (error) {
        console.warn('[Storage] Failed to load custom tokens:', error);
        return {};
    }
}

/**
 * Save privacy balance cache securely
 */
export async function savePrivacyBalanceCacheSecure(address: string, data: any, password: string): Promise<void> {
    if (!password || !address) return;

    try {
        const vaultData = await encryptDataSecure(data, password);
        const encrypted = JSON.stringify(vaultData);
        const key = `${STORAGE_KEYS.PRIVACY_BALANCE_CACHE}_${address}`;

        await storage.set({ [key]: encrypted });
    } catch (error) {
        console.warn('[Storage] Failed to save privacy balance cache:', error);
    }
}

/**
 * Get privacy balance cache securely
 */
export async function getPrivacyBalanceCacheSecure(address: string, password: string): Promise<any | null> {
    if (!password || !address) return null;

    try {
        const key = `${STORAGE_KEYS.PRIVACY_BALANCE_CACHE}_${address}`;
        const result = await storage.get(key);
        const encrypted = (result[key] as string) || null;

        if (!encrypted) return null;

        const vaultData = encrypted.startsWith('{') ? JSON.parse(encrypted) : encrypted;
        return await decryptDataSecure(vaultData, password);
    } catch (error) {
        console.warn('[Storage] Failed to load privacy balance cache:', error);
        return null;
    }
}

/**
 * Clear privacy balance cache
 */
export async function clearPrivacyBalanceCacheSecure(address: string): Promise<void> {
    if (!address) return;

    const key = `${STORAGE_KEYS.PRIVACY_BALANCE_CACHE}_${address}`;
    await storage.remove([key]);
}

/**
 * Save public cache (No encryption)
 */
export async function savePublicCache(key: string, data: any): Promise<void> {
    try {
        const stored = JSON.stringify(data);
        await storage.set({ [key]: stored });
    } catch (error) {
        console.warn('[Storage] Failed to save public cache:', error);
    }
}

/**
 * Get public cache (No encryption)
 */
export async function getPublicCache(key: string): Promise<any | null> {
    try {
        const result = await storage.get(key);
        const stored = (result[key] as string) || null;

        if (!stored) return null;
        return JSON.parse(stored);
    } catch (error) {
        console.warn('[Storage] Failed to load public cache:', error);
        return null;
    }
}
