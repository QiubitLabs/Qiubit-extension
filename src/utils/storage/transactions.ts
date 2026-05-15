import { STORAGE_KEYS } from '../../constants';
// @ts-ignore
import { saveTransaction, getTransactionsByAddress } from '../indexedDB';
import { storage } from './adapter';

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
