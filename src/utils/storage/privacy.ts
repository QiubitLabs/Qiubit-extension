/**
 * LOGIC: Handles secure persistence of FHE (Fully Homomorphic Encryption) privacy transaction logs (shield/unshield/private transfer).
 * Reads, appends, and encrypts logs to local storage under a password-based vault wrapper to preserve transaction metadata privacy.
 * EXPORTS:
 *   - loadPrivacyLogsSecure (async function)
 *   - savePrivacyTransactionSecure (async function)
 *   - getPrivacyTransactionSecure (async function)
 *   - getAllPrivacyTransactionsSecure (async function)
 * FUNCTIONS:
 *   - loadPrivacyLogsSecure(password): Pulls and decrypts all privacy log objects from storage.
 *   - savePrivacyTransactionSecure(hash, type, details, password): Decrypts existing logs, appends the new FHE transaction log, encrypts the collection, and persists it.
 *   - getPrivacyTransactionSecure(hash, password): Decrypts and retrieves details for a single transaction hash.
 *   - getAllPrivacyTransactionsSecure(password): Decrypts logs and returns them as an array sorted in descending chronological order.
 */

import { STORAGE_KEYS } from "../../constants";
import { logInfo } from "../logger";
import { encryptDataSecure, decryptDataSecure } from "./encryption";
import { storage } from "./adapter";

interface PrivacyLogs {
  [hash: string]: any;
}

/**
 * Load all privacy transaction logs
 */
export async function loadPrivacyLogsSecure(
  password: string,
): Promise<PrivacyLogs> {
  if (!password) return {};

  try {
    const result = await storage.get(STORAGE_KEYS.PRIVACY_LOGS);
    const encrypted = (result[STORAGE_KEYS.PRIVACY_LOGS] as string) || null;

    if (!encrypted) return {};

    const vaultData = encrypted.startsWith("{")
      ? JSON.parse(encrypted)
      : encrypted;
    const logs = await decryptDataSecure(vaultData, password);
    return logs || {};
  } catch (error) {
    console.warn("[PrivacyStorage] Failed to load logs:", error);
    return {}; // Return empty if can't decrypt
  }
}

/**
 * Save privacy transaction log (REQUIRED password - no fallback)
 * Used for shield/unshield/private transfer logs
 */
export async function savePrivacyTransactionSecure(
  hash: string,
  type: string,
  details: any = {},
  password: string,
): Promise<void> {
  if (!password) {
    throw new Error("Password required for privacy transaction storage");
  }

  try {
    const logs = await loadPrivacyLogsSecure(password);

    logs[hash] = {
      type,
      timestamp: Date.now(),
      ...details,
    };

    const vaultData = await encryptDataSecure(logs, password);
    const encrypted = JSON.stringify(vaultData);

    await storage.set({ [STORAGE_KEYS.PRIVACY_LOGS]: encrypted });

    logInfo(`[PrivacyStorage] Transaction ${hash} saved (encrypted)`);
  } catch (error) {
    console.error("[PrivacyStorage] Failed to save transaction:", error);
    throw error;
  }
}

/**
 * Get specific privacy transaction
 */
export async function getPrivacyTransactionSecure(
  hash: string,
  password: string,
): Promise<any> {
  const logs = await loadPrivacyLogsSecure(password);
  return logs[hash] || null;
}

/**
 * Get all privacy transactions as an array
 */
export async function getAllPrivacyTransactionsSecure(
  password: string,
): Promise<any[]> {
  const logs = await loadPrivacyLogsSecure(password);
  return Object.values(logs).sort(
    (a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0),
  );
}
