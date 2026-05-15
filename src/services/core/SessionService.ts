import { keyringService } from './KeyringService';
import { verifyPasswordSecure, storage } from '../../utils/storage';
import { encryptSession, generateSessionKey, decryptSession } from '../../utils/crypto';

// Session duration constant (5 minutes)
const SESSION_DURATION = 5 * 60 * 1000;

export const AUTO_LOCK_DURATIONS = {
    '1min': 60_000,
    '5min': 5 * 60_000,
    '15min': 15 * 60_000,
    '1hr': 60 * 60_000,
    'never': 0
} as const;

export type AutoLockDuration = keyof typeof AUTO_LOCK_DURATIONS;

/**
 * SessionService - Manages user session, authentication, and background sync.
 * 
 * Responsibilities:
 * - Login/Logout (State State)
 * - Session Encryption/Decryption
 * - Synchronization with Chrome background script
 * - Auto-lock timer management
 */
class SessionServiceImpl {
    private static _instance: SessionServiceImpl | null = null;
    private _sessionKey: string | null = null;
    private _sessionExpiry: number | null = null;
    private _autoLockDuration: number = AUTO_LOCK_DURATIONS['5min'];
    private _lastActivity: number = Date.now();
    private _autoLockTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        if (SessionServiceImpl._instance) {
            return SessionServiceImpl._instance;
        }
        SessionServiceImpl._instance = this;
    }

    setAutoLockDuration(key: AutoLockDuration): void {
        this._autoLockDuration = AUTO_LOCK_DURATIONS[key];
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ qiubit_auto_lock: key });
        }
        this._scheduleAutoLock();
    }

    async loadAutoLockSetting(): Promise<void> {
        try {
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                const result = await chrome.storage.local.get('qiubit_auto_lock');
                const key = result.qiubit_auto_lock as AutoLockDuration;
                if (key && key in AUTO_LOCK_DURATIONS) {
                    this._autoLockDuration = AUTO_LOCK_DURATIONS[key];
                }
            }
        } catch { /* ignore */ }
    }

    recordActivity(): void {
        this._lastActivity = Date.now();
        this._scheduleAutoLock();
    }

    private _scheduleAutoLock(): void {
        if (this._autoLockTimer) clearTimeout(this._autoLockTimer);
        if (this._autoLockDuration === 0 || !this.isValid()) return;
        this._autoLockTimer = setTimeout(() => {
            if (Date.now() - this._lastActivity >= this._autoLockDuration) {
                this.logout().catch(() => {});
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('wallet:auto-locked'));
                }
            }
        }, this._autoLockDuration);
    }

    /**
     * Get active session key (internal/memory only)
     */
    getSessionKey(): string | null {
        return this._sessionKey;
    }

    /**
     * Check if session is valid
     */
    isValid(): boolean {
        if (!this._sessionKey || !this._sessionExpiry) return false;
        return Date.now() < this._sessionExpiry;
    }

    /**
     * Extend session duration
     */
    extendSession() {
        if (this.isValid()) {
            this._sessionExpiry = Date.now() + SESSION_DURATION;
            this.recordActivity();
            this.persistSessionExpiry().catch(err => console.error('[Session] Failed to persist expiry:', err));
            this.syncSessionToBackground();
        }
    }

    /**
     * Login sequence
     * 1. Verify password
     * 2. Unlock Keyring
     * 3. Generate Session Key
     * 4. Sync to Background
     */
    async login(password: string, wallets: any[]): Promise<boolean> {
        try {
            // 1. Verify Password
            const isValid = await verifyPasswordSecure(password);
            if (!isValid) throw new Error('Invalid password');

            // 2. Unlock Keyring
            await keyringService.unlock(password, wallets);

            // 3. Generate Session
            this._sessionKey = generateSessionKey();
            this._sessionExpiry = Date.now() + SESSION_DURATION;

            // 4. Persist (Encrypted) & Sync
            await this.saveSessionSecure(password);
            await this.syncSessionToBackground();

            return true;
        } catch (error) {
            console.error('[SessionService] Login failed:', error);
            // Ensure we clean up if partially failed
            await this.logout();
            throw error;
        }
    }

    /**
     * Logout sequence
     */
    async logout(): Promise<void> {
        // 1. Clear Memory
        this._sessionKey = null;
        this._sessionExpiry = null;

        // 2. Clear Keyring
        keyringService.lock();

        // 3. Clear Storage
        await storage.remove(['qiubit_session_data', 'qiubit_session_expiry', 'qiubit_session_key']);

        // 4. Clear Background
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            try {
                chrome.runtime.sendMessage({ type: 'SYNC_SESSION', session: null });
            } catch (e) { /* ignore extension context invalidated */ }

            if (chrome.storage) {
                if (chrome.storage.session) await chrome.storage.session.remove('dapp_wallet_session');
                // Use adapter for local storage cleanups if possible, but 'dapp_active_wallet' might be used by content script directly?
                // If so, adapter also writes to local storage, so explicit remove via adapter is better if we want to use adapter.
                // But 'dapp_active_wallet' is likely used by content script which might not use our adapter?
                // Actually content script runs in different context.
                // Safe to use chrome.storage.local directly here if we want to be sure,
                // BUT adapter is just a wrapper around chrome.storage.local in extension mode.
                // So calling storage.remove('dapp_active_wallet') is same as chrome.storage.local.remove('dapp_active_wallet').
                await storage.remove('dapp_active_wallet');
            }
        }
    }

    /**
     * Restore session from storage (Auto-login)
     */
    async restoreSession(): Promise<string | null> {
        try {
            const result = await storage.get(['qiubit_session_expiry', 'qiubit_session_data', 'qiubit_session_key']);
            const expiryStr = result['qiubit_session_expiry'];

            if (!expiryStr) return null;

            const expiry = parseInt(expiryStr, 10);
            if (Date.now() > expiry) {
                await this.logout(); // Expired
                return null;
            }

            const encryptedData = result['qiubit_session_data'];
            // We need the session key to decrypt. 
            // SECURITY NOTE: In this architecture, the session key for *storage* encryption 
            // was previously stored in localStorage ('qiubit_session_key').
            // We maintain this for now to match strict existing logic.
            const storageKey = result['qiubit_session_key'];

            if (encryptedData && storageKey) {
                const password = await decryptSession(encryptedData, storageKey);
                if (password && await verifyPasswordSecure(password)) {
                    // Session restored! 
                    // Note: We generate a NEW ephemeral session key for this active memory session
                    this._sessionKey = generateSessionKey();
                    this._sessionExpiry = expiry;

                    return password;
                }
            }
        } catch (error) {
            console.error('[SessionService] Restore failed:', error);
        }

        await this.logout();
        return null;
    }

    /**
     * Save session securely to storage
     */
    private async saveSessionSecure(password: string): Promise<void> {
        if (!this._sessionKey) return; // Should not happen

        // For storage persistence, we need a stable key or one derived from password.
        // Current architecture uses a randomly generated key stored in storage.
        const result = await storage.get('qiubit_session_key');
        let storageKey = result['qiubit_session_key'];

        if (!storageKey) {
            storageKey = generateSessionKey();
            await storage.set({ 'qiubit_session_key': storageKey });
        }

        const encryptedPwd = await encryptSession(password, storageKey);
        if (encryptedPwd) {
            await storage.set({ 'qiubit_session_data': encryptedPwd });
            await this.persistSessionExpiry();
        }
    }

    private async persistSessionExpiry() {
        if (this._sessionExpiry) {
            await storage.set({ 'qiubit_session_expiry': this._sessionExpiry.toString() });
        }
    }

    /**
     * Sync session to Chrome Background (Content Script / Extension support)
     */
    async syncSessionToBackground(): Promise<void> {
        if (!this._sessionKey || !keyringService.isUnlocked()) return;

        // Detect environment
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return;

        try {
            // Get Active Wallet
            const addresses = keyringService.getAddresses();
            if (addresses.length === 0) return;

            // For now, sync the first address as "active" 
            const activeAddress = addresses[0];
            const activePk = keyringService.getPrivateKey(activeAddress);
            const publicKey = keyringService.getPublicKey(activeAddress);

            if (activePk && publicKey) {
                // Ephemeral key for BACKGROUND transport (Hex format)
                const ephemeralKey = generateSessionKey();

                // Use shared encryptSession (returns iv:cipher string)
                const encryptedPk = await encryptSession(activePk, ephemeralKey);

                const sessionData = {
                    address: activeAddress,
                    publicKey: publicKey,
                    encryptedPrivateKey: encryptedPk, // Hex:Hex format
                    network: 'testnet',
                    timestamp: Date.now()
                };

                // 1. Save to Session Storage
                await chrome.storage.session.set({
                    dapp_wallet_session: JSON.stringify(sessionData)
                });

                // 2. Send to Runtime (Background)
                if (chrome.runtime) {
                    chrome.runtime.sendMessage({
                        type: 'SYNC_SESSION',
                        data: { sessionKey: ephemeralKey } // Sending Hex Key
                    });

                    setTimeout(() => {
                        chrome.runtime.sendMessage({
                            type: 'SYNC_SESSION',
                            session: sessionData
                        });
                    }, 50);
                }
            }
        } catch (e) {
            // ignore
        }
    }

    /**
     * Update active wallet synchronization
     */
    async syncActiveWalletToBackground(address: string, network: string = 'testnet') {
        if (!this._sessionKey) return;

        try {
            // Ensure keyring has this address unlocked
            const activePk = keyringService.getPrivateKey(address);
            const publicKey = keyringService.getPublicKey(address);

            if (activePk && publicKey) {
                const ephemeralKey = generateSessionKey();
                const encryptedPk = await encryptSession(activePk, ephemeralKey);

                const sessionData = {
                    address: address,
                    publicKey: publicKey,
                    encryptedPrivateKey: encryptedPk,
                    network: network,
                    timestamp: Date.now()
                };

                if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
                    await chrome.storage.session.set({
                        dapp_wallet_session: JSON.stringify(sessionData)
                    });
                }

                if (typeof chrome !== 'undefined' && chrome.runtime) {
                    chrome.runtime.sendMessage({
                        type: 'SYNC_SESSION',
                        data: { sessionKey: ephemeralKey }
                    });
                    chrome.runtime.sendMessage({
                        type: 'SYNC_SESSION',
                        session: sessionData
                    });
                }
            }
        } catch (error) {
            console.error('[SessionService] Active wallet sync failed:', error);
        }
    }
}

export const SessionService = new SessionServiceImpl();
