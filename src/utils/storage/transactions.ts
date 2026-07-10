/**
 * LOGIC: Manages persistent transaction histories for EVM chains and the native Octra network.
 * Coordinates lightweight serialization in storage adapters (capped at 200 entries sorted by timestamp) and high-volume index-backed storage in IndexedDB (via getTransactionsByAddress/saveTransaction).
 * EXPORTS:
 *   - loadEvmTxHistory (async function)
 *   - saveEvmTxHistory (async function)
 *   - migrateEvmHistory (async function)
 *   - getTxHistorySecure (async function)
 *   - loadTxHistoryAsync (async function)
 *   - saveTxHistorySecure (async function)
 * FUNCTIONS:
 *   - evmHistKey(networkId, evmAddr): Formulates lowercase key string for the EVM transaction history cache.
 *   - loadEvmTxHistory(networkId, evmAddr): Reads and parses cached EVM history.
 *   - saveEvmTxHistory(networkId, evmAddr, newTxs): Loads, merges, deduplicates by hash, sorts (newest-first), slices to 200 items, and serializes EVM transactions.
 *   - migrateEvmHistory(): No-op scaffold for future EVM migration compatibility.
 *   - getTxHistorySecure(network, address): Loads raw transaction history arrays from the storage adapter.
 *   - loadTxHistoryAsync(network, address, limit): Tries retrieving transactions from IndexedDB first, falling back to the storage adapter if empty.
 *   - saveTxHistorySecure(newTransactions, network, address): Asynchronously saves new transactions to IndexedDB and updates a truncated (200 items) history list in the storage adapter.
 */

import { STORAGE_KEYS } from "../../constants";
import { saveTransaction, getTransactionsByAddress } from "../indexedDB";
import { storage } from "./adapter";
import type { Transaction } from "../../types";

const EVM_HIST_MAX = 200;

function evmHistKey(networkId: string, evmAddr: string): string {
  return `evm_hist_v1:${networkId}:${evmAddr.toLowerCase()}`;
}

