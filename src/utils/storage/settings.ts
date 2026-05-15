import { STORAGE_KEYS } from '../../constants';
// @ts-ignore
import { encryptDataSecure, decryptDataSecure } from './encryption';
import { storage } from './adapter';

const SETTINGS_PLAIN_KEY = 'octra_settings_plain';

/**
 * Save settings as plaintext (non-sensitive: network, rpcUrl, theme, etc.)
 * These are needed BEFORE user unlocks the wallet.
 */
export function saveSettingsPlain(settings: any): void {
    try {
        localStorage.setItem(SETTINGS_PLAIN_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('[Storage] Failed to save plain settings:', error);
    }
}

/**
 * Load settings from plaintext storage (available without password)
 */
export function loadSettingsPlain(): any {
    try {
        const raw = localStorage.getItem(SETTINGS_PLAIN_KEY);
        if (raw) {
            return JSON.parse(raw);
        }
        return { network: 'mainnet' };
    } catch (error) {
        console.warn('[Storage] Failed to load plain settings:', error);
        return { network: 'mainnet' };
    }
}

/**
 * Save settings securely (Encrypted - for sensitive data)
 */
export async function saveSettingsSecure(settings: any, password: string): Promise<void> {
    if (!password) return;

    try {
        const vaultData = await encryptDataSecure(settings, password);
        const encrypted = JSON.stringify(vaultData);

        await storage.set({ [STORAGE_KEYS.SETTINGS]: encrypted });
    } catch (error) {
        console.warn('[Storage] Failed to save settings:', error);
    }
}

/**
 * Load settings securely
 */
export async function loadSettingsSecure(password: string): Promise<any> {
    if (!password) return null;

    try {
        const result = await storage.get(STORAGE_KEYS.SETTINGS);
        const encrypted = (result[STORAGE_KEYS.SETTINGS] as string) || null;

        if (!encrypted) return null;

        const vaultData = encrypted.startsWith('{') ? JSON.parse(encrypted) : encrypted;
        return await decryptDataSecure(vaultData, password);
    } catch (error) {
        console.warn('[Storage] Failed to load settings:', error);
        return null;
    }
}
