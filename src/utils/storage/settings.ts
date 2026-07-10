/**
 * LOGIC: Handles wallet setting storage, supporting both synchronous plaintext settings (stored in localStorage for fast UI rendering before unlock) and secure encrypted settings (saved asynchronously through the storage adapter using password-derived keys).
 * EXPORTS:
 *   - saveSettingsPlain (function)
 *   - loadSettingsPlain (function)
 *   - saveSettingsSecure (async function)
 *   - loadSettingsSecure (async function)
 * FUNCTIONS:
 *   - saveSettingsPlain(settings) / loadSettingsPlain(): Synchronous settings accessors using native localStorage (defaulting network to 'mainnet').
 *   - saveSettingsSecure(settings, password) / loadSettingsSecure(password): Encrypts or decrypts sensitive settings via PBKDF2/AES-GCM before writing to/reading from the storage adapter.
 */

import { STORAGE_KEYS } from "../../constants";
import { encryptDataSecure, decryptDataSecure } from "./encryption";
import { storage } from "./adapter";

const SETTINGS_PLAIN_KEY = "octra_settings_plain";

/**
 * Save settings as plaintext (non-sensitive: network, rpcUrl, theme, etc.)
 * These are needed BEFORE user unlocks the wallet.
 */
export function saveSettingsPlain(settings: any): void {
  try {
    localStorage.setItem(SETTINGS_PLAIN_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("[Storage] Failed to save plain settings:", error);
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
    return { network: "mainnet" };
  } catch (error) {
    console.warn("[Storage] Failed to load plain settings:", error);
    return { network: "mainnet" };
  }
}

/**
 * Save settings securely (Encrypted - for sensitive data)
 */
export async function saveSettingsSecure(
  settings: any,
  password: string,
): Promise<void> {
  if (!password) return;

  try {
    const vaultData = await encryptDataSecure(settings, password);
    const encrypted = JSON.stringify(vaultData);

    await storage.set({ [STORAGE_KEYS.SETTINGS]: encrypted });
  } catch (error) {
    console.warn("[Storage] Failed to save settings:", error);
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

    const vaultData = encrypted.startsWith("{")
      ? JSON.parse(encrypted)
      : encrypted;
    return await decryptDataSecure(vaultData, password);
  } catch (error) {
    console.warn("[Storage] Failed to load settings:", error);
    return null;
  }
}
