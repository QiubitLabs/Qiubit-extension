import { STORAGE_KEYS } from '../../constants';
// @ts-ignore
import { Wallet } from '../../types';
import { encryptDataSecure, decryptDataSecure, hashPassword } from './encryption';
import { storage } from './adapter';

/**
 * Set password
 */
export async function setWalletPasswordSecure(password: string): Promise<void> {
    const hash = await hashPassword(password);
    await storage.set({ [STORAGE_KEYS.PASSWORD_HASH]: hash });
}

/**
 * Save wallets with automatic backup
 * Security: Dual-write to primary + backup for data safety (OKX-pattern)
 * Format: v4 vault with random salt
 */
export async function saveWalletsSecure(wallets: Wallet[], password: string): Promise<void> {
    if (!password) throw new Error('Password required to save wallets');
    const vaultData = await encryptDataSecure(wallets, password);
    const encrypted = JSON.stringify(vaultData);

    await storage.set({
        [STORAGE_KEYS.WALLETS]: encrypted,
        [STORAGE_KEYS.BACKUP_WALLETS]: encrypted
    });
    console.log('[StorageSecure] [OK] Saved wallet (primary + backup)');
}

/**
 * Load wallets with automatic backup recovery
 * Safety: Tries primary first, falls back to backup if corrupted (OKX-pattern)
 */
export async function loadWalletsSecure(password: string): Promise<Wallet[]> {
    let encrypted: string | null = null;

    try {
        // Try loading primary vault
        const result = await storage.get(STORAGE_KEYS.WALLETS);
        const raw = result[STORAGE_KEYS.WALLETS];

        if (!raw) return [];

        // Handle both string (current saves) and object (legacy direct saves)
        let vaultData: any;
        if (typeof raw === 'string') {
            encrypted = raw;
            vaultData = raw.startsWith('{') ? JSON.parse(raw) : raw;
        } else {
            encrypted = '[object]';
            vaultData = raw;
        }

        // Decrypt primary vault
        const wallets = await decryptDataSecure(vaultData, password);
        return Array.isArray(wallets) ? wallets : [];

    } catch (primaryError: any) {
        // Only fallback to backup if decryption actually failed
        // HMAC warnings are logged but don't trigger fallback
        if (primaryError.message && primaryError.message.includes('Data integrity check failed')) {
            console.warn('[StorageSecure] [WARN] Primary vault HMAC failed, but may still be recoverable');
            // Don't fallback - the emergency recovery in decryptDataSecure will handle it
            throw primaryError;
        }

        console.warn('[StorageSecure] [WARN] Primary vault failed:', primaryError.message);
        console.debug('[StorageSecure] Primary error blob (first 20 chars):', encrypted ? encrypted.substring(0, 20) : 'null');

        try {
            // Fallback to backup vault
            const result = await storage.get(STORAGE_KEYS.BACKUP_WALLETS);
            const rawBackup = result[STORAGE_KEYS.BACKUP_WALLETS];

            if (!rawBackup) {
                throw new Error('No backup vault found');
            }

            // Handle both string (current saves) and object (legacy direct saves)
            let vaultData: any;
            if (typeof rawBackup === 'string') {
                encrypted = rawBackup;
                vaultData = rawBackup.startsWith('{') ? JSON.parse(rawBackup) : rawBackup;
            } else {
                encrypted = '[object]';
                vaultData = rawBackup;
            }
            const wallets = await decryptDataSecure(vaultData, password);

            if (!Array.isArray(wallets)) {
                throw new Error('Invalid wallet data in backup');
            }

            // Auto-restore primary from backup
            console.log('[StorageSecure] [OK] Recovered from backup, restoring primary...');
            await saveWalletsSecure(wallets, password);

            return wallets;

        } catch (backupError: any) {
            console.error('[StorageSecure] [ERROR] Both primary and backup failed:', backupError.message);
            throw new Error('Cannot load wallets: Both primary and backup corrupted');
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
        // Try to load and decrypt the wallets
        // If this succeeds, the password is 100% correct
        const wallets = await loadWalletsSecure(password);

        // Extra check: ensure we actually got valid data back
        return Array.isArray(wallets);
    } catch (error) {
        // Decryption failed = Wrong Password
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
        console.warn('[StorageSecure] Failed to check storage:', e);
        return false;
    }
}

/**
 * Check if password is set (Check if Vault exists)
 */
export async function hasPasswordSecure(): Promise<boolean> {
    // If we have a wallet vault, we have a password. Simple.
    return await hasWalletsSecure();
}

/**
 * Change password
 * Re-encrypts all wallets with the new password and updates the hash.
 */
export async function changePasswordSecure(currentPassword: string, newPassword: string): Promise<boolean> {
    // 1. Verify current password (supports legacy/new hybrid check)
    const isValid = await verifyPasswordSecure(currentPassword);
    if (!isValid) throw new Error('Invalid current password');

    // 2. Load all wallets using current password
    const wallets = await loadWalletsSecure(currentPassword);

    // 3. Re-encrypt and save wallets with new password (FORCE v4 format)
    await saveWalletsSecure(wallets, newPassword);

    // 4. Update stored password hash
    await setWalletPasswordSecure(newPassword);

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
        version: '4.0.0-secure'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
    // NOTE: Changed to Async because chrome.storage is async
    const result = await storage.get(STORAGE_KEYS.ACTIVE_WALLET);
    const stored = result[STORAGE_KEYS.ACTIVE_WALLET];
    return stored ? parseInt(stored, 10) : 0;
}

export async function setActiveWalletIndex(index: number): Promise<void> {
    // NOTE: Changed to Async
    await storage.set({ [STORAGE_KEYS.ACTIVE_WALLET]: index.toString() });
}

/**
 * Add a new wallet
 */
export async function addWalletSecure(wallet: Wallet, password: string): Promise<Wallet> {
    const wallets = await loadWalletsSecure(password);

    // Check for duplicate address (skip if this is first wallet from fresh start)
    if (wallets.length > 0 && wallets.some(w => w.address === wallet.address)) {
        throw new Error('Wallet already exists');
    }

    // Add wallet with metadata
    const walletWithMeta: Wallet = {
        ...wallet,
        name: wallet.name || `Wallet ${wallets.length + 1}`,
        id: crypto.randomUUID(),
    };

    wallets.push(walletWithMeta);
    await saveWalletsSecure(wallets, password);

    // Set as active if first wallet
    if (wallets.length === 1) {
        await setActiveWalletIndex(0);
    }

    return walletWithMeta;
}

/**
 * Update wallet name
 */
export async function updateWalletNameSecure(walletIdOrAddress: string, name: string, password: string): Promise<Wallet> {
    const wallets = await loadWalletsSecure(password);

    // Find wallet by ID or Address
    let wallet = wallets.find(w => w.id === walletIdOrAddress);
    if (!wallet) {
        wallet = wallets.find(w =>
            w.address === walletIdOrAddress ||
            (w.address && w.address.toLowerCase() === String(walletIdOrAddress).toLowerCase())
        );
    }

    if (!wallet) {
        throw new Error('Wallet not found');
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
