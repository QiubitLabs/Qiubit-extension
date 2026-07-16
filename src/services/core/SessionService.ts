/**
 * LOGIC: Manages session authentication lifetimes, auto-locking timers, background service-worker state synchronization, and encrypted session restoration.
 * Employs a dual-context design to sync transient popup views with persistent background workers using chrome.runtime message passing, storing session encryption keys in chrome.storage.session.
 * EXPORTS:
 *   - AUTO_LOCK_DURATIONS (const object)
 *   - AutoLockDuration (type)
 *   - SessionService (const class instance of SessionServiceImpl)
 *   - SessionServiceImpl (class)
 * FUNCTIONS:
 *   - syncPopupSessionState(): Synchronizes the temporary popup UI session state with the background service worker by fetching GET_STATE.
 *   - sendMessageToBackground(action, payload): Standardizes Chrome message calls to forward commands from UI popup to the background worker.
 *   - setAutoLockDuration(key) / loadAutoLockSetting(): Persists and reads auto-lock time triggers.
 *   - recordActivity(): Tracks user interaction timestamps to defer auto-locking.
 *   - extendSession(): Defers the session expiry timestamp into the future.
 *   - login(password, wallets): Keyring unlock sequence, generates session keys, and initializes session stores.
 *   - logout(): Clears session memory, locks keyring, and clears session/local storage states.
 *   - restoreSession(): Recovers active sessions from browser session storage without prompting for password.
 *   - _broadcastSessionData(activeAddress, network, publicKey): Formats and broadcasts public session metadata to storage and extension messenger.
 *   - syncSessionToBackground() / syncActiveWalletToBackground(address, network): Syncs the active wallet addresses and network configs to volatile storage and issues SYNC_SESSION messaging.
 */

import { keyringService } from "./KeyringService";
import { logInfo } from "../../utils/logger";
import {
  verifyPasswordSecure,
  storage,
  loadWalletsSecure,
} from "../../utils/storage";
import {
  encryptSession,
  generateSessionKey,
  decryptSession,
} from "../../utils/crypto";

const SESSION_DURATION = 8 * 60 * 60 * 1000;

export const AUTO_LOCK_DURATIONS = {
  "3min": 3 * 60_000,
  "5min": 5 * 60_000,
  "10min": 10 * 60_000,
  "15min": 15 * 60_000,
} as const;

export type AutoLockDuration = keyof typeof AUTO_LOCK_DURATIONS;

/**
 * MV3 service workers are killed after ~30s of inactivity, so a setTimeout
 * can never carry a 10–15 minute auto-lock. A chrome.alarm wakes the worker
 * at the deadline instead; the in-memory timer stays as a fast path while
 * the worker happens to be alive.
 */
export const AUTO_LOCK_ALARM = "qiubitAutoLock";

const IS_BACKGROUND =
  typeof window === "undefined" ||
  typeof chrome === "undefined" ||
  !chrome.runtime ||
  !chrome.runtime.sendMessage;

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
      if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage(
          {
            type: "SESSION_ACTION",
            action: "GET_STATE",
          },
          (response) => {
            // Reading lastError marks the error as handled (avoids
            // "Unchecked runtime.lastError" when the background is starting).
            void chrome.runtime.lastError;
            if (response && response.result) {
              const state = response.result;
              _popupSessionState.isValid = state.isValid;
              _popupSessionState.sessionKey = state.sessionKey;
              _popupSessionState.autoLockDuration = state.autoLockDuration;
              _popupSessionState.decryptedWallets = state.decryptedWallets;
            }
            resolve();
          },
        );
      } else {
        resolve();
      }
    } catch (e) {
      console.warn("Failed to sync session state:", e);
      resolve();
    }
  });
}

if (!IS_BACKGROUND) {
  syncPopupSessionState();
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "SESSION_STATE_CHANGED") {
        syncPopupSessionState();
      }
    });
  }
}

