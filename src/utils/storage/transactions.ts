import { STORAGE_KEYS } from '../../constants';
// @ts-ignore
import { saveTransaction, getTransactionsByAddress } from '../indexedDB';
import { storage } from './adapter';
import type { Transaction } from '../../types';

// ─── Per-chain EVM history cache ─────────────────────────────────────────────
// Key format: evm_hist_v1:${networkId}:${evmAddr}
// Stores up to 200 txs per chain, sorted newest-first.
const EVM_HIST_MAX = 200;

function evmHistKey(networkId: string, evmAddr: string): string {
    return `evm_hist_v1:${networkId}:${evmAddr.toLowerCase()}`;
}

/** Load cached EVM transactions for a specific chain. Returns [] on miss. */
export async function loadEvmTxHistory(networkId: string, evmAddr: string): Promise<Transaction[]> {
    try {
        const key = evmHistKey(networkId, evmAddr);
        const result = await storage.get(key);
        const raw = result[key];
        if (!raw) return [];
        return JSON.parse(raw) as Transaction[];
    } catch {
        return [];
    }
}

/** Persist EVM transactions for a chain. Merges with existing, deduplicates by hash. */
export async function saveEvmTxHistory(networkId: string, evmAddr: string, newTxs: Transaction[]): Promise<void> {
    if (!newTxs.length) return;
    try {
        const key = evmHistKey(networkId, evmAddr);
        const existing = await loadEvmTxHistory(networkId, evmAddr);
        const txMap = new Map<string, Transaction>();
        existing.forEach(tx => tx.hash && txMap.set(tx.hash, tx));
        newTxs.forEach(tx => tx.hash && txMap.set(tx.hash, tx));
        const merged = Array.from(txMap.values())
            .sort((a, b) => {
                const aT = typeof a.timestamp === 'string' ? parseInt(a.timestamp) : (a.timestamp as number);
                const bT = typeof b.timestamp === 'string' ? parseInt(b.timestamp) : (b.timestamp as number);
                return bT - aT;
            })
            .slice(0, EVM_HIST_MAX);
        await storage.set({ [key]: JSON.stringify(merged) });
    } catch { /* ignore */ }
}

/**
 * Migrate old EVM history storage keys to the new per-chain format.
 * The old code did not cache EVM history, so there is nothing to migrate.
 * This function exists as a no-op scaffold for safe future migrations.
 */
export async function migrateEvmHistory(): Promise<void> {
    // Old keys used no EVM caching — nothing to move.
    // If old keys with pattern 'evm_hist_v0:*' ever existed, clean them up here.
    try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.get(null, (all) => {
                const staleKeys = Object.keys(all || {}).filter(k => k.startsWith('evm_hist_v0:'));
                if (staleKeys.length > 0) chrome.storage.local.remove(staleKeys);
            });
        }
    } catch { /* ignore */ }
}

/**
 * Get Transaction History (Async)
 * Reads from storage adapter (chrome.storage or polyfill).
 */
export async function getTxHistorySecure(network: string = 'mainnet', address?: string): Promise<any[]> {
    try {
        const key = address ? `${STORAGE_KEYS.TX_HISTORY}_${network}_${address}` : `${STORAGE_KEYS.TX_HISTORY}_${network}`;
        const result = await storage.get(key);
        const stored = (result[key] as string) || null;

        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
}

/**
 * Get Transaction History (Asynchronous - Recommended)
 * Reads from IndexedDB (High Capacity) -> Fallback to Adapter
 */
export async function loadTxHistoryAsync(network: string = 'mainnet', address?: string, limit: number = 50): Promise<any[]> {
    try {
        // 1. Try IndexedDB first (Primary Storage)
        if (address) {
            const dbTxs: any[] = await getTransactionsByAddress(address, limit);
            // Filter by network
            const networkTxs = dbTxs.filter(tx => !tx.network || tx.network === network);

            if (networkTxs.length > 0) {
                return networkTxs;
            }
        }

        // 2. Fallback to storage adapter if IDB is empty
        return await getTxHistorySecure(network, address);
    } catch (error) {
        console.warn('[StorageSecure] Async history load failed, falling back to sync:', error);
        return await getTxHistorySecure(network, address);
    }
}

/**
 * Save Transaction History
 */
export async function saveTxHistorySecure(newTransactions: any[], network: string = 'mainnet', address?: string): Promise<void> {
    if (!newTransactions || newTransactions.length === 0) return;

    // 1. Sync to IndexedDB for robust storage (Async, no await needed to block UI)
    if (address) {
        Promise.all(newTransactions.map(tx =>
            saveTransaction({
                ...tx,
                network,
                walletAddress: address,
                storedAt: Date.now()
            })
        )).catch(err => console.error('[IndexedDB] Failed to save txs:', err));
    }

    // 2. Keep lightweight version in storage for instant UI loading
    const history = await getTxHistorySecure(network, address);
    const txMap = new Map();
    history.forEach(tx => txMap.set(tx.hash, tx));
    newTransactions.forEach(tx => txMap.set(tx.hash, tx));

    const merged = Array.from(txMap.values())
        .sort((a, b) => {
            const timeA = a.timestamp || (a.epoch * 10) || 0;
            const timeB = b.timestamp || (b.epoch * 10) || 0;
            return timeB - timeA;
        })
        .slice(0, 200); // Optimization: Keep last 200 in storage (lightweight)

    const key = address ? `${STORAGE_KEYS.TX_HISTORY}_${network}_${address}` : `${STORAGE_KEYS.TX_HISTORY}_${network}`;
    await storage.set({ [key]: JSON.stringify(merged) });
}
