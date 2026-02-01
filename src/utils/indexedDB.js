/**
 * IndexedDB Utility for Octra Wallet
 * Provides structured, scalable storage for assets, transactions, and logs
 * Inspired by OKX Wallet architecture
 * 
 * Benefits over localStorage:
 * - Larger capacity (50MB-1GB vs 5MB)
 * - Fast indexed queries (B-tree)
 * - Structured data storage
 * - Transaction support
 */

const DB_NAME = 'octra_wallet';
const DB_VERSION = 1;

/**
 * Initialize or upgrade IndexedDB
 */
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Object Store: Transactions
            if (!db.objectStoreNames.contains('transactions')) {
                const txStore = db.createObjectStore('transactions', {
                    keyPath: 'hash'
                });
                txStore.createIndex('from', 'from', { unique: false });
                txStore.createIndex('to', 'to', { unique: false });
                txStore.createIndex('timestamp', 'timestamp', { unique: false });
                txStore.createIndex('network', 'network', { unique: false });
                txStore.createIndex('status', 'status', { unique: false });
            }

            // Object Store: Assets (tokens)
            if (!db.objectStoreNames.contains('assets')) {
                const assetStore = db.createObjectStore('assets', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                assetStore.createIndex('address', 'address', { unique: false });
                assetStore.createIndex('symbol', 'symbol', { unique: false });
                assetStore.createIndex('contractAddress', 'contractAddress', { unique: false });
            }

            // Object Store: Balances
            if (!db.objectStoreNames.contains('balances')) {
                db.createObjectStore('balances', {
                    keyPath: 'address'
                });
            }

            // Object Store: Activity Logs
            if (!db.objectStoreNames.contains('logs')) {
                const logStore = db.createObjectStore('logs', {
                    keyPath: 'id',
                    autoIncrement: true
                });
                logStore.createIndex('timestamp', 'timestamp', { unique: false });
                logStore.createIndex('type', 'type', { unique: false });
                logStore.createIndex('level', 'level', { unique: false });
            }

            // console.log('[IndexedDB] Database initialized/upgraded to v' + DB_VERSION);
        };
    });
}

/**
 * Generic function to add/update data
 */
export async function putData(storeName, data) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Generic function to get data by key
 */
export async function getData(storeName, key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Generic function to get all data from store
 */
export async function getAllData(storeName) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Get data from index (FAST queries!)
 */
export async function getDataByIndex(storeName, indexName, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete data by key
 */
export async function deleteData(storeName, key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Clear all data from store
 */
export async function clearStore(storeName) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ===== Transaction Specific Functions =====

/**
 * Save transaction to IndexedDB
 */
export async function saveTransaction(tx) {
    return await putData('transactions', tx);
}

/**
 * Get transactions by address (sender or recipient)
 */
export async function getTransactionsByAddress(address, limit = 50) {
    const fromTxs = await getDataByIndex('transactions', 'from', address);
    const toTxs = await getDataByIndex('transactions', 'to', address);

    // Merge and sort by timestamp (descending)
    const allTxs = [...fromTxs, ...toTxs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

    return allTxs;
}

/**
 * Get recent transactions (all addresses)
 */
export async function getRecentTransactions(limit = 50) {
    const allTxs = await getAllData('transactions');
    return allTxs
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
}

// ===== Asset Specific Functions =====

/**
 * Save asset (token)
 */
export async function saveAsset(asset) {
    return await putData('assets', asset);
}

/**
 * Get assets by wallet address
 */
export async function getAssetsByAddress(address) {
    return await getDataByIndex('assets', 'address', address);
}

// ===== Balance Specific Functions =====

/**
 * Save balance
 */
export async function saveBalance(address, balance) {
    return await putData('balances', {
        address: address,
        balance: balance,
        updatedAt: Date.now()
    });
}

/**
 * Get balance
 */
export async function getBalance(address) {
    return await getData('balances', address);
}

// ===== Migration Helper =====

/**
 * Migrate transactions from localStorage to IndexedDB
 */
export async function migrateTransactionsFromLocalStorage(address, network) {
    try {
        // Try to load old format
        const key = `_x4e_hist_${network}_${address}`;
        const stored = localStorage.getItem(key);

        if (!stored) {
            // console.log('[IndexedDB] No localStorage data to migrate');
            return 0;
        }

        const oldTxs = JSON.parse(stored);

        // Migrate to IndexedDB
        for (const tx of oldTxs) {
            await saveTransaction(tx);
        }

        // console.log(`[IndexedDB] [OK] Migrated ${oldTxs.length} transactions from localStorage`);

        // Optional: Remove old data (commented out for safety)
        // localStorage.removeItem(key);

        return oldTxs.length;
    } catch (error) {
        console.error('[IndexedDB] Migration failed:', error);
        return 0;
    }
}

export default {
    initDB,
    putData,
    getData,
    getAllData,
    getDataByIndex,
    deleteData,
    clearStore,
    saveTransaction,
    getTransactionsByAddress,
    getRecentTransactions,
    saveAsset,
    getAssetsByAddress,
    saveBalance,
    getBalance,
    migrateTransactionsFromLocalStorage
};
