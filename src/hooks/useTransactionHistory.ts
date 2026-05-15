import { useState, useCallback, useEffect, useRef } from 'react';
import { Wallet, Transaction } from '../types';
import { getRpcClient } from '../services/network/RpcService';
import {
    loadTxHistoryAsync,
    saveTxHistorySecure as saveTxHistory,
    getAllPrivacyTransactionsSecure as getAllPrivacyTransactions
} from '../utils/storage';

// Staged tx cache: avoid hitting the RPC on every render
let stagedTxCache: { data: any[]; ts: number } | null = null;
const STAGED_TTL = 20_000;

// Refresh coalescing: skip if refreshed too recently
const TX_REFRESH_MIN_SPACING = 30_000;

const INITIAL_TX_FETCH = 100;    // tx refs requested when local storage is empty (first ever load)
const INCREMENTAL_TX_CHECK = 10; // tx refs checked on each periodic/manual refresh
const DISPLAY_PAGE = 25;         // items shown per page
const LOAD_MORE_FETCH = 50;      // extra refs requested when user needs more beyond storage

async function getStagedTxsCached(rpcClient: any): Promise<any[]> {
    if (stagedTxCache && Date.now() - stagedTxCache.ts < STAGED_TTL) {
        return stagedTxCache.data;
    }
    const result = await rpcClient.getStagedTransactions();
    stagedTxCache = { data: result || [], ts: Date.now() };
    return stagedTxCache.data;
}

