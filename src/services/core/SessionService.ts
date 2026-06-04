import { keyringService } from './KeyringService';
import { verifyPasswordSecure, storage, loadWalletsSecure } from '../../utils/storage';
import { encryptSession, generateSessionKey, decryptSession } from '../../utils/crypto';

// Session duration — 8 hours, extended on user activity
const SESSION_DURATION = 8 * 60 * 60 * 1000;

export const AUTO_LOCK_DURATIONS = {
    '3min': 3 * 60_000,
    '5min': 5 * 60_000,
    '10min': 10 * 60_000,
    '15min': 15 * 60_000,
} as const;

export type AutoLockDuration = keyof typeof AUTO_LOCK_DURATIONS;

const IS_BACKGROUND = typeof window === 'undefined' || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage;

// Popup state cache for synchronous UI compatibility
const _popupSessionState = {
    isValid: false,
    sessionKey: null as string | null,
    autoLockDuration: 300_000, // default 5min
    decryptedWallets: null as any[] | null,
};

function syncPopupSessionState(): Promise<void> {
    if (IS_BACKGROUND) return Promise.resolve();
    return new Promise((resolve) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                chrome.runtime.sendMessage({
                    type: 'SESSION_ACTION',
                    action: 'GET_STATE'
                }, (response) => {
                    if (response && response.result) {
                        const state = response.result;
                        _popupSessionState.isValid = state.isValid;
                        _popupSessionState.sessionKey = state.sessionKey;
                        _popupSessionState.autoLockDuration = state.autoLockDuration;
                        _popupSessionState.decryptedWallets = state.decryptedWallets;
                    }
                    resolve();
                });
            } else {
                resolve();
            }
        } catch (e) {
            console.warn('Failed to sync session state:', e);
            resolve();
        }
    });
}

// Automatically sync state when in popup context
if (!IS_BACKGROUND) {
    syncPopupSessionState();
    // Listen for state change broadcasts from background
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener((message) => {
            if (message && message.type === 'SESSION_STATE_CHANGED') {
                syncPopupSessionState();
            }
        });
    }
}

