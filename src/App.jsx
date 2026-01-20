/**
 * Octra Wallet - Main Application
 * A simple, elegant wallet for the Octra network
 * 
 * SECURITY MODEL:
 * - All data stored in browser localStorage (client-side only)
 * - Password is hashed (SHA-256), never stored in plain text
 * - Private keys are encrypted with password using AES-GCM
 * - NO data is sent to any external server
 */

import { useState, useEffect, useCallback } from 'react';
import './App.css';

import { WelcomeScreen, CreateWalletScreen, ImportWalletScreen } from './components/welcome';
import { Dashboard } from './components/dashboard';
import { SettingsScreen } from './components/settings';
import { LockScreen, SetupPassword } from './components/lockscreen';
import { DappApprovalScreen } from './components/dapp/DappApproval';

import {
  hasPasswordSecure as hasPassword,
  hasWalletsSecure as hasWallets,
  verifyPasswordSecure as verifyPassword,
  setWalletPasswordSecure as setWalletPassword,
  loadWalletsSecure as loadWallets,
  saveWalletsSecure as saveWallets, // Added
  addWalletSecure as addWallet,
  getActiveWalletIndex,
  setActiveWalletIndex,
  loadSettingsSecure as getSettings,
  saveSettingsSecure as saveSettings,
  clearAllDataSecure as clearAllData,
  getTxHistorySecure as getTxHistory,
  loadTxHistoryAsync, // Added Async Loader
  saveTxHistorySecure as saveTxHistory, // Added
  updateWalletNameSecure as updateWalletName,
  getPrivacyTransactionSecure as getPrivacyTransaction,
  getAllPrivacyTransactionsSecure as getAllPrivacyTransactions
} from './utils/storageSecure';
// Import VerifyPasswordSecure explicitly for session restore context consistency
import { verifyPasswordSecure } from './utils/storageSecure';
import { getRpcClient, setRpcUrl } from './utils/rpc';
import { encryptSession, decryptSession, generateSessionKey } from './utils/crypto';

// Activity logging
import { logWalletUnlock, logWalletLock } from './utils/activityLogger';

import { keyringService } from './services/KeyringService';
import { ocs01Manager } from './services/OCS01TokenService';
import { privacyService } from './services/PrivacyService';
import { balanceCache } from './utils/balanceCache';

import { CheckIcon, CloseIcon, InfoIcon } from './components/shared/Icons';

import { Toast } from './components/shared/Toast';

// Global Cache Helper
const cacheSet = (key, data, ttl) => {
  const expiry = Date.now() + ttl;
  localStorage.setItem(`cache_app_${key}`, JSON.stringify({ data, expiry }));
};