function sendMessageToBackground(action: string, payload?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage(
        {
          type: "SESSION_ACTION",
          action,
          payload,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response ? response.result : undefined);
          }
        },
      );
    } else {
      reject(new Error("Extension runtime not available"));
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
  private _autoLockDuration: number = AUTO_LOCK_DURATIONS["5min"];
  private _lastActivity: number = Date.now();
  private _autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  private _decryptedWallets: any[] | null = null;
  private _lastExtension: number = 0;
  private _lastActivitySave: number = 0;
  private _lastRecordActivityMsg: number = 0;

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
      await sendMessageToBackground("setAutoLockDuration", { key });
      await syncPopupSessionState();
      return;
    }
    this._autoLockDuration = AUTO_LOCK_DURATIONS[key];
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ qiubit_auto_lock: key });
    }
    this._scheduleAutoLock();
  }

  async loadAutoLockSetting(): Promise<void> {
    if (!IS_BACKGROUND) {
      await sendMessageToBackground("loadAutoLockSetting");
      await syncPopupSessionState();
      return;
    }
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await chrome.storage.local.get("qiubit_auto_lock");
        const key = result.qiubit_auto_lock as AutoLockDuration;
        if (key && key in AUTO_LOCK_DURATIONS) {
          this._autoLockDuration = AUTO_LOCK_DURATIONS[key];
        }
      }
    } catch {
      /* ignore */
    }
  }

  recordActivity(): void {
    if (!IS_BACKGROUND) {
      const now = Date.now();
      if (now - this._lastRecordActivityMsg > 2000) {
        this._lastRecordActivityMsg = now;
        sendMessageToBackground("recordActivity").catch(() => {});
      }
      return;
    }
    this._lastActivity = Date.now();
    this._scheduleAutoLock();

    const nowMs = Date.now();
    if (nowMs - this._lastActivitySave > 5000) {
      this._lastActivitySave = nowMs;
      if (typeof chrome !== "undefined" && chrome.storage?.session) {
        chrome.storage.session
          .set({ qiubit_last_activity: nowMs })
          .catch(() => {});
      }
    }

    if (this.isValid() && Date.now() - this._lastExtension > 60_000) {
      this._lastExtension = Date.now();
      this._sessionExpiry = Date.now() + SESSION_DURATION;
      this.persistSessionExpiry().catch(() => {});
    }
  }

  private _scheduleAutoLock(): void {
    if (this._autoLockTimer) clearTimeout(this._autoLockTimer);
    if (this._autoLockDuration === 0 || !this.isValid()) {
      if (typeof chrome !== "undefined" && chrome.alarms) {
        chrome.alarms.clear(AUTO_LOCK_ALARM).catch(() => {});
      }
      return;
    }
    if (typeof chrome !== "undefined" && chrome.alarms) {
      chrome.alarms.create(AUTO_LOCK_ALARM, {
        when: Date.now() + this._autoLockDuration,
      });
    }
    this._autoLockTimer = setTimeout(() => {
      if (Date.now() - this._lastActivity >= this._autoLockDuration) {
        this.logout().catch(() => {});
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("wallet:auto-locked"));
        }
      }
    }, this._autoLockDuration);
  }

  /**
   * Called from the background alarm listener when AUTO_LOCK_ALARM fires.
   * Returns true when the session was locked, false when it was extended
   * (recent activity) and the alarm has been rescheduled.
   */
  async enforceAutoLock(): Promise<boolean> {
    if (!IS_BACKGROUND) return false;
    await this.loadAutoLockSetting();
    if (this._autoLockDuration === 0) return false;

    let lastActivity = this._lastActivity;
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.session) {
        const data = await chrome.storage.session.get("qiubit_last_activity");
        if (data?.qiubit_last_activity) {
          lastActivity = Math.max(
            lastActivity,
            Number(data.qiubit_last_activity),
          );
        }
      }
    } catch {
      /* fall back to in-memory value */
    }

    if (Date.now() - lastActivity >= this._autoLockDuration) {
      await this.logout();
      return true;
    }
    // Recent activity — schedule the remaining time
    if (typeof chrome !== "undefined" && chrome.alarms) {
      chrome.alarms.create(AUTO_LOCK_ALARM, {
        when: lastActivity + this._autoLockDuration,
      });
    }
    return false;
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
      sendMessageToBackground("extendSession").catch(() => {});
      return;
    }
    if (this.isValid()) {
      this._sessionExpiry = Date.now() + SESSION_DURATION;
      this._lastExtension = Date.now();
      this._lastActivity = Date.now();
      this.persistSessionExpiry().catch((err) =>
        console.error("[Session] Failed to persist expiry:", err),
      );
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
      const res = await sendMessageToBackground("login", { password, wallets });
      await syncPopupSessionState();
      return res;
    }
    try {
      if (
        this.isValid() &&
        keyringService.isUnlocked() &&
        keyringService.getPassword() === password
      ) {
        this._decryptedWallets = wallets;
        return true;
      }

      if (!wallets || wallets.length === 0) {
        const isValid = await verifyPasswordSecure(password);
        if (!isValid) throw new Error("Invalid password");
      }

      await keyringService.unlock(password, wallets);

      this._sessionKey = generateSessionKey();
      this._sessionExpiry = Date.now() + SESSION_DURATION;
      this._decryptedWallets = wallets;
      this._lastActivity = Date.now();
      if (typeof chrome !== "undefined" && chrome.storage?.session) {
        await chrome.storage.session.set({
          qiubit_last_activity: this._lastActivity,
        });
      }
      this._scheduleAutoLock();

      await this.saveSessionSecure(password);
      await this.syncSessionToBackground();

      return true;
    } catch (error) {
      console.error("[SessionService] Login failed:", error);
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
      await sendMessageToBackground("logout");
      await syncPopupSessionState();
      return;
    }
    this._sessionKey = null;
    this._sessionExpiry = null;
    this._decryptedWallets = null;
    if (this._autoLockTimer) clearTimeout(this._autoLockTimer);
    if (typeof chrome !== "undefined" && chrome.alarms) {
      chrome.alarms.clear(AUTO_LOCK_ALARM).catch(() => {});
    }

    keyringService.lock();

    await storage.remove(["qiubit_session_data", "qiubit_session_expiry"]);
    if (typeof chrome !== "undefined" && chrome.storage?.session) {
      await chrome.storage.session.remove([
        "qiubit_session_key",
        "qiubit_last_activity",
        "qiubit_session_wallets",
      ]);
    }

    if (typeof chrome !== "undefined" && chrome.runtime) {
      try {
        chrome.runtime
          .sendMessage({ type: "SYNC_SESSION", session: null })
          .catch(() => {});
      } catch (e) {
        /* ignore extension context invalidated */
      }

      if (chrome.storage) {
        if (chrome.storage.session)
          await chrome.storage.session.remove("dapp_wallet_session");
        await storage.remove("dapp_active_wallet");
      }
    }
  }

  /**
   * Restore session from storage (Auto-login)
   */
  async restoreSession(): Promise<string | null> {
    if (!IS_BACKGROUND) {
      logInfo("[SessionService] [Popup] restoreSession initiated");
      try {
        const pwd = await sendMessageToBackground("restoreSession");
        logInfo(
          "[SessionService] [Popup] restoreSession background returned pwd =",
          !!pwd,
        );
        await syncPopupSessionState();
        logInfo(
          "[SessionService] [Popup] restoreSession synced popup state, isValid =",
          _popupSessionState.isValid,
        );
        return pwd;
      } catch (err) {
        console.error("[SessionService] [Popup] restoreSession failed:", err);
        return null;
      }
    }
    try {
      logInfo("[SessionService] [Background] restoreSession initiated");
      if (this.isValid() && keyringService.isUnlocked()) {
        const pwd = keyringService.getPassword();
        if (pwd) {
          logInfo(
            "[SessionService] [Background] restoreSession: Bypass successful (already unlocked)",
          );
          if (!this._decryptedWallets) {
            try {
              const wallets = await loadWalletsSecure(pwd);
              this._decryptedWallets = wallets;
            } catch (e) {
              console.warn(
                "[SessionService] Failed to load wallets in bypass:",
                e,
              );
            }
          }
          return pwd;
        }
      }

      const result = await storage.get([
        "qiubit_session_expiry",
        "qiubit_session_data",
      ]);
      const expiryStr = result["qiubit_session_expiry"];
      logInfo(
        "[SessionService] [Background] restoreSession: expiryStr =",
        expiryStr,
      );

      if (!expiryStr) {
        logInfo(
          "[SessionService] [Background] restoreSession: No expiryStr found",
        );
        return null;
      }

      const expiry = parseInt(expiryStr, 10);
      if (Date.now() > expiry) {
        logInfo(
          "[SessionService] [Background] restoreSession: Session expired",
        );
        await this.logout(); // Expired
        return null;
      }

      if (typeof chrome !== "undefined" && chrome.storage?.session) {
        const lastActResult = await chrome.storage.session.get(
          "qiubit_last_activity",
        );
        const lastAct = lastActResult.qiubit_last_activity
          ? Number(lastActResult.qiubit_last_activity)
          : 0;
        logInfo(
          `[SessionService] [Background] restoreSession: lastAct = ${lastAct} autoLockDuration = ${this._autoLockDuration}`,
        );
        if (lastAct > 0) {
          const elapsed = Date.now() - lastAct;
          if (this._autoLockDuration > 0 && elapsed >= this._autoLockDuration) {
            logInfo(
              "[SessionService] [Background] Auto-lock duration exceeded during restore, logging out.",
            );
            await this.logout();
            return null;
          }
        }
      }

      const encryptedData = result["qiubit_session_data"];
      const sessionKeyResult =
        await chrome.storage.session.get("qiubit_session_key");
      const storageKey = sessionKeyResult["qiubit_session_key"];
      logInfo(
        `[SessionService] [Background] restoreSession: encryptedData exists = ${!!encryptedData} storageKey exists = ${!!storageKey}`,
      );

      if (encryptedData && storageKey) {
        const password = await decryptSession(
          encryptedData as string,
          storageKey as string,
        );
        logInfo(
          "[SessionService] [Background] restoreSession: password decrypted =",
          !!password,
        );
        if (password) {
          this._sessionKey = generateSessionKey();
          this._sessionExpiry = expiry;

          try {
            let wallets: any[] | null = null;

            if (typeof chrome !== "undefined" && chrome.storage?.session) {
              const walletsResult = await chrome.storage.session.get(
                "qiubit_session_wallets",
              );
              const encryptedWallets = walletsResult["qiubit_session_wallets"];
              logInfo(
                "[SessionService] [Background] restoreSession: encryptedWallets exists =",
                !!encryptedWallets,
              );
              if (encryptedWallets) {
                const decryptedWalletsStr = await decryptSession(
                  encryptedWallets as string,
                  storageKey as string,
                );
                if (decryptedWalletsStr) {
                  try {
                    wallets = JSON.parse(decryptedWalletsStr);
                    logInfo(
                      "[SessionService] [Background] restoreSession: decrypted wallets count =",
                      wallets?.length,
                    );
                  } catch (e: any) {
                    console.error(
                      "[SessionService] [Background] restoreSession: JSON parse failed for wallets:",
                      e,
                    );
                  }
                }
              }
            }

            if (!wallets || wallets.length === 0) {
              logInfo(
                "[SessionService] [Background] Restoring wallets using slow fallback (PBKDF2)...",
              );
              wallets = await loadWalletsSecure(password);
            }

            if (wallets && wallets.length > 0) {
              this._decryptedWallets = wallets;
              await keyringService.unlock(password, wallets);
              await this.syncSessionToBackground();

              this._lastActivity = Date.now();
              if (typeof chrome !== "undefined" && chrome.storage?.session) {
                await chrome.storage.session.set({
                  qiubit_last_activity: this._lastActivity,
                });
              }
              this._scheduleAutoLock();

              if (typeof chrome !== "undefined" && chrome.storage?.session) {
                const encryptedWallets = await encryptSession(
                  JSON.stringify(wallets),
                  storageKey as string,
                );
                if (encryptedWallets) {
                  await chrome.storage.session.set({
                    qiubit_session_wallets: encryptedWallets,
                  });
                }
              }
            }
          } catch (restoreErr) {
            console.error(
              "[SessionService] [Background] Keyring unlock during restore failed:",
              restoreErr,
            );
          }

          return password;
        }
      }
      logInfo(
        "[SessionService] [Background] restoreSession failed: missing key or password decryption failed",
      );
    } catch (error) {
      console.error("[SessionService] [Background] Restore failed:", error);
    }

    return null;
  }

  /**
   * Save session securely to storage
   */
  private async saveSessionSecure(password: string): Promise<void> {
    if (!this._sessionKey) return; // Should not happen

    const sessionResult =
      await chrome.storage.session.get("qiubit_session_key");
    let storageKey = sessionResult["qiubit_session_key"];

    if (!storageKey) {
      storageKey = generateSessionKey();
      await chrome.storage.session.set({ qiubit_session_key: storageKey });
    }

    const encryptedPwd = await encryptSession(password, storageKey as string);
    if (encryptedPwd) {
      await storage.set({ qiubit_session_data: encryptedPwd });
      await this.persistSessionExpiry();
    }

    if (this._decryptedWallets && this._decryptedWallets.length > 0) {
      const encryptedWallets = await encryptSession(
        JSON.stringify(this._decryptedWallets),
        storageKey as string,
      );
      if (
        encryptedWallets &&
        typeof chrome !== "undefined" &&
        chrome.storage?.session
      ) {
        await chrome.storage.session.set({
          qiubit_session_wallets: encryptedWallets,
        });
      }
    }
  }

  private async persistSessionExpiry() {
    if (this._sessionExpiry) {
      await storage.set({
        qiubit_session_expiry: this._sessionExpiry.toString(),
      });
    }
  }

  /**
   * Helper to package and broadcast session data to storage and runtime message bus.
   */
  private async _broadcastSessionData(
    activeAddress: string,
    network: string,
    publicKey: string,
  ): Promise<void> {
    const sessionData: Record<string, any> = {
      address: activeAddress,
      evmAddress: keyringService.getEvmAddress(activeAddress) ?? undefined,
      solanaAddress:
        keyringService.getSolanaAddress(activeAddress) ?? undefined,
      suiAddress: keyringService.getSuiAddress(activeAddress) ?? undefined,
      publicKey: publicKey,
      publicKeyB64: publicKey,
      network,
      timestamp: Date.now(),
    };

    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.session
    ) {
      await chrome.storage.session.set({
        dapp_wallet_session: JSON.stringify(sessionData),
      });
    }

    if (typeof chrome !== "undefined" && chrome.runtime) {
      // Fire-and-forget: without .catch() a missing receiver (popup closed)
      // becomes an uncaught "Receiving end does not exist" promise rejection.
      chrome.runtime
        .sendMessage({
          type: "SYNC_SESSION",
          data: { sessionKey: this._sessionKey },
        })
        .catch(() => {});

      setTimeout(() => {
        try {
          chrome.runtime
            .sendMessage({
              type: "SYNC_SESSION",
              session: sessionData,
            })
            .catch(() => {});
        } catch (_) {}
      }, 50);
    }
  }

  /**
   * Sync session to Chrome Background (Content Script / Extension support)
   */
  async syncSessionToBackground(): Promise<void> {
    if (!IS_BACKGROUND) {
      try {
        await sendMessageToBackground("syncSessionToBackground");
      } catch (e) {
        console.warn(
          "[SessionService] Failed to forward syncSessionToBackground to background:",
          e,
        );
      }
      return;
    }
    if (!this._sessionKey || !keyringService.isUnlocked()) return;

    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.session
    )
      return;

    try {
      const addresses = keyringService.getAddresses();
      if (addresses.length === 0) return;

      const activeAddress = keyringService.getActiveAddress() ?? addresses[0];
      const publicKey = keyringService.getPublicKey(activeAddress);

      if (publicKey) {
        let network = "octra";
        try {
          const netResult = await chrome.storage.local.get(
            "dapp_active_network",
          );
          if (netResult?.dapp_active_network) {
            network = netResult.dapp_active_network as string;
          } else {
            const existingSession = await chrome.storage.session.get(
              "dapp_wallet_session",
            );
            if (existingSession?.dapp_wallet_session) {
              const parsed = JSON.parse(
                existingSession.dapp_wallet_session as string,
              );
              if (parsed?.network) network = parsed.network;
            }
          }
        } catch (_) {}

        await this._broadcastSessionData(activeAddress, network, publicKey);
      }
    } catch (e) {}
  }

  /**
   * Update active wallet synchronization
   */
  async syncActiveWalletToBackground(
    address: string,
    network: string = "octra",
  ) {
    if (!IS_BACKGROUND) {
      try {
        await sendMessageToBackground("syncActiveWalletToBackground", {
          address,
          network,
        });
      } catch (e) {
        console.warn(
          "[SessionService] Failed to forward syncActiveWalletToBackground to background:",
          e,
        );
      }
      return;
    }
    if (!this._sessionKey) return;

    try {
      const publicKey = keyringService.getPublicKey(address);
      if (!publicKey) return;

      await this._broadcastSessionData(address, network, publicKey);
    } catch (error) {
      console.error("[SessionService] Active wallet sync failed:", error);
    }
  }

  /**
   * Update decrypted wallets cache
   */
  async updateDecryptedWallets(wallets: any[]): Promise<void> {
    if (!IS_BACKGROUND) {
      try {
        await sendMessageToBackground("updateDecryptedWallets", { wallets });
        await syncPopupSessionState();
      } catch (e) {
        console.warn("[SessionService] Failed to update decrypted wallets:", e);
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

  _getBackgroundState() {
    return {
      isValid: this.isValid(),
      sessionKey: this._sessionKey,
      autoLockDuration: this._autoLockDuration,
      decryptedWallets: this._decryptedWallets,
    };
  }
}

export const SessionService = new SessionServiceImpl();
export { SessionServiceImpl };