function sendMessageToBackground(action: string, payload?: any): Promise<any> {
    return new Promise((resolve, reject) => {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
                type: 'SESSION_ACTION',
                action,
                payload
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response ? response.result : undefined);
                }
            });
        } else {
            reject(new Error('Extension runtime not available'));
        }
    });
}

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
    private _decryptedWallets: any[] | null = null;
    private _lastExtension: number = 0;

    constructor() {
        if (SessionServiceImpl._instance) {
            return SessionServiceImpl._instance;
        }
        SessionServiceImpl._instance = this;

        if (!IS_BACKGROUND) {
            syncPopupSessionState();
        } else {
            this.loadAutoLockSetting().catch(() => {});
        }
    }

    async setAutoLockDuration(key: AutoLockDuration): Promise<void> {
        if (!IS_BACKGROUND) {
            await sendMessageToBackground('setAutoLockDuration', { key });
            await syncPopupSessionState();
            return;
        }
        this._autoLockDuration = AUTO_LOCK_DURATIONS[key];
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ qiubit_auto_lock: key });
        }
        this._scheduleAutoLock();
    }

    async loadAutoLockSetting(): Promise<void> {
        if (!IS_BACKGROUND) {
            await sendMessageToBackground('loadAutoLockSetting');
            await syncPopupSessionState();
            return;
        }
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
        if (!IS_BACKGROUND) {
            sendMessageToBackground('recordActivity').catch(() => {});
            return;
        }
        this._lastActivity = Date.now();
        this._scheduleAutoLock();
        // Keep persisted expiry fresh while user is active (throttled to once per minute)
        if (this.isValid() && Date.now() - this._lastExtension > 60_000) {
            this._lastExtension = Date.now();
            this._sessionExpiry = Date.now() + SESSION_DURATION;
            this.persistSessionExpiry().catch(() => {});
        }
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

    getAutoLockDuration(): number {
        if (!IS_BACKGROUND) {
            return _popupSessionState.autoLockDuration;
        }
        return this._autoLockDuration;
    }

    /**
     * Get active session key (internal/memory only)
     */
    getSessionKey(): string | null {
        if (!IS_BACKGROUND) {
            return _popupSessionState.sessionKey;
        }
        return this._sessionKey;
    }

    /**
     * Check if session is valid
     */
    isValid(): boolean {
        if (!IS_BACKGROUND) {
            return _popupSessionState.isValid;
        }
        if (!this._sessionKey || !this._sessionExpiry) return false;
        return Date.now() < this._sessionExpiry;
    }

    /**
     * Extend session duration
     */
    extendSession() {
        if (!IS_BACKGROUND) {
            sendMessageToBackground('extendSession').catch(() => {});
            return;
        }
        if (this.isValid()) {
            this._sessionExpiry = Date.now() + SESSION_DURATION;
            this._lastExtension = Date.now();
            this._lastActivity = Date.now();
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
        if (!IS_BACKGROUND) {
            const res = await sendMessageToBackground('login', { password, wallets });
            await syncPopupSessionState();
            return res;
        }
        try {
            // Check if already active and matches
            if (this.isValid() && keyringService.isUnlocked() && keyringService.getPassword() === password) {
                this._decryptedWallets = wallets;
                return true;
            }

            // 1. Verify Password
            // Skip re-verification when wallets are explicitly provided — the caller
            // (popup) already proved the password by successfully decrypting the vault.
            // Re-running PBKDF2 1M iterations in the SW context adds latency and can
            // silently fail in resource-constrained SW environments.
            if (!wallets || wallets.length === 0) {
                const isValid = await verifyPasswordSecure(password);
                if (!isValid) throw new Error('Invalid password');
            }

            // 2. Unlock Keyring
            await keyringService.unlock(password, wallets);

            // 3. Generate Session
            this._sessionKey = generateSessionKey();
            this._sessionExpiry = Date.now() + SESSION_DURATION;
            this._decryptedWallets = wallets;

            // 4. Persist (Encrypted) & Sync
            await this.saveSessionSecure(password);
            await this.syncSessionToBackground();

            return true;
        } catch (error) {
            console.error('[SessionService] Login failed:', error);
            // Only clear in-memory state — do NOT call logout() which would destroy
            // the persisted session data and make recovery impossible
            this._sessionKey = null;
            this._sessionExpiry = null;
            this._decryptedWallets = null;
            keyringService.lock();
            throw error;
        }
    }

    /**
     * Logout sequence
     */
    async logout(): Promise<void> {
        if (!IS_BACKGROUND) {
            await sendMessageToBackground('logout');
            await syncPopupSessionState();
            return;
        }
        // 1. Clear Memory
        this._sessionKey = null;
        this._sessionExpiry = null;
        this._decryptedWallets = null;

        // 2. Clear Keyring
        keyringService.lock();

        // 3. Clear Storage
        await storage.remove(['qiubit_session_data', 'qiubit_session_expiry']);
        if (typeof chrome !== 'undefined' && chrome.storage?.session) {
            await chrome.storage.session.remove('qiubit_session_key');
        }

        // 4. Clear Background
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            try {
                chrome.runtime.sendMessage({ type: 'SYNC_SESSION', session: null });
            } catch (e) { /* ignore extension context invalidated */ }

            if (chrome.storage) {
                if (chrome.storage.session) await chrome.storage.session.remove('dapp_wallet_session');
                await storage.remove('dapp_active_wallet');
            }
        }
    }

    /**
     * Restore session from storage (Auto-login)
     */
    async restoreSession(): Promise<string | null> {
        if (!IS_BACKGROUND) {
            const pwd = await sendMessageToBackground('restoreSession');
            await syncPopupSessionState();
            return pwd;
        }
        try {
            // Quick bypass if already active in memory
            if (this.isValid() && keyringService.isUnlocked()) {
                const pwd = keyringService.getPassword();
                if (pwd) {
                    if (!this._decryptedWallets) {
                        try {
                            const wallets = await loadWalletsSecure(pwd);
                            this._decryptedWallets = wallets;
                        } catch (e) {
                            console.warn('[SessionService] Failed to load wallets in bypass:', e);
                        }
                    }
                    return pwd;
                }
            }

            const result = await storage.get(['qiubit_session_expiry', 'qiubit_session_data']);
            const expiryStr = result['qiubit_session_expiry'];

            if (!expiryStr) return null;

            const expiry = parseInt(expiryStr, 10);
            if (Date.now() > expiry) {
                await this.logout(); // Expired
                return null;
            }

            const encryptedData = result['qiubit_session_data'];
            // Session key is stored in chrome.storage.session (cleared on browser close),
            // never co-located with the vault in chrome.storage.local.
            const sessionKeyResult = await chrome.storage.session.get('qiubit_session_key');
            const storageKey = sessionKeyResult['qiubit_session_key'];

            if (encryptedData && storageKey) {
                const password = await decryptSession(encryptedData as string, storageKey as string);
                if (password && await verifyPasswordSecure(password)) {
                    // Session restored
                    // Generate a NEW ephemeral session key for this active memory session
                    this._sessionKey = generateSessionKey();
                    this._sessionExpiry = expiry;

                    // Reload wallets and unlock keyring so the background
                    // service worker can decrypt/sign on behalf of dApps
                    try {
                        const wallets = await loadWalletsSecure(password);
                        if (wallets && wallets.length > 0) {
                            this._decryptedWallets = wallets;
                            await keyringService.unlock(password, wallets);
                            // Re-sync session to background with the NEW session key
                            // This updates dapp_wallet_session in chrome.storage.session
                            await this.syncSessionToBackground();
                        }
                    } catch (restoreErr) {
                        console.error('[SessionService] Keyring unlock during restore failed:', restoreErr);
                    }

                    return password;
                }
            }
        } catch (error) {
            console.error('[SessionService] Restore failed:', error);
        }

        // Do NOT call logout() here — that would destroy persisted session data
        // (qiubit_session_data, qiubit_session_expiry, qiubit_session_key) even when
        // the failure was transient (e.g. SW just restarted, storage read race).
        // Expired sessions are already explicitly handled above with logout().
        return null;
    }

    /**
     * Save session securely to storage
     */
    private async saveSessionSecure(password: string): Promise<void> {
        if (!this._sessionKey) return; // Should not happen

        // Session key is stored in chrome.storage.session (cleared on browser close)
        // so it is never co-located with the encrypted vault in chrome.storage.local.
        const sessionResult = await chrome.storage.session.get('qiubit_session_key');
        let storageKey = sessionResult['qiubit_session_key'];

        if (!storageKey) {
            storageKey = generateSessionKey();
            await chrome.storage.session.set({ 'qiubit_session_key': storageKey });
        }

        const encryptedPwd = await encryptSession(password, storageKey as string);
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
    /**
     * Sync session to Chrome Background (Content Script / Extension support)
     */
    async syncSessionToBackground(): Promise<void> {
        if (!IS_BACKGROUND) {
            try {
                await sendMessageToBackground('syncSessionToBackground');
            } catch (e) {
                console.warn('[SessionService] Failed to forward syncSessionToBackground to background:', e);
            }
            return;
        }
        if (!this._sessionKey || !keyringService.isUnlocked()) return;

        // Detect environment
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.session) return;

        try {
            // Get Active Wallet
            const addresses = keyringService.getAddresses();
            if (addresses.length === 0) return;

            const activeAddress = keyringService.getActiveAddress() ?? addresses[0];
            const publicKey = keyringService.getPublicKey(activeAddress);

            if (publicKey) {
                // Read the actual user network from storage (set by popup via dapp_active_network)
                // Fall back to preserving existing session network, then 'octra'
                let network = 'octra';
                try {
                    const netResult = await chrome.storage.local.get('dapp_active_network');
                    if (netResult?.dapp_active_network) {
                        network = netResult.dapp_active_network as string;
                    } else {
                        // Preserve existing session network if already set
                        const existingSession = await chrome.storage.session.get('dapp_wallet_session');
                        if (existingSession?.dapp_wallet_session) {
                            const parsed = JSON.parse(existingSession.dapp_wallet_session as string);
                            if (parsed?.network) network = parsed.network;
                        }
                    }
                } catch (_) {}

                // SECURITY: Private key is kept ONLY in KeyringService memory (never persisted to storage).
                // dapp_wallet_session holds only public info for dApp address queries.
                const sessionData: Record<string, any> = {
                    address: activeAddress,
                    evmAddress: keyringService.getEvmAddress(activeAddress) ?? undefined,
                    solanaAddress: keyringService.getSolanaAddress(activeAddress) ?? undefined,
                    suiAddress: keyringService.getSuiAddress(activeAddress) ?? undefined,
                    publicKey: publicKey,
                    publicKeyB64: publicKey,
                    network,
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
                        data: { sessionKey: this._sessionKey }
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
    async syncActiveWalletToBackground(address: string, network: string = 'octra') {
        if (!IS_BACKGROUND) {
            try {
                await sendMessageToBackground('syncActiveWalletToBackground', { address, network });
            } catch (e) {
                console.warn('[SessionService] Failed to forward syncActiveWalletToBackground to background:', e);
            }
            return;
        }
        if (!this._sessionKey) return;

        try {
            const publicKey = keyringService.getPublicKey(address);
            if (!publicKey) return;

            // SECURITY: Private key stays in KeyringService memory only.
            const sessionData: Record<string, any> = {
                address: address,
                evmAddress: keyringService.getEvmAddress(address) ?? undefined,
                solanaAddress: keyringService.getSolanaAddress(address) ?? undefined,
                suiAddress: keyringService.getSuiAddress(address) ?? undefined,
                publicKey: publicKey,
                publicKeyB64: publicKey,
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
                    data: { sessionKey: this._sessionKey }
                });
                chrome.runtime.sendMessage({
                    type: 'SYNC_SESSION',
                    session: sessionData
                });
            }
        } catch (error) {
            console.error('[SessionService] Active wallet sync failed:', error);
        }
    }

    /**
     * Update decrypted wallets cache
     */
    async updateDecryptedWallets(wallets: any[]): Promise<void> {
        if (!IS_BACKGROUND) {
            try {
                await sendMessageToBackground('updateDecryptedWallets', { wallets });
                await syncPopupSessionState();
            } catch (e) {
                console.warn('[SessionService] Failed to update decrypted wallets:', e);
            }
            return;
        }
        this._decryptedWallets = wallets;
    }

    /**
     * Get decrypted wallets cache
     */
    getDecryptedWallets(): any[] | null {
        if (!IS_BACKGROUND) {
            return _popupSessionState.decryptedWallets || null;
        }
        return this._decryptedWallets;
    }

    // Expose internal state for background routing
    _getBackgroundState() {
        return {
            isValid: this.isValid(),
            sessionKey: this._sessionKey,
            autoLockDuration: this._autoLockDuration,
            decryptedWallets: this._decryptedWallets
        };
    }
}

export const SessionService = new SessionServiceImpl();
export { SessionServiceImpl };