function App() {
  // App State
  const [view, setView] = useState('loading');
  // Views: 'loading' | 'welcome' | 'setup-password' | 'lock' | 'create' | 'import' | 'dashboard' | 'settings'

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState(null); // Stored in memory only, never persisted
  const [wallets, setWallets] = useState([]);
  const [activeWalletIndex, setActiveWalletIdx] = useState(0);
  const [lastRefreshId, setLastRefreshId] = useState(0);
  const [pendingWallet, setPendingWallet] = useState(null); // Wallet pending password setup
  const [sessionKey, setSessionKey] = useState(null); // IN-MEMORY ONLY SESSION KEY

  // Session management
  const [sessionExpiry, setSessionExpiry] = useState(null);
  const SESSION_DURATION = 5 * 60 * 1000; // 5 minutes

  const [balance, setBalance] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [txLimit, setTxLimit] = useState(50); // Default limit 50 (Standard)
  const [hasMoreTxs, setHasMoreTxs] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settings, setSettingsState] = useState(getSettings());
  const [toast, setToast] = useState(null);

  // Shared tokens state with cache (30s TTL)
  const [allTokens, setAllTokens] = useState([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);

  // Current active wallet
  const wallet = wallets[activeWalletIndex] || null;
  const rpcClient = getRpcClient();

  // Show toast notification
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const [dappApprovalId, setDappApprovalId] = useState(null);

  // Check for dApp approval request in URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#/dapp/approve')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const id = params.get('id');
      if (id) {
        setDappApprovalId(id);
      }
    }
  }, []);

  // --- Session Persistence Helpers ---

  const clearActiveSession = useCallback(() => {
    localStorage.removeItem('octra_session_data');
    localStorage.removeItem('octra_session_expiry');
  }, []);

  const saveActiveSession = useCallback(async (pwd) => {
    console.log('[DEBUG] saveActiveSession called. Pwd len:', pwd ? pwd.length : 0);
    try {
      const expiry = Date.now() + SESSION_DURATION;

      let sessionKey = localStorage.getItem('octra_session_key');
      console.log('[DEBUG] Session Key Check:', sessionKey ? 'EXISTS' : 'MISSING');

      if (!sessionKey) {
        sessionKey = generateSessionKey();
        localStorage.setItem('octra_session_key', sessionKey);
        console.log('[DEBUG] generated new session key');
      }

      if (!pwd) {
        console.error('[DEBUG] Password is empty! Cannot save session.');
        return;
      }

      console.log('[DEBUG] Encrypting session...');
      const encryptedPwd = await encryptSession(pwd, sessionKey);

      if (encryptedPwd) {
        localStorage.setItem('octra_session_data', encryptedPwd);
        localStorage.setItem('octra_session_expiry', expiry.toString());
        setSessionExpiry(expiry);
        console.log('[App] Session saved SUCCESS (expires in 5m)');
      } else {
        console.error('[App] Session encryption returned null');
      }
    } catch (e) {
      console.error('[App] Failed to save session (EXCEPTION):', e);
    }
  }, [SESSION_DURATION]);

  const restoreActiveSession = useCallback(async () => {
    try {
      const expiryStr = localStorage.getItem('octra_session_expiry');
      if (!expiryStr) return null;

      const expiry = parseInt(expiryStr, 10);
      if (Date.now() > expiry) {
        console.log('[App] Session expired');
        clearActiveSession();
        return null;
      }

      const sessionKey = localStorage.getItem('octra_session_key');
      const encryptedPwd = localStorage.getItem('octra_session_data');

      if (sessionKey && encryptedPwd) {
        const pwd = await decryptSession(encryptedPwd, sessionKey);

        if (pwd) {
          // Check integrity
          const isValid = await verifyPasswordSecure(pwd);

          if (isValid) {
            const newExpiry = Date.now() + SESSION_DURATION;
            localStorage.setItem('octra_session_expiry', newExpiry.toString());
            setSessionExpiry(newExpiry);
            console.log('[App] Session restored from persistence');
            return pwd;
          } else {
            console.warn('[App] Stored session password invalid');
            clearActiveSession();
          }
        }
      }
    } catch (e) {
      console.error('[App] Session restore failed:', e);
    }
    return null;
  }, [SESSION_DURATION, clearActiveSession]);

  // Initialize app - check if locked or needs setup
  useEffect(() => {
    const init = async () => {
      try {
        const savedSettings = getSettings();
        // Force network to mainnet (testnet is disabled)
        const settingsWithDefaults = {
          ...savedSettings,
          network: 'mainnet'
        };
        if (settingsWithDefaults.rpcUrl) {
          setRpcUrl(settingsWithDefaults.rpcUrl);
        }
        setSettingsState(settingsWithDefaults);

        const hasWalletsConfigured = await hasWallets();
        const hasPasswordConfigured = await hasPassword();

        if (hasWalletsConfigured && hasPasswordConfigured) {
          // Try to restore session first
          const restoredPwd = await restoreActiveSession();

          if (restoredPwd) {
            // Restore successful!
            const loadedWallets = await loadWallets(restoredPwd);
            if (loadedWallets.length > 0) {
              setWallets(loadedWallets);
              setPassword(restoredPwd);
              setIsUnlocked(true);

              await keyringService.unlock(restoredPwd, loadedWallets);
              const savedIndex = getActiveWalletIndex();
              const activeIdx = savedIndex >= 0 && savedIndex < loadedWallets.length ? savedIndex : 0;
              setActiveWalletIdx(activeIdx);
              await keyringService.setActiveWallet(loadedWallets[activeIdx].address);

              setView('dashboard');
              return;
            }
          }

          // If restore failed, show lock screen
          setView('lock');
        } else {
          // New user, show welcome
          setView('welcome');
        }
      } catch (error) {
        console.error('Init error:', error);
        setView('welcome');
      }
    };

    init();
  }, [restoreActiveSession]);

  // BACKGROUND SYNC: Sync unlocked wallet session to chrome.storage.session
  // Defined here (hoisted) so it can be used by heartbeat
  const syncSessionToBackground = useCallback(async () => {
    // 1. If unlocked and has active wallet, sync full session to SESSION storage
    if (isUnlocked && wallet && wallet.address) {
      try {
        const activePk = keyringService.getPrivateKey(wallet.address);

        if (activePk) {
          const sessionData = {
            address: wallet.address,
            publicKey: wallet.publicKeyB64,
            privateKey: activePk,
            network: settings.network || 'mainnet',
            timestamp: Date.now()
          };

          // Send active message to background
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
              type: 'SYNC_SESSION',
              session: sessionData
            }, (response) => {
              // ignore errors
            });
          } else {
            console.warn('[App] chrome.runtime not available');
          }

          // Save to session storage
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
            await chrome.storage.session.set({
              dapp_wallet_session: JSON.stringify(sessionData)
            });
          }
        } else {
          // console.error('[App] Sync Failed: No private key found for', wallet.address);
        }
      } catch (err) {
        // console.warn('Sync failed', err);
      }
    } else {
      // console.log('[App] Sync Skipped: Locked or no wallet');
    }
  }, [isUnlocked, wallet, settings.network]);

  // Session "Heartbeat" / Keep-Alive
  // As long as the extension UI is open and unlocked, we EXTEND the session.
  // ALSO: Re-syncs to background every 5s to ensure stability.
  useEffect(() => {
    if (!isUnlocked) return;

    // Initial sync on unlock
    syncSessionToBackground();

    const keepAliveInterval = setInterval(() => {
      // 1. Extend session expiry locally
      const newExpiry = Date.now() + SESSION_DURATION;
      localStorage.setItem('octra_session_expiry', newExpiry.toString());
      setSessionExpiry(newExpiry);

      // 2. FORCE SYNC to Background (Heartbeat)
      syncSessionToBackground();

    }, 5000); // Pulse every 5 seconds

    return () => clearInterval(keepAliveInterval);
  }, [isUnlocked, SESSION_DURATION, syncSessionToBackground]);

  // Sync tokens with balance update

  // Shared function to fetch all tokens for the active wallet
  const fetchAllTokens = useCallback(async () => {
    if (!wallet?.address || isLoadingTokens) return;

    setIsLoadingTokens(true);
    try {
      // Fetch OCS01 tokens
      const ocs01Balances = await ocs01Manager.getUserTokenBalances(wallet.address);
      const otherTokens = ocs01Balances.map(t => ({
        symbol: t.isCustom ? t.contractName : 'OCS01',
        name: t.contractName || 'OCS01 Token',
        balance: t.balance,
        contractAddress: t.contractAddress,
        isNative: false,
        isOCS01: true
      }));
      const nativeToken = { symbol: 'OCT', name: 'Octra', balance: balance, isNative: true };
      const tokens = [nativeToken, ...otherTokens];

      // Cache for 30 seconds
      const cacheKey = `tokens_${wallet.address}`;
      cacheSet(cacheKey, tokens, 30000);
      setAllTokens(tokens);

      return tokens;
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
      const fallback = [{ symbol: 'OCT', name: 'Octra', balance: balance, isNative: true }];
      setAllTokens(fallback);
      return fallback;
    } finally {
      setIsLoadingTokens(false);
    }
  }, [wallet, balance, rpcClient]);

  // Optimized balance refresh with 3-layer cache & request deduplication
  const refreshBalance = useCallback(async () => {
    if (!wallet?.address) return;

    const currentRequestId = Date.now();
    setLastRefreshId(currentRequestId);

    setIsRefreshing(true);
    try {
      // Fetch with automatic deduplication (prevents storm!)
      const data = await balanceCache.fetchWithDedup(
        wallet.address,
        async (addr) => await rpcClient.getBalance(addr)
      );

      // Race condition guard: only update if this is the latest request
      setLastRefreshId(prevId => {
        if (currentRequestId >= prevId) {
          // Batch state updates (single re-render!)
          setBalance(data.balance);
          setNonce(data.nonce);
        }
        return prevId;
      });

      // Update wallet list
      if (activeWalletIndex !== -1) {
        setWallets(prev => {
          const updated = [...prev];
          if (updated[activeWalletIndex]) {
            updated[activeWalletIndex] = {
              ...updated[activeWalletIndex],
              lastKnownBalance: data.balance
            };
          }
          return updated;
        });
      }

      // Update native token balance
      if (allTokens.length > 0) {
        const updatedTokens = allTokens.map(t =>
          t.isNative ? { ...t, balance: data.balance } : t
        );
        setAllTokens(updatedTokens);
      }

      // Save to cache with 25s TTL (slightly less than 30s refresh)
      cacheSet(`balance_${wallet.address}`, data, 25000);

      // SYNC TO BACKGROUND STORAGE (for dApps)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get('balances');
        const currentBalances = result.balances || {};
        currentBalances[wallet.address] = data.balance; // Update specific address

        await chrome.storage.local.set({ balances: currentBalances });
        console.log('[App] Synced balance to background. Addr:', wallet.address, 'Val:', data.balance);
      }

    } catch (error) {
      console.error('[App] Balance refresh ERROR:', error);
      if (error.message && error.message.includes('Sender not found')) {
        setBalance(0);
        setNonce(0);

        // Sync 0 balance to background if address unused
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const result = await chrome.storage.local.get('balances');
          const currentBalances = result.balances || {};
          currentBalances[wallet.address] = "0";
          await chrome.storage.local.set({ balances: currentBalances });
        }

        if (allTokens.length > 0) {
          setAllTokens(allTokens.map(t => t.isNative ? { ...t, balance: 0 } : t));
        }
      } else {
        console.error('Failed to fetch balance:', error);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [wallet, rpcClient, allTokens, activeWalletIndex]);

  // BACKGROUND: Refresh ALL wallet balances (OPTIMIZED with staggering & deduplication)
  const refreshAllBalances = useCallback(async () => {
    if (!isUnlocked || wallets.length === 0) return;

    try {
      // Use balanceCache for deduplication
      const updatedWallets = await Promise.all(wallets.map(async (w) => {
        try {
          const data = await balanceCache.fetchWithDedup(
            w.address,
            async (addr) => await rpcClient.getBalance(addr)
          );
          return { ...w, lastKnownBalance: data.balance };
        } catch (err) {
          if (err.message && err.message.includes('Sender not found')) {
            return { ...w, lastKnownBalance: 0 };
          }
          return w;
        }
      }));

      // Only update if something actually changed
      const hasChanges = updatedWallets.some((w, i) => w.lastKnownBalance !== wallets[i].lastKnownBalance);
      if (hasChanges) {
        setWallets(updatedWallets);
        // Persist to storage - SECURE STANDARDS
        await saveWallets(updatedWallets, password);
      }

      // SYNC ALL BALANCES TO BACKGROUND
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get('balances');
        const currentBalances = result.balances || {};

        updatedWallets.forEach(w => {
          if (w.lastKnownBalance) {
            currentBalances[w.address] = w.lastKnownBalance;
          }
        });

        await chrome.storage.local.set({ balances: currentBalances });
        // console.log('[App] Synced all balances to background');
      }

    } catch (error) {
      console.error('Background balance refresh failed:', error);
    }
  }, [wallets, isUnlocked, rpcClient, password]);

  // Refresh transactions (OPTIMIZED: Smart Incremental Sync)
  const refreshTransactions = useCallback(async (customLimit = null) => {
    if (!wallet?.address) return;

    const limitToUse = customLimit || txLimit;
    const network = settings.network || 'mainnet';

    try {
      // 1. Load from persistent storage (IndexedDB preferred)
      // Always load fresh from DB to ensure we have the latest state
      const storedHistory = await loadTxHistoryAsync(network, wallet.address, limitToUse);
      const existingTxMap = new Map(storedHistory.map(tx => [tx.hash, tx]));

      // OPTIMIZATION: Decrypt privacy logs ONCE
      const allPrivacyLogs = await getAllPrivacyTransactions(password);

      // 2. Fetch from network - SMART INCREMENTAL SYNC
      let info;

      // Fetch batch from RPC
      info = await rpcClient.getAddressInfo(wallet.address, limitToUse);

      const totalOnChain = info.transaction_count || 0;
      setHasMoreTxs(limitToUse < totalOnChain);

      let newConfirmedTxs = [];

      if (info.recent_transactions && info.recent_transactions.length > 0) {
        // FILTER: Find only the hashes we don't have yet (or are pending)
        // CRITICAL: Stop iterating as soon as we find a known confirmed transaction
        // This prevents re-fetching old history unnecessarily
        const hashesToFetch = [];

        for (const ref of info.recent_transactions) {
          const existing = existingTxMap.get(ref.hash);

          // If we have it and it's confirmed, we can likely stop here
          // (assuming API returns ordered list newest -> oldest)
          if (existing && existing.status === 'confirmed') {
            // Found a known transaction, no need to go further back
            // UNLESS we are doing a deep fetch (Load More) which forces beyond
            if (!customLimit) {
              console.log('[History] Smart Sync: Found known tx, stopping fetch.', ref.hash);
              break;
            }
          }

          // If it's new OR it's pending (needs update), add to fetch list
          if (!existing || existing.status === 'pending') {
            hashesToFetch.push(ref);
          }
        }

        if (hashesToFetch.length > 0) {
          console.log(`[History] Fetching details for ${hashesToFetch.length} new/pending txs...`);

          // Batched Fetching (Concurrency: 5)
          const TX_CONCURRENCY = 5;

          const processTxBatch = async (batch) => {
            return Promise.all(batch.map(async (ref) => {
              try {
                // Check local cache first to save RPC calls
                // const cached = getFromCache(ref.hash); if (cached) return cached;

                const txData = await rpcClient.getTransaction(ref.hash);
                const parsed = txData.parsed_tx;
                // Fix: Support both 'to' and 'to_' (OTX-1 standard)
                const toAddr = parsed.to || parsed.to_;
                const isIncoming = toAddr && toAddr.toLowerCase() === wallet.address.toLowerCase();
                const privacyLog = allPrivacyLogs[ref.hash] || null;
                let txType = isIncoming ? 'in' : 'out';
                if (privacyLog) txType = privacyLog.type;

                return {
                  hash: ref.hash,
                  type: txType,
                  amount: parseFloat(parsed.amount_raw || parsed.amount || 0) / 1_000_000,
                  address: isIncoming ? parsed.from : toAddr,
                  timestamp: parsed.timestamp * 1000,
                  status: 'confirmed',
                  epoch: txData.epoch || ref.epoch,
                  ou: parsed.ou || txData.ou
                };
              } catch (e) {
                console.warn(`[History] Failed to fetch tx detail ${ref.hash}:`, e.message);
                return null;
              }
            }));
          };

          for (let i = 0; i < hashesToFetch.length; i += TX_CONCURRENCY) {
            const batch = hashesToFetch.slice(i, i + TX_CONCURRENCY);
            // Small delay to be gentle on RPC
            if (i > 0) await new Promise(r => setTimeout(r, 200));
            const batchResults = await processTxBatch(batch);
            newConfirmedTxs.push(...batchResults);
          }

          newConfirmedTxs = newConfirmedTxs.filter(Boolean);
        } else {
          console.log('[History] All synced! No new details to fetch.');
        }
      }

      // 3. Persistent Save & Update State
      if (newConfirmedTxs.length > 0) {
        // Save ONLY the new/updated ones to storage
        await saveTxHistory(newConfirmedTxs, network, wallet.address);

        // Update our local map for display
        newConfirmedTxs.forEach(tx => existingTxMap.set(tx.hash, tx));
      }

      // Convert Map back to Array for display
      const fullHistory = Array.from(existingTxMap.values());

      // 4. Add Pending Transactions (volatile) from Mempool
      let pendingTxs = [];
      try {
        const stagingResult = await rpcClient.get('/staging');
        if (stagingResult.json && stagingResult.json.staged_transactions) {
          const userAddrLower = wallet.address.toLowerCase();
          const confirmedHashes = new Set(fullHistory.map(tx => tx.hash));

          const ourPending = stagingResult.json.staged_transactions.filter(tx => {
            const fromAddr = (tx.from || '').toLowerCase();
            const toAddr = (tx.to || tx.to_ || '').toLowerCase();
            return (fromAddr === userAddrLower || toAddr === userAddrLower) && !confirmedHashes.has(tx.hash);
          });

          pendingTxs = ourPending.map(tx => ({
            hash: tx.hash || `pending_${tx.nonce}`,
            type: (tx.to || tx.to_ || '').toLowerCase() === userAddrLower ? 'in' : 'out',
            amount: parseFloat(tx.amount || 0) / (tx.amount && tx.amount.includes('.') ? 1 : 1_000_000),
            address: (tx.to || tx.to_ || '').toLowerCase() === userAddrLower ? tx.from : (tx.to || tx.to_),
            timestamp: Date.now(),
            status: 'pending',
            ou: tx.ou
          }));
        }
      } catch (err) { /* ignore staging errors */ }

      // Final display merge & Sort
      const displayHistory = [...pendingTxs, ...fullHistory].sort((a, b) => b.timestamp - a.timestamp);
      setTransactions(displayHistory);

      // Cache for instant load
      cacheSet(`txs_${wallet.address}`, displayHistory, 300000);

    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  }, [wallet, rpcClient, password, txLimit, settings.network]);

  // Load More Transactions (Infinite Scroll)
  const handleLoadMoreTransactions = useCallback(async () => {
    if (isLoadingMore || !hasMoreTxs) return;

    setIsLoadingMore(true);
    const newLimit = txLimit + 10;
    setTxLimit(newLimit);

    try {
      await refreshTransactions(newLimit);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMoreTxs, txLimit, refreshTransactions]);

  // Smart refresh - Simple & Smooth like MetaMask
  useEffect(() => {
    if (wallet && view === 'dashboard' && isUnlocked) {
      // INSTANT LOAD: Load last known balance from storage immediately
      // Do NOT reset to 0, which causes flickering
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get('balances').then((result) => {
          const cachedBal = result.balances?.[wallet.address];
          if (cachedBal !== undefined) {
            console.log('[App] Instant load balance:', cachedBal);
            setBalance(cachedBal);
          }
        });
      }

      setNonce(0);
      // Instant load history from storage (don't clear)
      const cachedTxs = getTxHistory(settings.network || 'mainnet', wallet.address);
      setTransactions(cachedTxs);

      setHasMoreTxs(true);
      setIsRefreshing(true);

      // 1. Critical Path: Native Balance (Fastest)
      // We wait for this before triggering heavier loads
      refreshBalance().then(() => {
        // 2. Secondary Path: Tokens (Medium Priority)
        // Staggered by 200ms to allow UI updates
        setTimeout(() => {
          fetchAllTokens();
        }, 200);

        // 3. Background Path: Only Privacy Balance (Transactions fetched on demand in History View)
        setTimeout(() => {
          Promise.allSettled([
            refreshTransactions(), // <-- ENABLED auto-fetch like Rabby Wallet
            privacyService.getEncryptedBalance(wallet.address)
          ]).finally(() => {
            setIsRefreshing(false);
          });
        }, 1500);
      }).catch(err => {
        console.error('Critical balance fetch failed', err);
        setIsRefreshing(false);
      });

      // SECURITY: Random jitter to prevent network fingerprinting
      // Instead of predictable 30s intervals, randomize timing
      const createJitteredInterval = (fn, baseInterval, jitter = 5000) => {
        let timeoutId;
        const schedule = () => {
          const randomDelay = baseInterval + (Math.random() * jitter * 2 - jitter);
          timeoutId = setTimeout(() => {
            fn();
            schedule(); // Reschedule with new random delay
          }, randomDelay);
        };
        schedule();
        return () => clearTimeout(timeoutId);
      };

      // Auto-refresh with jitter (base: 30s, jitter: ±5s)
      const cancelBalanceRefresh = createJitteredInterval(
        () => refreshBalance().catch(() => { }),
        30000,
        5000
      );

      // Transaction refresh with jitter (base: 60s, jitter: ±8s)
      const cancelTxRefresh = createJitteredInterval(
        () => refreshTransactions().catch(() => { }),
        60000,
        8000
      );

      // Background wallet refresh (only if multiple wallets)
      let walletRefreshTimeout;
      if (wallets.length > 1) {
        const randomDelay = 120000 + (Math.random() * 20000 - 10000); // 110-130s
        walletRefreshTimeout = setTimeout(() => {
          refreshAllBalances().catch(() => { });
        }, randomDelay);
      }

      // Cleanup on unmount or wallet switch
      return () => {
        cancelBalanceRefresh();
        cancelTxRefresh();
        if (walletRefreshTimeout) clearTimeout(walletRefreshTimeout);
      };
    }
  }, [wallet?.address, view, isUnlocked]);

  // Sync tokens with balance update
  useEffect(() => {
    if (wallet?.address && isUnlocked && allTokens.length > 0) {
      const currentNative = allTokens.find(t => t.isNative);
      // Only update if there is a mismatch to prevent infinite loops
      if (currentNative && currentNative.balance !== balance) {
        const updatedTokens = allTokens.map(t =>
          t.isNative ? { ...t, balance: balance } : t
        );
        setAllTokens(updatedTokens);
      }
    }
  }, [wallet?.address, isUnlocked, balance, allTokens]);


  // Lock wallet - SECURITY: Wipes all  //
  // Lock wallet
  //
  const handleLock = useCallback(async () => {
    // SECURITY: Clear all session data
    clearActiveSession();

    // Explicitly clear background session on manual lock
    if (typeof chrome !== 'undefined') {
      // 1. Send Clear Message
      if (chrome.runtime) {
        try {
          chrome.runtime.sendMessage({
            type: 'SYNC_SESSION',
            session: null
          });
        } catch (e) { /* ignore */ }
      }
      // 2. Clear Storage
      if (chrome.storage && chrome.storage.session) {
        await chrome.storage.session.remove('dapp_wallet_session');
      }
      if (chrome.storage) {
        await chrome.storage.local.remove('dapp_active_wallet');
      }
    }

    // Clear password from memory
    setPassword('');
    setIsUnlocked(false);
    setSessionExpiry(null);

    // Clear keyring (wipe sensitive data from memory)
    keyringService.panicLock();

    setView('lock');
    console.log('[App] [SECURE] Wallet locked (Session cleared, memory wiped)');
  }, []);

  // Unlock wallet with password
  const handleUnlock = useCallback(async (enteredPassword) => {
    try {
      const isValid = await verifyPassword(enteredPassword);
      if (!isValid) {
        throw new Error('Invalid password');
      }

      const loadedWallets = await loadWallets(enteredPassword);

      if (loadedWallets.length === 0) {
        throw new Error('No wallets found');
      }

      // Auto-fix: Re-save wallets if they were recovered from HMAC mismatch
      // This ensures future unlocks won't trigger emergency recovery
      try {
        await saveWallets(loadedWallets, enteredPassword);
        console.log('[App] Wallets re-encrypted with correct HMAC');
      } catch (resaveError) {
        // Non-critical error, just log it
        console.warn('[App] Could not re-save wallets:', resaveError);
      }


      setWallets(loadedWallets);
      setPassword(enteredPassword);
      setIsUnlocked(true);

      // Initialize keyring with loaded wallets
      await keyringService.unlock(enteredPassword, loadedWallets);

      // Get active wallet index
      const savedIndex = getActiveWalletIndex();

      // CRITICAL: Sync session to background storage BEFORE enabling UI
      // This prevents "Wallet Locked" errors when immediate dApp requests occur
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
        const activeAddr = (savedIndex >= 0 && savedIndex < loadedWallets.length)
          ? loadedWallets[savedIndex].address
          : loadedWallets[0].address;

        // Try both modern and legacy property names
        const activePk = keyringService.getPrivateKey(activeAddr) ||
          loadedWallets[savedIndex]?.privateKeyB64 ||
          loadedWallets[savedIndex]?.privateKey;

        console.log('[DEBUG] Saving Session for Addr:', activeAddr);
        console.log('[DEBUG] Private Key Present?', !!activePk, 'Length:', activePk ? activePk.length : 0);

        if (!activePk) {
          console.error('[App] CRITICAL: Attempted to save session without private key!');
          throw new Error('Wallet unlocking failed: Key material missing. Please restore wallet.');
        }

        if (activePk) {
          // SECURITY: Zero-Trust Architecture
          // 1. Generate ephemeral session key
          const sessionEncryptionKey = generateSessionKey();
          setSessionKey(sessionEncryptionKey); // Store in UI memory

          // 2. Encrypt the private key
          const encryptedPk = await encryptSession(activePk, sessionEncryptionKey);

          const sessionData = {
            address: activeAddr,
            publicKey: keyringService.getPublicKey(activeAddr),
            // privateKey: activePk, // REMOVED: Never store plaintext
            encryptedPrivateKey: encryptedPk, // ADDED: Ciphertext only
            network: settings?.network || 'mainnet',
            timestamp: Date.now()
          };

          // 3. Save ENCRYPTED session to storage
          await chrome.storage.session.set({
            dapp_wallet_session: JSON.stringify(sessionData)
          });
          console.log('[App] Zero-Trust Session Synced (Encrypted)');

          // 4. Send KEY to background memory (via secure message)
          // The key never touches storage!
          chrome.runtime.sendMessage({
            type: 'SYNC_SESSION',
            sessionKey: sessionEncryptionKey
          });
        }
      }

      // Set active wallet (restore from saved index or default to first)
      if (savedIndex >= 0 && savedIndex < loadedWallets.length) {
        setActiveWalletIdx(savedIndex); // Changed from setActiveWallet to setActiveWalletIdx
        // setActiveWalletAddress(loadedWallets[savedIndex].address); // This state variable is not in the original code

        // Switch keyring to active wallet
        await keyringService.setActiveWallet(loadedWallets[savedIndex].address);

        // Initialize Token & Privacy Services
        await ocs01Manager.initializeSecure(enteredPassword);
        const activePk = keyringService.getPrivateKey(loadedWallets[savedIndex].address);
        const { privacyService } = await import('./services/PrivacyService');
        privacyService.setPrivateKey(activePk, enteredPassword);

        // Reset to home view
        setView('dashboard'); // Changed from setCurrentView('home') to setView('dashboard')
      } else if (loadedWallets.length > 0) {
        setActiveWalletIdx(0); // Changed from setActiveWallet to setActiveWalletIdx
        // setActiveWalletAddress(loadedWallets[0].address); // This state variable is not in the original code
        await keyringService.setActiveWallet(loadedWallets[0].address);
        setActiveWalletIndex(0);

        // Initialize Token & Privacy Services
        await ocs01Manager.initializeSecure(enteredPassword);
        const activePk = keyringService.getPrivateKey(loadedWallets[0].address);
        const { privacyService } = await import('./services/PrivacyService');
        privacyService.setPrivateKey(activePk, enteredPassword);

        setView('dashboard'); // Changed from setCurrentView('home') to setView('dashboard')
      }

      // Load saved settings - force mainnet (testnet disabled)
      const savedSettings = getSettings();
      setSettingsState({ ...savedSettings, network: 'mainnet' });

      // Log wallet unlock
      // Assuming logWalletUnlock is a defined function
      // logWalletUnlock(loadedWallets.length).catch(err => {
      //   console.warn('[App] Failed to log wallet unlock:', err);
      // });

      // Refresh balances after unlock
      if (loadedWallets.length > 0) {
        refreshAllBalances(loadedWallets);
      }

      // FINAL SUCCESS: Only save persistent session if everything above succeeded
      await saveActiveSession(enteredPassword);
      console.log('[App] Session saved with AES-GCM encryption, expires in 5 minutes');


      // [RABBY-STYLE] Instant fetch history after unlock
      // Optimization: Fetch only 20 latest txs on unlock for speed
      setTimeout(() => refreshTransactions(20), 100);

      console.log('[App] Login successful - Data restored from cache');
    } catch (error) {
      console.error('[App] Failed to unlock:', error);
      // Assuming setError is a state setter for an error state
      // setError(error.message || 'Invalid password');
      throw error; // Re-throw to propagate error for UI handling
    }
  }, [refreshAllBalances, verifyPassword, loadWallets, keyringService, getActiveWalletIndex, setActiveWalletIdx, setActiveWalletIndex, setView, getSettings, setSettingsState, setWallets, setPassword, setIsUnlocked]);

  // Handle wallet recovery from seed phrase or private key
  const handleRecover = useCallback(async ({ type, value, newPassword }) => {
    try {
      console.log('[App] Starting wallet recovery...', { type });

      // Clear existing data first
      localStorage.clear();
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.clear();
      }
      sessionStorage.clear();

      let recoveredWallet;

      if (type === 'mnemonic') {
        // Recover from seed phrase
        const { importFromMnemonic } = await import('./utils/crypto');
        recoveredWallet = await importFromMnemonic(value);
        console.log('[App] [OK] Wallet recovered from mnemonic');
      } else {
        // Recover from private key
        const { importFromPrivateKey } = await import('./utils/crypto');
        recoveredWallet = await importFromPrivateKey(value);
        console.log('[App] [OK] Wallet recovered from private key');
      }

      // Save recovered wallet (This encrypts it with newPassword)
      await addWallet(recoveredWallet, newPassword);

      // Initialize keyring
      await keyringService.initialize([recoveredWallet], newPassword);
      keyringService.addKey(
        recoveredWallet.address,
        recoveredWallet.privateKeyB64,
        recoveredWallet.publicKeyB64
      );

      // Update state
      setPassword(newPassword);
      const walletWithMeta = {
        ...recoveredWallet,
        id: crypto.randomUUID(),
        name: 'Recovered Wallet'
      };
      setWallets([walletWithMeta]);
      setIsUnlocked(true);

      // Session Management (Fixed)
      // We save the session securely so it survives popup close, but expires in 5 mins
      await saveActiveSession(newPassword);

      // Fetch balance
      try {
        const balanceData = await rpcClient.getBalance(recoveredWallet.address);
        if (balanceData?.balance !== undefined) {
          setBalance(balanceData.balance);
          setNonce(balanceData.nonce || 0);
        }
      } catch (err) {
        console.warn('[App] Failed to fetch balance:', err);
        setBalance(0);
        setNonce(0);
      }

      setView('dashboard');
      console.log('[App] [OK] Wallet recovery complete');

    } catch (error) {
      console.error('[App] [ERROR] Recovery failed:', error);
      throw new Error(error.message || 'Failed to recover wallet. Please check your input.');
    }
  }, [keyringService, rpcClient, addWallet, setWalletPassword]);




  // Handle password change - Update all services in memory
  const handlePasswordChange = useCallback(async (newPassword) => {
    try {
      setPassword(newPassword);

      // Re-initialize keyring with new password
      if (wallets.length > 0) {
        await keyringService.initialize(wallets, newPassword);
        const activeWallet = wallets[activeWalletIndex];
        if (activeWallet) {
          await keyringService.setActiveWallet(activeWallet.address);

          // Update ocs01Manager
          await ocs01Manager.initializeSecure(newPassword);

          // Update privacyService
          const activePk = keyringService.getPrivateKey(activeWallet.address);
          // Privacy service update
          privacyService.setPrivateKey(activePk, newPassword);
        }
      }
      showToast('Password updated successfully', 'success');
    } catch (error) {
      console.error('Failed to update services after password change:', error);
      showToast('Password changed, but session refresh failed. Please re-lock.', 'warning');
    }
  }, [wallets, activeWalletIndex, showToast]);


  // Setup password for new wallet
  const handleSetupPassword = useCallback(async (newPassword) => {
    setPassword(newPassword);

    if (pendingWallet) {
      // Save the pending wallet with the new password
      await addWallet(pendingWallet, newPassword);
      setWallets([{ ...pendingWallet, id: crypto.randomUUID(), name: 'Wallet 1' }]);
      setPendingWallet(null);
    }

    setIsUnlocked(true);
    setView('dashboard');
    // Removed success toast - user can see wallet is created
  }, [pendingWallet]);



  // Handle wallet creation - wallet and password come together now
  const handleWalletGenerated = useCallback(async (newWallet, newPassword) => {
    try {
      // Force clear any existing wallet data before creating new wallet
      if (!(await hasPassword())) {
        // First time - clear everything to ensure clean slate
        try {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.clear();
          }
          localStorage.clear();
          sessionStorage.clear();
          console.log('[App] Forced data clear before wallet creation');
        } catch (clearErr) {
          console.warn('[App] Could not force clear:', clearErr);
        }
      }

      // Save persistent session immediately to prevent premature logout
      await saveActiveSession(newPassword);

      const passToUse = newPassword || password;

      // FIX: Handle race condition (double-fire) where wallet is saved twice
      try {
        await addWallet(newWallet, passToUse);
      } catch (addErr) {
        // If wallet exists, it's likely a race condition. Proceed anyway.
        if (addErr.message && addErr.message.includes('Wallet already exists')) {
          console.warn('[App] Wallet add skipped (duplicate/race-condition), proceeding to login...');
        } else {
          throw addErr;
        }
      }

      // SECURITY: Initialize keyring and add key
      await keyringService.initialize(passToUse);
      keyringService.addKey(newWallet.address, newWallet.privateKeyB64, newWallet.publicKeyB64);

      setPassword(passToUse);
      const walletWithMeta = { ...newWallet, id: crypto.randomUUID(), name: 'Wallet 1' };
      setWallets([walletWithMeta]);
      setIsUnlocked(true);

      // Initialize privacy service for new wallet
      privacyService.setPrivateKey(newWallet.privateKeyB64, passToUse);

      // [FAST] OPTIMIZATION: Skip RPC calls for new wallet (balance is always 0)
      console.log('[App] [FAST] New wallet created - skipping balance fetch (will be 0)');
      setBalance(0);
      setNonce(0);
      setTransactions([]);
      // No RPC calls needed - saves time and bandwidth!

      setView('dashboard');
      // Removed success toast
    } catch (err) {
      console.error('Failed to create wallet:', err);
      showToast(err.message || 'Failed to create wallet', 'error');
    }
  }, [password, showToast, rpcClient]);

  // Handle wallet import - wallet and password come together now
  const handleImportWallet = useCallback(async (importedWallet, newPassword) => {
    try {
      // Force clear any existing wallet data before importing (first time only)
      if (!(await hasPassword())) {
        // First time - clear everything to ensure clean slate
        try {
          if (typeof chrome !== 'undefined' && chrome.storage) {
            await chrome.storage.local.clear();
          }
          localStorage.clear();
          sessionStorage.clear();
          console.log('[App] Forced data clear before wallet import');
        } catch (clearErr) {
          console.warn('[App] Could not force clear:', clearErr);
        }

        // First time - set password
      }

      const passToUse = newPassword || password;

      // FIX: Handle race condition where wallet is added twice
      try {
        await addWallet(importedWallet, passToUse);
      } catch (addErr) {
        if (addErr.message && addErr.message.includes('Wallet already exists')) {
          console.warn('[App] Import ignored (duplicate), proceeding...');
        } else {
          throw addErr;
        }
      }

      // Save persistent session immediately
      await saveActiveSession(passToUse);

      // SECURITY: Initialize keyring and add key
      if (!keyringService.isUnlocked()) {
        await keyringService.initialize(passToUse);
      }
      keyringService.addKey(importedWallet.address, importedWallet.privateKeyB64, importedWallet.publicKeyB64);

      setPassword(passToUse);
      const existingWallets = wallets.length > 0 ? wallets : [];
      const newWallet = { ...importedWallet, id: crypto.randomUUID(), name: `Wallet ${existingWallets.length + 1}` };
      setWallets([...existingWallets, newWallet]);
      setIsUnlocked(true);

      // Initialize privacy service with key and password
      privacyService.setPrivateKey(importedWallet.privateKeyB64, passToUse);


      // [RABBY-STYLE] Instant fetch history after import
      setTimeout(() => refreshTransactions(50), 100);

      // Note: Data fetching (balance, tokens, transactions, privacy) will be 
      // automatically triggered by the main useEffect when view changes to 'dashboard'.
      // This ensures fully synchronized loading state.

      setView('dashboard');
      // Removed success toast
    } catch (err) {
      console.error('Failed to import wallet:', err);
      showToast(err.message || 'Failed to import wallet', 'error');
    }
  }, [password, wallets, showToast, rpcClient]);

  // Handle disconnect/reset
  const handleDisconnect = useCallback(() => {
    clearAllData();
    setWallets([]);
    setPassword(null);
    setBalance(0);
    setNonce(0);
    setTransactions([]);
    setIsUnlocked(false);
    setView('welcome');
    // Removed disconnect toast
  }, []);

  // Update settings
  const handleUpdateSettings = useCallback((newSettings) => {
    const updated = { ...settings, ...newSettings };
    const previousNetwork = settings?.network;
    const newNetwork = newSettings?.network;

    saveSettings(updated);
    setSettingsState(updated);

    if (newSettings.rpcUrl) {
      setRpcUrl(newSettings.rpcUrl);
    }

    // If network changed, reset balance and transactions
    if (newNetwork && previousNetwork !== newNetwork) {
      console.log(`Network changed from ${previousNetwork} to ${newNetwork}`);
      setBalance(0);
      setTransactions(getTxHistory(newNetwork));
      // Data will auto-refresh from useEffect hooks in Dashboard
    }

    // Removed settings saved toast
  }, [settings]);

  // Switch wallet
  const handleSwitchWallet = useCallback((index) => {
    setActiveWalletIdx(index);
    setActiveWalletIndex(index);
    setBalance(0);
    setTransactions([]);
  }, []);

  // Add new wallet (from Dashboard modal)
  const handleAddWallet = useCallback(async (options) => {
    try {
      const { generateWallet, importFromPrivateKey, importFromMnemonic } = await import('./utils/crypto.js');

      let newWallet;

      if (options.type === 'create') {
        // Generate new wallet
        newWallet = await generateWallet();
      } else if (options.type === 'import') {
        // Import from private key
        newWallet = await importFromPrivateKey(options.privateKey);
      } else if (options.type === 'import_mnemonic') {
        // Import from mnemonic
        newWallet = await importFromMnemonic(options.mnemonic);
      } else {
        throw new Error('Invalid add wallet type');
      }

      // Add to storage
      await addWallet(newWallet, password);

      // SECURITY: Add key to KeyringService
      keyringService.addKey(newWallet.address, newWallet.privateKeyB64, newWallet.publicKeyB64);

      // Update state
      const walletWithMeta = {
        ...newWallet,
        id: crypto.randomUUID(),
        name: `Wallet ${wallets.length + 1}`
      };

      const newWallets = [...wallets, walletWithMeta];
      setWallets(newWallets);

      // Switch to new wallet
      const newIndex = newWallets.length - 1;
      setActiveWalletIdx(newIndex);
      setActiveWalletIndex(newIndex);
      setBalance(0);
      setTransactions([]);

      showToast('New wallet added successfully', 'success');
    } catch (err) {
      console.error('Failed to add wallet:', err);
      showToast(err.message || 'Failed to add wallet', 'error');
      throw err;
    }
  }, [password, wallets]);

  // Rename wallet
  const handleRenameWallet = useCallback(async (index, newName) => {
    try {
      const walletToUpdate = wallets[index];
      if (!walletToUpdate) return;

      // Use ID if available, otherwise use address as fallback
      const identifier = walletToUpdate.id || walletToUpdate.address;

      // Update in storage
      await updateWalletName(identifier, newName, password);

      // Update state
      const updatedWallets = [...wallets];
      updatedWallets[index] = { ...walletToUpdate, name: newName };
      setWallets(updatedWallets);

      showToast('Wallet renamed successfully', 'success');
    } catch (err) {
      console.error('Failed to rename wallet:', err);
      showToast(err.message || 'Failed to rename wallet', 'error');
    }
  }, [wallets, password, showToast]);

  // Render loading state
  if (view === 'loading') {
    return (
      <div className="wallet-container">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="loading-spinner mb-lg" style={{ width: 40, height: 40 }} />
          <p className="text-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-container">
      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* dApp Approval Mode */}
      {dappApprovalId ? (
        isUnlocked ? (
          <DappApprovalScreen approvalId={dappApprovalId} sessionKey={sessionKey} />
        ) : (
          <LockScreen onUnlock={handleUnlock} onRecover={handleRecover} />
        )
      ) : (
        <>
          {/* Lock Screen */}
          {view === 'lock' && (
            <LockScreen onUnlock={handleUnlock} onRecover={handleRecover} />
          )}

          {/* Setup Password (for new users) */}
          {view === 'setup-password' && (
            <SetupPassword
              onComplete={handleSetupPassword}
              isNewWallet={true}
            />
          )}

          {/* Welcome Screen */}
          {view === 'welcome' && (
            <WelcomeScreen
              onCreateWallet={async () => {
                // Clear any existing corrupted data before creating new wallet
                try {
                  if (typeof chrome !== 'undefined' && chrome.storage) {
                    await chrome.storage.local.clear();
                  }
                  localStorage.clear();
                  sessionStorage.clear();
                  console.log('[App] Data cleared for fresh wallet creation');
                } catch (err) {
                  console.warn('[App] Could not clear data:', err);
                }
                setView('create');
              }}
              onImportWallet={async () => {
                // Clear any existing corrupted data before importing
                try {
                  if (typeof chrome !== 'undefined' && chrome.storage) {
                    await chrome.storage.local.clear();
                  }
                  localStorage.clear();
                  sessionStorage.clear();
                  console.log('[App] Data cleared for fresh wallet import');
                } catch (err) {
                  console.warn('[App] Could not clear data:', err);
                }
                setView('import');
              }}
            />
          )}

          {/* Create Wallet */}
          {view === 'create' && (
            <CreateWalletScreen
              onBack={() => setView('welcome')}
              onComplete={handleWalletGenerated}
            />
          )}

          {/* Import Wallet */}
          {view === 'import' && (
            <ImportWalletScreen
              onBack={() => setView('welcome')}
              onComplete={handleImportWallet}
            />
          )}

          {/* Dashboard */}
          {view === 'dashboard' && (
            <Dashboard
              wallet={wallet}
              wallets={wallets}
              balance={balance}
              nonce={nonce}
              transactions={transactions}
              settings={settings}
              onLock={handleLock}
              onUpdateSettings={handleUpdateSettings}
              onSwitchWallet={handleSwitchWallet}
              onAddWallet={handleAddWallet}
              onRenameWallet={handleRenameWallet}
              onDisconnect={handleDisconnect}
              isRefreshing={isRefreshing}
              onRefresh={refreshBalance} // Only refreshes balance normally
              onFetchHistory={refreshTransactions} // Special prop for History View
              allTokens={allTokens}
              isLoadingTokens={isLoadingTokens}
              onRefreshTokens={fetchAllTokens}
              onLoadMoreTransactions={handleLoadMoreTransactions}
              hasMoreTransactions={hasMoreTxs}
              isLoadingMore={isLoadingMore}
              onOpenSettings={() => setView('settings')}
            />
          )}

          {/* Settings Screen */}
          {view === 'settings' && (
            <SettingsScreen
              wallet={wallet}
              settings={settings}
              password={password}
              onUpdateSettings={handleUpdateSettings}
              onBack={() => setView('dashboard')}
              onDisconnect={handleDisconnect}
              onLock={handleLock}
              onPasswordChange={handlePasswordChange}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