/** Load cached EVM transactions for a specific chain. Returns [] on miss. */
export async function loadEvmTxHistory(
  networkId: string,
  evmAddr: string,
): Promise<Transaction[]> {
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
export async function saveEvmTxHistory(
  networkId: string,
  evmAddr: string,
  newTxs: Transaction[],
): Promise<void> {
  if (!newTxs.length) return;
  try {
    const key = evmHistKey(networkId, evmAddr);
    const existing = await loadEvmTxHistory(networkId, evmAddr);
    const txMap = new Map<string, Transaction>();
    existing.forEach((tx) => tx.hash && txMap.set(tx.hash, tx));
    newTxs.forEach((tx) => tx.hash && txMap.set(tx.hash, tx));
    const merged = Array.from(txMap.values())
      .sort((a, b) => {
        const aT =
          typeof a.timestamp === "string"
            ? parseInt(a.timestamp)
            : (a.timestamp as number);
        const bT =
          typeof b.timestamp === "string"
            ? parseInt(b.timestamp)
            : (b.timestamp as number);
        return bT - aT;
      })
      .slice(0, EVM_HIST_MAX);
    await storage.set({ [key]: JSON.stringify(merged) });
  } catch {
    /* ignore */
  }
}

/**
 * Migrate old EVM history storage keys to the new per-chain format.
 * No-op: stale keys prefixed with 'evm_hist_v0:' are cleaned up via migration scripts.
 */
export async function migrateEvmHistory(): Promise<void> {}

/**
 * Get Transaction History (Async)
 * Reads from storage adapter (chrome.storage or polyfill).
 */
export async function getTxHistorySecure(
  network: string = "mainnet",
  address?: string,
): Promise<any[]> {
  try {
    const key = address
      ? `${STORAGE_KEYS.TX_HISTORY}_${network}_${address}`
      : `${STORAGE_KEYS.TX_HISTORY}_${network}`;
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
export async function loadTxHistoryAsync(
  network: string = "mainnet",
  address?: string,
  limit: number = 50,
): Promise<any[]> {
  try {
    if (address) {
      const dbTxs: any[] = await getTransactionsByAddress(address, limit);
      const networkTxs = dbTxs.filter(
        (tx) => !tx.network || tx.network === network,
      );

      if (networkTxs.length > 0) {
        return networkTxs;
      }
    }

    return await getTxHistorySecure(network, address);
  } catch (error) {
    console.warn(
      "[StorageSecure] Async history load failed, falling back to sync:",
      error,
    );
    return await getTxHistorySecure(network, address);
  }
}

/**
 * Save Transaction History
 */
export async function saveTxHistorySecure(
  newTransactions: any[],
  network: string = "mainnet",
  address?: string,
): Promise<void> {
  if (!newTransactions || newTransactions.length === 0) return;

  if (address) {
    Promise.all(
      newTransactions.map((tx) =>
        saveTransaction({
          ...tx,
          network,
          walletAddress: address,
          storedAt: Date.now(),
        }),
      ),
    ).catch((err) => console.error("[IndexedDB] Failed to save txs:", err));
  }

  const history = await getTxHistorySecure(network, address);
  const txMap = new Map();
  history.forEach((tx) => txMap.set(tx.hash, tx));
  newTransactions.forEach((tx) => txMap.set(tx.hash, tx));

  const merged = Array.from(txMap.values())
    .sort((a, b) => {
      const timeA = a.timestamp || a.epoch * 10 || 0;
      const timeB = b.timestamp || b.epoch * 10 || 0;
      return timeB - timeA;
    })
    .slice(0, 200); // Optimization: Keep last 200 in storage (lightweight)

  const key = address
    ? `${STORAGE_KEYS.TX_HISTORY}_${network}_${address}`
    : `${STORAGE_KEYS.TX_HISTORY}_${network}`;
  await storage.set({ [key]: JSON.stringify(merged) });
}

/**
 * Prunes transactions that have been stuck as 'pending' for more than 6 hours.
 */
export async function pruneExpiredPendingTxs(
  network: string,
  address: string,
  evmAddress?: string,
): Promise<void> {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const stored = await getTxHistorySecure(network, address);
    const expiredHashes: string[] = [];
    const filtered = stored.filter((tx) => {
      const isPending = tx.status === "pending";
      const timestamp =
        typeof tx.timestamp === "string"
          ? parseInt(tx.timestamp)
          : (tx.timestamp as number) || now;
      const isExpired = isPending && now - timestamp > SIX_HOURS_MS;
      if (isExpired && tx.hash) {
        expiredHashes.push(tx.hash);
      }
      return !isExpired;
    });

    if (filtered.length !== stored.length) {
      const key = address
        ? `${STORAGE_KEYS.TX_HISTORY}_${network}_${address}`
        : `${STORAGE_KEYS.TX_HISTORY}_${network}`;
      await storage.set({ [key]: JSON.stringify(filtered) });

      const { deleteData } = await import("../indexedDB");
      for (const hash of expiredHashes) {
        await deleteData("transactions", hash).catch(() => {});
      }
    }
  } catch (e) {
    console.error(
      "[StorageSecure] Failed to prune expired general pending txs:",
      e,
    );
  }

  if (evmAddress) {
    try {
      const allStorage = await storage.get(null);
      for (const [key, value] of Object.entries(allStorage)) {
        if (
          key.startsWith("evm_hist_v1:") &&
          key.endsWith(evmAddress.toLowerCase())
        ) {
          let txs: Transaction[] = [];
          if (Array.isArray(value)) {
            txs = value;
          } else if (typeof value === "string") {
            try {
              txs = JSON.parse(value);
            } catch {
              continue;
            }
          }

          if (Array.isArray(txs) && txs.length > 0) {
            const filtered = txs.filter((tx) => {
              const isPending = tx.status === "pending";
              const timestamp =
                typeof tx.timestamp === "string"
                  ? parseInt(tx.timestamp)
                  : (tx.timestamp as number) || now;
              return !(isPending && now - timestamp > SIX_HOURS_MS);
            });

            if (filtered.length !== txs.length) {
              await storage.set({ [key]: JSON.stringify(filtered) });
            }
          }
        }
      }
    } catch (e) {
      console.error(
        "[StorageSecure] Failed to prune expired EVM pending txs:",
        e,
      );
    }
  }
}
