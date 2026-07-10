/**
 * LOGIC: High-level wallet secure storage vault coordinator.
 * Implements Rabbit/MetaMask style password verification (trying decryption rather than simple hash matching), OKX-style dual-write persistence (syncing primary and backup copies of the encrypted vault), auto-recovery from backups, password rotation re-encryptions, wallet additions/renamings, and JSON file exports.
 * EXPORTS:
 *   - saveWalletsSecure (async function)
 *   - loadWalletsSecure (async function)
 *   - verifyPasswordSecure (async function)
 *   - hasWalletsSecure (async function)
 *   - hasPasswordSecure (async function)
 *   - changePasswordSecure (async function)
 *   - exportWalletSecure (function)
 *   - getActiveWalletIndex (async function)
 *   - setActiveWalletIndex (async function)
 *   - addWalletSecure (async function)
 *   - updateWalletNameSecure (async function)
 *   - clearAllDataSecure (async function)
 * FUNCTIONS:
 *   - parseVaultPayload(raw): Parses raw vault data from storage (handling string/object formats).
 *   - saveWalletsSecure(wallets, password): Encrypts the wallet list and writes it to both primary and backup storage keys.
 *   - loadWalletsSecure(password): Attempts to load and decrypt primary wallets; falls back to backup if corrupted, restoring primary on successful backup decryption.
 *   - verifyPasswordSecure(password): Returns true if loadWalletsSecure succeeds using the input password.
 *   - hasWalletsSecure() / hasPasswordSecure(): Evaluates if the primary vault key exists.
 *   - changePasswordSecure(currentPassword, newPassword): Re-encrypts all wallets and updates the password hash.
 *   - exportWalletSecure(wallet, filename): Prompts a local JSON file download containing decrypted keys and mnemonics.
 *   - getActiveWalletIndex() / setActiveWalletIndex(index): Persists the active wallet pointer.
 *   - addWalletSecure(wallet, password): Appends a new wallet to the encrypted array, checking for duplicates.
 *   - updateWalletNameSecure(walletIdOrAddress, name, password): Finds a wallet in the array and edits its name property.
 *   - clearAllDataSecure(): Wipes the entire storage area.
 */

import { STORAGE_KEYS } from "../../constants";
import { logInfo } from "../logger";
import { Wallet } from "../../types";
import { encryptDataSecure, decryptDataSecure } from "./encryption";
import { storage } from "./adapter";

// NOTE: passwords are never stored as a hash. Verification is done by trying to
// decrypt the vault (verifyPasswordSecure), so the PBKDF2 (1M-iteration) work
// factor gates every attempt. A fast static-salt SHA-256 hash used to be
// written here — removed, since a persisted fast hash would be a brute-force
// shortcut around PBKDF2.

/**
 * Save wallets with automatic backup
 * Security: Dual-write to primary + backup for data safety (OKX-pattern)
 * Format: v4 vault with random salt
 */
export async function saveWalletsSecure(
  wallets: Wallet[],
  password: string,
): Promise<void> {
  if (!password) throw new Error("Password required to save wallets");
  const vaultData = await encryptDataSecure(wallets, password);
  const encrypted = JSON.stringify(vaultData);

  await storage.set({
    [STORAGE_KEYS.WALLETS]: encrypted,
    [STORAGE_KEYS.BACKUP_WALLETS]: encrypted,
  });
  logInfo("[StorageSecure] [OK] Saved wallet (primary + backup)");
}

/**
 * Internal helper to handle both string (current saves) and object (legacy direct saves) vault formats.
 */
function parseVaultPayload(raw: any): { encrypted: string; vaultData: any } {
  let encrypted: string;
  let vaultData: any;
  if (typeof raw === "string") {
    encrypted = raw;
    vaultData = raw.startsWith("{") ? JSON.parse(raw) : raw;
  } else {
    encrypted = "[object]";
    vaultData = raw;
  }
  return { encrypted, vaultData };
}

/**
 * Load wallets with automatic backup recovery
 * Safety: Tries primary first, falls back to backup if corrupted (OKX-pattern)
 */
