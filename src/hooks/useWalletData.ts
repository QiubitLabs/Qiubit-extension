import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { Wallet, Token } from '../types';
import { WalletService } from '../services/core/WalletService';
import { SessionService } from '../services/core/SessionService';
import { saveWalletsSecure } from '../utils/storage';
import { loadSnapshot, saveSnapshot } from '../utils/walletSnapshot';
import { evmBalanceCache } from '../utils/evmBalanceCache';
import { withEvmFallback } from '../utils/evmProvider';

// Refresh coalescing thresholds
const MIN_REFRESH_SPACING_MANUAL = 3_000;     // 3s — block rapid manual refresh spam
const MIN_REFRESH_SPACING_AUTO = 5 * 60_000;  // 5min — auto refresh only if last fetch > 5min
const AUTO_INTERVAL_MS = 5 * 60_000;          // 5min — auto-refresh interval

interface UseWalletDataProps {
    wallet: Wallet | null;
    wallets: Wallet[];
    isUnlocked: boolean;
    password: string | null;
    network: string;
    setWallets: (wallets: Wallet[]) => void;
    extendSession: () => void;
}

export function useWalletData({
    wallet,
    wallets,
    isUnlocked,
    password,
    network,
    setWallets,
    extendSession
}: UseWalletDataProps) {
    const [balance, setBalance] = useState(0);
    const [nonce, setNonce] = useState(0);
    const [tokens, setTokens] = useState<Token[]>([]);
    const [privacyBalance, setPrivacyBalance] = useState<any>(null);

    // Loading states
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingTokens, setIsLoadingTokens] = useState(false);

    // Track mounted state to prevent updates after unmount
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    // Count refresh cycles to throttle heavy operations
    const refreshCount = useRef(0);

    // Refresh coalescing: track last successful refresh per (address, mode)
    const lastRefreshAt = useRef<Map<string, number>>(new Map());
    // Inflight refresh tracker — single-flight per address
    const inflightRefresh = useRef<Map<string, Promise<void>>>(new Map());

    // 0. RESET STATE: Load from localStorage cache first, then refresh in background
    useEffect(() => {
        if (!wallet?.address) return;
        const snap = loadSnapshot(wallet.address);
        if (snap) {
            setBalance(snap.balance);
            setNonce(snap.nonce);
            setTokens(snap.tokens);
            // Snapshot loaded — never spin; lifecycle effect triggers refresh if stale
            setIsRefreshing(false);
            setIsLoadingTokens(false);
        } else {
            setBalance(0);
            setNonce(0);
            setTokens([]);
            setIsRefreshing(true);
            setIsLoadingTokens(true);
        }
        setPrivacyBalance(null);
    }, [wallet?.address]);

    // 1. Core Refresh Logic (Aggregated but Non-Blocking)
    const refreshAll = useCallback(async (mode: 'public' | 'private' | 'both' = 'both', opts: { force?: boolean; auto?: boolean } = {}) => {
        if (!wallet?.address || !isUnlocked) return;

        const address = wallet.address;
        const evmAddress = wallet.evmAddress;
        const coalesceKey = `${address}:${mode}`;

        // Single-flight: if a refresh for this (address,mode) is already running, return it
        const existing = inflightRefresh.current.get(coalesceKey);
        if (existing) return existing;

        // Coalesce: skip if we refreshed too recently (unless forced)
        if (!opts.force) {
            const last = lastRefreshAt.current.get(coalesceKey) ?? 0;
            const since = Date.now() - last;
            const minSpacing = opts.auto ? MIN_REFRESH_SPACING_AUTO : MIN_REFRESH_SPACING_MANUAL;
            if (since < minSpacing) {
                console.log(`[useWalletData] Skipping refresh (${Math.round(since / 1000)}s since last, min ${minSpacing / 1000}s)`);
                return;
            }
        }

        // Set loading states
        if (mode === 'both' || mode === 'public') {
            setIsRefreshing(true);
            setIsLoadingTokens(true);
        }

        // A. Native Balance (Critical - Fetch First/Fastest)
        const fetchNative = async () => {
            try {
                const details = await WalletService.getBalance(address);
                if (isMounted.current && address === wallet.address) {
                    setBalance(details.balance);
                    setNonce(details.nonce);
                    // Partial snapshot save (tokens updated later in fetchTokens)
                    saveSnapshot(address, { balance: details.balance, nonce: details.nonce });
                    
                    // Sync legacy storage
                    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                        const result = await chrome.storage.local.get('balances');
                        const currentBalances = (result.balances || {}) as Record<string, string>;
                        currentBalances[address] = String(details.balance);
                        await chrome.storage.local.set({ balances: currentBalances });
                    }
                    
                    // Sync Session
                    await SessionService.syncActiveWalletToBackground(address, network);
                }
                return details.balance;
            } catch (e) {
                console.error('Failed to fetch native balance', e);
                return 0;
            } finally {
                if (isMounted.current && (mode === 'public' || mode === 'both')) {
                    setIsRefreshing(false); // Native balance done means "refreshed" for most users
                }
            }
        };

        // B. Tokens (Secondary - Parallel)
        const fetchTokens = async (nativeBalance: number) => {
            try {
                const tokenList = await WalletService.getTokens(address);
                if (isMounted.current && address === wallet.address) {
                    const nativeToken: Token = {
                        symbol: 'OCT',
                        name: 'Octra',
                        balance: nativeBalance,
                        isNative: true,
                        decimals: 8
                    };

                    let ethBalanceStr = '0';
                    let wOctBalanceStr = '0';
                    let usdcBalanceStr = '0';

                    if (evmAddress) {
                        try {
                            if (!ethers.isAddress(evmAddress)) {
                                console.error('Invalid EVM address format:', evmAddress);
                                return;
                            }

                            const erc20Abi = ['function balanceOf(address owner) view returns (uint256)'];
                            const USDC_ADDR = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
                            const WOCT_ADDR = ethers.getAddress('0x4647e1fE715c9e23959022C2416C71867F5a6E80');
                            const lowerEvm = evmAddress.toLowerCase();

                            // Parallel EVM reads with cache (SWR) + auto-fallback (Cloudflare → Alchemy on error).
                            // On total failure, use last-known cached value (any age) instead of '0'.
                            const ethKey = `1:${lowerEvm}:native`;
                            const usdcKey = `1:${lowerEvm}:erc20:${USDC_ADDR}`;
                            const wOctKey = `1:${lowerEvm}:erc20:${WOCT_ADDR}`;

                            const [ethVal, usdcVal, wOctVal] = await Promise.all([
                                evmBalanceCache.swr(ethKey, async () => {
                                    const wei = await withEvmFallback(p => p.getBalance(evmAddress));
                                    return parseFloat(parseFloat(ethers.formatEther(wei)).toFixed(8)).toString();
                                }).catch(() => evmBalanceCache.getAny(ethKey) ?? '0'),
                                evmBalanceCache.swr(usdcKey, async () => {
                                    const b = await withEvmFallback(p => new ethers.Contract(USDC_ADDR, erc20Abi, p).balanceOf(evmAddress));
                                    return Number(ethers.formatUnits(b, 6)).toFixed(2);
                                }).catch(() => evmBalanceCache.getAny(usdcKey) ?? '0'),
                                evmBalanceCache.swr(wOctKey, async () => {
                                    const b = await withEvmFallback(p => new ethers.Contract(WOCT_ADDR, erc20Abi, p).balanceOf(evmAddress));
                                    return Number(ethers.formatUnits(b, 6)).toFixed(4);
                                }).catch(() => evmBalanceCache.getAny(wOctKey) ?? '0'),
                            ]);

                            ethBalanceStr = ethVal;
                            usdcBalanceStr = usdcVal;
                            wOctBalanceStr = wOctVal;
                        } catch(e) {
                            console.warn('Failed to fetch EVM balances', e);
                        }
                    }

                    const evmTokens: Token[] = [
                        {
                            symbol: 'ETH',
                            name: 'Ethereum',
                            balance: ethBalanceStr,
                            isNative: false,
                            isEVM: true,
                            logoUrl: '/eth-icon.svg',
                            decimals: 18
                        },
                        {
                            symbol: 'wOCT',
                            name: 'Wrapped Octra (ETH)',
                            balance: wOctBalanceStr,
                            isNative: false,
                            isEVM: true,
                            logoUrl: '/qiubit-icon.svg',
                            decimals: 6,
                            contractAddress: '0x4647e1fE715c9e23959022C2416C71867F5a6E80'
                        },
                        {
                            symbol: 'USDC',
                            name: 'USD Coin',
                            balance: usdcBalanceStr,
                            isNative: false,
                            isEVM: true,
                            logoUrl: '/usdc-icon.svg',
                            decimals: 6
                        }
                    ];

                    const merged = [nativeToken, ...evmTokens, ...tokenList];
                    setTokens(merged);
                    // Full snapshot save with token list (balance/nonce already saved by fetchNative)
                    saveSnapshot(address, { tokens: merged });
                }
            } catch (e) {
                console.warn('Failed to fetch tokens', e);
            } finally {
                if (isMounted.current) setIsLoadingTokens(false);
            }
        };

        // C. Privacy (Background - Parallel)
        const fetchPrivacy = async () => {
            if (!isUnlocked) return;
            try {
                const privacyData = await WalletService.getPrivacyBalance(address);
                if (isMounted.current && address === wallet.address && privacyData) {
                    setPrivacyBalance(privacyData);
                }
            } catch (e) {
                console.warn('Failed to fetch privacy balance', e);
            }
        };

        // D. Background Wallets List (skip active wallet — already fetched by fetchNative)
        const fetchOtherWallets = async () => {
             try {
                const others = wallets.filter(w => w.address !== address);
                if (others.length === 0) return;
                const updatedOthers = await WalletService.refreshBalances(others);
                const updatedWallets = wallets.map(w => updatedOthers.find(o => o.address === w.address) ?? w);
                const hasChanges = updatedWallets.some((w, i) => w.lastKnownBalance !== wallets[i].lastKnownBalance);
                if (hasChanges && isMounted.current) {
                    setWallets(updatedWallets);
                    if (password) await saveWalletsSecure(updatedWallets, password);
                }
             } catch (e) { console.warn('Failed to refresh other wallets', e); }
        };

        // Wrap full refresh sequence in single-flight promise so concurrent calls dedupe.
        // fetchOtherWallets runs ONLY on user-triggered (force) refresh — too costly per cycle.
        const runRefresh = (async () => {
            try {
                const nativeBalance = await fetchNative();
                refreshCount.current += 1;
                const tasks: Promise<any>[] = [fetchTokens(nativeBalance), fetchPrivacy()];
                if (opts.force) tasks.push(fetchOtherWallets());
                await Promise.all(tasks);
                lastRefreshAt.current.set(coalesceKey, Date.now());
            } finally {
                inflightRefresh.current.delete(coalesceKey);
            }
        })();
        inflightRefresh.current.set(coalesceKey, runRefresh);
        return runRefresh;

    }, [wallet, wallets, isUnlocked, password, network, setWallets]);

    // 2. Lifecycle: 5-minute auto-refresh interval (only when popup is visible).
    //    Auto-fetch on wallet switch only when: no snapshot, or snapshot older than 5 min.
    //    Fresh snapshots (<5 min) wait for the interval; stale ones fetch immediately.
    useEffect(() => {
        if (!wallet || !isUnlocked) return;

        const snap = loadSnapshot(wallet.address);
        const snapAge = snap ? Date.now() - snap.ts : Infinity;
        const needsImmediateFetch = !snap || snapAge > MIN_REFRESH_SPACING_AUTO;

        if (needsImmediateFetch && document.visibilityState === 'visible') {
            refreshAll('both', { auto: true });
        }

        // 5-minute auto-refresh interval with jitter
        const jitter = Math.random() * 30_000 - 15_000;
        const intervalTime = AUTO_INTERVAL_MS + jitter;

        const timer = setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            refreshAll('both', { auto: true });
        }, intervalTime);

        return () => clearInterval(timer);
    }, [wallet?.address, isUnlocked, refreshAll]);

    // 3. Keep-Alive Heartbeat (Separate short interval)
    useEffect(() => {
        if (!isUnlocked) return;

        const heartbeat = setInterval(() => {
            extendSession();
            // We can also lightweight sync session here if needed
            if (wallet?.address) {
                SessionService.syncActiveWalletToBackground(wallet.address, network).catch(() => { });
            }
        }, 5000);

        return () => clearInterval(heartbeat);
    }, [isUnlocked, extendSession, wallet?.address, network]);

    // 4. EVM SWR Balance Updates
    useEffect(() => {
        const handleEvmBalanceUpdated = (e: Event) => {
            const ev = e as CustomEvent<{ key: string, value: string }>;
            const { key, value } = ev.detail;
            
            if (isMounted.current && wallet?.evmAddress) {
                const lowerEvm = wallet.evmAddress.toLowerCase();
                if (key.includes(lowerEvm)) {
                    setTokens(prev => {
                        const newTokens = [...prev];
                        let changed = false;
                        
                        const updateToken = (symbol: string) => {
                            const idx = newTokens.findIndex(t => t.symbol === symbol);
                            if (idx >= 0 && newTokens[idx].balance !== value) {
                                newTokens[idx] = { ...newTokens[idx], balance: value };
                                changed = true;
                            }
                        };

                        if (key.endsWith(':native')) {
                            updateToken('ETH');
                        } else if (key.toLowerCase().includes('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')) {
                            updateToken('USDC');
                        } else if (key.toLowerCase().includes('0x4647e1fe715c9e23959022c2416c71867f5a6e80')) {
                            updateToken('wOCT');
                        }
                        
                        if (changed && wallet.address) {
                            saveSnapshot(wallet.address, { tokens: newTokens });
                            return newTokens;
                        }
                        return prev;
                    });
                }
            }
        };

        window.addEventListener('evmBalanceUpdated', handleEvmBalanceUpdated);
        return () => window.removeEventListener('evmBalanceUpdated', handleEvmBalanceUpdated);
    }, [wallet?.address, wallet?.evmAddress]);

    return {
        balance,
        nonce,
        tokens,
        privacyBalance,
        isRefreshing,
        isLoadingTokens,
        refreshAll,
        // Setters allowed for optimistic updates if needed
        setBalance,
        setNonce,
        setTokens
    };
}