export function useTransactionHistory(
    wallet: Wallet | null,
    password: string | null,
    settings: any
) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [displayLimit, setDisplayLimit] = useState(DISPLAY_PAGE);
    const [totalOnChain, setTotalOnChain] = useState(0);
    const [storedCount, setStoredCount] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const rpcClient = getRpcClient();
    const lastTxRefreshAt = useRef<Map<string, number>>(new Map());
    const inflightTxRefresh = useRef<Map<string, Promise<void>>>(new Map());

    // Refs to read current state inside callbacks without stale closure
    const displayLimitRef = useRef(DISPLAY_PAGE);
    const totalOnChainRef = useRef(0);
    const storedCountRef = useRef(0);

    useEffect(() => { displayLimitRef.current = displayLimit; }, [displayLimit]);
    useEffect(() => { totalOnChainRef.current = totalOnChain; }, [totalOnChain]);
    useEffect(() => { storedCountRef.current = storedCount; }, [storedCount]);

    // hasMoreTxs: true when there's more to show — either in storage or on chain
    const hasMoreTxs = displayLimit < storedCount || storedCount < totalOnChain;

    // --- DISPLAY: Rebuild the visible list from storage + pending. No RPC. ---
    const renderDisplay = useCallback(async (limit: number): Promise<void> => {
        if (!wallet?.address) return;
        const addr = wallet.address;
        const network = settings.network || 'mainnet';

        try {
            // Load all stored confirmed txs (IndexedDB → chrome.storage fallback)
            const stored: Transaction[] = await loadTxHistoryAsync(network, addr, 1000);
            const sorted = stored.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
            setStoredCount(stored.length);
            storedCountRef.current = stored.length;

            // Get pending from staging queue (20s cache — no extra RPC hit on every render)
            let pendingTxs: Transaction[] = [];
            try {
                const stagingTxs = await getStagedTxsCached(rpcClient);
                if (stagingTxs?.length) {
                    const userAddrLower = addr.toLowerCase();
                    const confirmedHashes = new Set(stored.map(tx => tx.hash));
                    pendingTxs = stagingTxs
                        .filter((tx: any) => {
                            const from = (tx.from || '').toLowerCase();
                            const to = (tx.to || tx.to_ || '').toLowerCase();
                            return (from === userAddrLower || to === userAddrLower) && !confirmedHashes.has(tx.hash);
                        })
                        .map((tx: any): Transaction => ({
                            hash: tx.hash || `pending_${tx.nonce}`,
                            type: (tx.to || tx.to_ || '').toLowerCase() === userAddrLower ? 'in' : 'out',
                            amount: parseFloat(tx.amount || 0) / (tx.amount && String(tx.amount).includes('.') ? 1 : 1_000_000),
                            address: (tx.to || tx.to_ || '').toLowerCase() === userAddrLower ? tx.from : (tx.to || tx.to_),
                            timestamp: Date.now(),
                            status: 'pending' as const,
                            ou: tx.ou
                        }));
                }
            } catch { /* ignore staging errors */ }

            setTransactions([...pendingTxs, ...sorted.slice(0, limit)]);
        } catch { /* ignore */ }
    }, [wallet?.address, settings.network, rpcClient]);

    // --- FETCH: Pull tx refs from RPC, fetch missing details, merge into storage. ---
    const fetchAndMerge = useCallback(async (fetchLimit: number): Promise<void> => {
        if (!wallet?.address) return;
        const addr = wallet.address;
        const network = settings.network || 'mainnet';

        try {
            const [allPrivacyLogs, info] = await Promise.all([
                getAllPrivacyTransactions(password || ''),
                rpcClient.getAddressInfo(addr, fetchLimit)
            ]);

            const total = info.transaction_count || 0;
            setTotalOnChain(total);
            totalOnChainRef.current = total;

            if (!info.recent_transactions?.length) return;

            const stored: Transaction[] = await loadTxHistoryAsync(network, addr, 1000);
            const existingTxMap = new Map(stored.map(tx => [tx.hash, tx]));

            // Collect only refs not yet confirmed in storage
            const hashesToFetch: any[] = [];
            for (const ref of info.recent_transactions) {
                const existing = existingTxMap.get(ref.hash);
                if (existing?.status === 'confirmed') break; // hit known boundary → stop
                if (!existing || existing.status === 'pending') hashesToFetch.push(ref);
            }

            if (hashesToFetch.length === 0) return;

            // Fetch details in small parallel batches to avoid rate limit
            const newConfirmedTxs: Transaction[] = [];
            const TX_CONCURRENCY = 2;
            for (let i = 0; i < hashesToFetch.length; i += TX_CONCURRENCY) {
                const batch = hashesToFetch.slice(i, i + TX_CONCURRENCY);
                if (i > 0) await new Promise(r => setTimeout(r, 300));

                const results = await Promise.all(batch.map(async (ref) => {
                    try {
                        const txData = await rpcClient.getTransaction(ref.hash);
                        const parsed = txData.parsed_tx || txData;
                        const toAddr = parsed.to || parsed.to_;
                        const isIncoming = toAddr?.toLowerCase() === addr.toLowerCase();
                        const privacyLog = allPrivacyLogs[ref.hash] || null;
                        
                        let txType = isIncoming ? 'in' : 'out';
                        let amount = parseFloat(parsed.amount_raw || parsed.amount || 0) / 1_000_000;
                        let token = 'OCT';

                        // Check for bridge program events
                        if (txData.program_receipt) {
                            const receipt = txData.program_receipt;
                            if (['lock_trusted', 'unlock_trusted', 'lock_to_eth', 'unlock_bridge'].includes(receipt.method)) {
                                // Extract amount from receipt arguments (usually array at index 1)
                                if (Array.isArray(receipt.args) && receipt.args.length > 1) {
                                    amount = parseFloat(receipt.args[1]) / 1_000_000;
                                }
                                txType = 'shield';
                            }
                        } else if (parsed.op_type === 'call' && parsed.message) {
                            // Legacy parsing pattern from webcli for transfer calls
                            try {
                                const p = JSON.parse(parsed.message);
                                if (Array.isArray(p) && p.length >= 2) {
                                    amount = parseFloat(p[1]) / 1_000_000;
                                }
                            } catch (e) { /* ignore parse error */ }
                        }

                        if (privacyLog) txType = privacyLog.type;

                        const timestampRaw = parsed.timestamp || txData.timestamp;
                        const safeRaw = typeof timestampRaw === 'number' ? timestampRaw : Date.now();
                        const safeTimestamp = safeRaw < 100_000_000_000 ? safeRaw * 1000 : safeRaw;

                        return {
                            hash: ref.hash,
                            type: txType as 'in' | 'out',
                            amount,
                            token,
                            address: isIncoming ? parsed.from : toAddr,
                            timestamp: safeTimestamp,
                            status: 'confirmed' as const,
                            epoch: txData.epoch || ref.epoch || parsed.epoch,
                            ou: parsed.ou || txData.ou || '10000',
                            fee: parsed.fee
                        };
                    } catch (e: any) {
                        console.warn(`[useTransactionHistory] Failed to fetch tx ${ref.hash}:`, e.message);
                        return null;
                    }
                }));

                newConfirmedTxs.push(...(results.filter(Boolean) as Transaction[]));
            }

            if (newConfirmedTxs.length > 0) {
                await saveTxHistory(newConfirmedTxs, network, addr);
            }
        } catch (error) {
            console.error('[useTransactionHistory] fetchAndMerge failed:', error);
        }
    }, [wallet?.address, rpcClient, password, settings.network]);

    // --- REFRESH: Check for new txs and update display from storage.
    //     Periodic: checks only INCREMENTAL_TX_CHECK refs.
    //     First ever load (no storage): fetches INITIAL_TX_FETCH refs.
    const refreshTransactions = useCallback(async (opts: { force?: boolean } = {}): Promise<void> => {
        if (!wallet?.address) return;
        const addr = wallet.address;
        const network = settings.network || 'mainnet';

        if (!opts.force) {
            const last = lastTxRefreshAt.current.get(addr) ?? 0;
            if (Date.now() - last < TX_REFRESH_MIN_SPACING) {
                console.log(`[useTransactionHistory] Skipping (${Math.round((Date.now() - last) / 1000)}s since last)`);
                return;
            }
            const inflight = inflightTxRefresh.current.get(addr);
            if (inflight) return inflight;
        }

        const promise = (async () => {
            try {
                // One quick read to decide fetch size (no limit needed, just checking existence)
                const hasStorage = (await loadTxHistoryAsync(network, addr, 1)).length > 0;
                const fetchLimit = hasStorage ? INCREMENTAL_TX_CHECK : INITIAL_TX_FETCH;

                await fetchAndMerge(fetchLimit);
                await renderDisplay(displayLimitRef.current);
                lastTxRefreshAt.current.set(addr, Date.now());
            } finally {
                inflightTxRefresh.current.delete(addr);
            }
        })();

        if (!opts.force) {
            inflightTxRefresh.current.set(addr, promise);
        }
        return promise;
    }, [wallet?.address, fetchAndMerge, renderDisplay, settings.network]);

    // --- LOAD MORE: Increase display page; fetch from RPC only if storage is exhausted. ---
    const loadMoreTransactions = useCallback(async (): Promise<void> => {
        if (isLoadingMore) return;
        setIsLoadingMore(true);

        const newLimit = displayLimitRef.current + DISPLAY_PAGE;
        setDisplayLimit(newLimit);
        displayLimitRef.current = newLimit;

        try {
            if (newLimit > storedCountRef.current && storedCountRef.current < totalOnChainRef.current) {
                // Storage exhausted but more exist on chain — fetch a new batch
                await fetchAndMerge(LOAD_MORE_FETCH);
            }
            await renderDisplay(newLimit);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, fetchAndMerge, renderDisplay]);

    // --- ON WALLET SWITCH: Reset state, load from storage instantly. No RPC. ---
    useEffect(() => {
        if (!wallet?.address) return;
        setDisplayLimit(DISPLAY_PAGE);
        displayLimitRef.current = DISPLAY_PAGE;
        setStoredCount(0);
        storedCountRef.current = 0;
        setTotalOnChain(0);
        totalOnChainRef.current = 0;
        let cancelled = false;
        const network = settings.network || 'mainnet';
        (async () => {
            try {
                const stored = await loadTxHistoryAsync(network, wallet.address, 1000);
                if (!cancelled) {
                    const sorted = stored.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
                    setStoredCount(stored.length);
                    storedCountRef.current = stored.length;
                    setTransactions(sorted.slice(0, DISPLAY_PAGE));
                }
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [wallet?.address, settings.network]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        transactions,
        hasMoreTxs,
        isLoadingMore,
        setTransactions,
        refreshTransactions,
        loadMoreTransactions
    };
}