export async function loadWalletsSecure(password: string): Promise<Wallet[]> {
  let encrypted: string | null = null;

  try {
    const result = await storage.get(STORAGE_KEYS.WALLETS);
    const raw = result[STORAGE_KEYS.WALLETS];

    if (!raw) return [];

    const parsed = parseVaultPayload(raw);
    encrypted = parsed.encrypted;
    const vaultData = parsed.vaultData;

    const wallets = await decryptDataSecure(vaultData, password);
    return Array.isArray(wallets) ? wallets : [];
  } catch (primaryError: any) {
    if (
      primaryError.message &&
      primaryError.message.includes("Data integrity check failed")
    ) {
      console.warn(
        "[StorageSecure] [WARN] Primary vault HMAC failed, but may still be recoverable",
      );
      throw primaryError;
    }

    console.warn(
      "[StorageSecure] [WARN] Primary vault failed:",
      primaryError.message,
    );
    console.debug(
      "[StorageSecure] Primary error blob (first 20 chars):",
      encrypted ? encrypted.substring(0, 20) : "null",
    );

    try {
      const result = await storage.get(STORAGE_KEYS.BACKUP_WALLETS);
      const rawBackup = result[STORAGE_KEYS.BACKUP_WALLETS];

      if (!rawBackup) {
        throw new Error("No backup vault found");
      }

      const parsed = parseVaultPayload(rawBackup);
      encrypted = parsed.encrypted;
      const vaultData = parsed.vaultData;
      const wallets = await decryptDataSecure(vaultData, password);

      if (!Array.isArray(wallets)) {
        throw new Error("Invalid wallet data in backup");
      }

      logInfo(
        "[StorageSecure] [OK] Recovered from backup, restoring primary...",
      );
      await saveWalletsSecure(wallets, password);

      return wallets;
    } catch (backupError: any) {
      console.error(
        "[StorageSecure] [ERROR] Both primary and backup failed:",
        backupError.message,
      );
      throw new Error("Cannot load wallets: Both primary and backup corrupted");
    }
  }
}

/**
 * Verify password by attempting to decrypt the wallet vault
 * (Rabby/MetaMask Style - Single Source of Truth)
 */
export async function verifyPasswordSecure(password: string): Promise<boolean> {
  if (!password) return false;

  try {
    const wallets = await loadWalletsSecure(password);

    return Array.isArray(wallets);
  } catch (error) {
    return false;
  }
}

/**
 * Check if any wallets exist
 */
export async function hasWalletsSecure(): Promise<boolean> {
  try {
    const result = await storage.get(STORAGE_KEYS.WALLETS);
    return !!result[STORAGE_KEYS.WALLETS];
  } catch (e) {
    console.warn("[StorageSecure] Failed to check storage:", e);
    return false;
  }
}

/**
 * Check if password is set (Check if Vault exists)
 */
export async function hasPasswordSecure(): Promise<boolean> {
  return await hasWalletsSecure();
}

/**
 * Change password
 * Re-encrypts all wallets with the new password and updates the hash.
 */
export async function changePasswordSecure(
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const isValid = await verifyPasswordSecure(currentPassword);
  if (!isValid) throw new Error("Invalid current password");

  const wallets = await loadWalletsSecure(currentPassword);

  await saveWalletsSecure(wallets, newPassword);

  // Remove any legacy fast password hash left by older builds so it can't be
  // brute-forced offline. Verification relies solely on vault decryption.
  try {
    await storage.remove(STORAGE_KEYS.PASSWORD_HASH);
  } catch {
    /* best-effort cleanup */
  }

  return true;
}

/**
 * Export wallet data to a JSON file
 */
export function exportWalletSecure(wallet: Wallet, filename?: string): void {
  const data = {
    address: wallet.address,
    publicKey: wallet.publicKeyB64,
    privateKey: wallet.privateKeyB64,
    mnemonic: wallet.mnemonic,
    exportedAt: new Date().toISOString(),
    version: "4.0.0-secure",
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `qiubit_secure_backup_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Get/Set active wallet index (unencrypted, just an index)
 */
export async function getActiveWalletIndex(): Promise<number> {
  const result = await storage.get(STORAGE_KEYS.ACTIVE_WALLET);
  const stored = result[STORAGE_KEYS.ACTIVE_WALLET];
  return stored ? parseInt(stored, 10) : 0;
}

export async function setActiveWalletIndex(index: number): Promise<void> {
  await storage.set({ [STORAGE_KEYS.ACTIVE_WALLET]: index.toString() });
}

/**
 * Add a new wallet
 */
export async function addWalletSecure(
  wallet: Wallet,
  password: string,
): Promise<Wallet> {
  const wallets = await loadWalletsSecure(password);

  if (wallets.length > 0 && wallets.some((w) => w.address === wallet.address)) {
    throw new Error("Wallet already exists");
  }

  const walletWithMeta: Wallet = {
    ...wallet,
    name: wallet.name || `Wallet ${wallets.length + 1}`,
    id: crypto.randomUUID(),
  };

  wallets.push(walletWithMeta);
  await saveWalletsSecure(wallets, password);

  if (wallets.length === 1) {
    await setActiveWalletIndex(0);
  }

  return walletWithMeta;
}

/**
 * Update wallet name
 */
export async function updateWalletNameSecure(
  walletIdOrAddress: string,
  name: string,
  password: string,
): Promise<Wallet> {
  const wallets = await loadWalletsSecure(password);

  let wallet = wallets.find((w) => w.id === walletIdOrAddress);
  if (!wallet) {
    wallet = wallets.find(
      (w) =>
        w.address === walletIdOrAddress ||
        (w.address &&
          w.address.toLowerCase() === String(walletIdOrAddress).toLowerCase()),
    );
  }

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  wallet.name = name;
  await saveWalletsSecure(wallets, password);
  return wallet;
}

/**
 * Clear all data
 */
export async function clearAllDataSecure(): Promise<void> {
  await storage.clear();
}
