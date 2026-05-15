import { STORAGE_KEYS } from '../../constants';
// @ts-ignore
import { encryptDataSecure, decryptDataSecure } from './encryption';
import { storage } from './adapter';

interface PrivacyLogs {
    [hash: string]: any;
}

/**
 * Load all privacy transaction logs
 */
export async function loadPrivacyLogsSecure(password: string): Promise<PrivacyLogs> {
    if (!password) return {};

    try {
        const result = await storage.get(STORAGE_KEYS.PRIVACY_LOGS);
        const encrypted = (result[STORAGE_KEYS.PRIVACY_LOGS] as string) || null;

        if (!encrypted) return {};

        // Parse vault (handles both v4 object and v3 string)
        const vaultData = encrypted.startsWith('{') ? JSON.parse(encrypted) : encrypted;
        const logs = await decryptDataSecure(vaultData, password);
        return logs || {};
    } catch (error) {
        console.warn('[PrivacyStorage] Failed to load logs:', error);
        return {}; // Return empty if can't decrypt
    }
}

/**
 * Save privacy transaction log (REQUIRED password - no fallback)
 * Used for shield/unshield/private transfer logs
 */
export async function savePrivacyTransactionSecure(hash: string, type: string, details: any = {}, password: string): Promise<void> {
    if (!password) {
        throw new Error('Password required for privacy transaction storage');
    }

    try {
        // Load existing logs
        const logs = await loadPrivacyLogsSecure(password);

        // Add new transaction
        logs[hash] = {
            type,
            timestamp: Date.now(),
            ...details
        };

        // Encrypt and save (v4 format)
        const vaultData = await encryptDataSecure(logs, password);
        const encrypted = JSON.stringify(vaultData);

        await storage.set({ [STORAGE_KEYS.PRIVACY_LOGS]: encrypted });

        console.log(`[PrivacyStorage] Transaction ${hash} saved (encrypted)`);
    } catch (error) {
        console.error('[PrivacyStorage] Failed to save transaction:', error);
        throw error;
    }
}

/**
 * Get specific privacy transaction
 */
export async function getPrivacyTransactionSecure(hash: string, password: string): Promise<any> {
    const logs = await loadPrivacyLogsSecure(password);
    return logs[hash] || null;
}

/**
 * Get all privacy transactions as an array
 */
export async function getAllPrivacyTransactionsSecure(password: string): Promise<any[]> {
    const logs = await loadPrivacyLogsSecure(password);
    // Convert map to array and sort by timestamp desc
    return Object.values(logs).sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
}
