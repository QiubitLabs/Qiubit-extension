import { getRpcClient } from '../utils/rpc';
import { saveTxHistorySecure, loadTxHistoryAsync, loadWalletsSecure } from '../utils/storageSecure';
import { balanceCache } from '../utils/balanceCache';

/**
 * Background Sync Service
 * Handles periodic data synchronization in the background context
 */
class BackgroundSyncService {
    constructor() {
        this.isSyncing = false;
        this.rpcClient = getRpcClient();
    }

    /**
     * Main sync function called by Alarms
     */
    async syncAll(walletAddress, network) {
        if (this.isSyncing || !walletAddress) return;
        this.isSyncing = true;
        console.log('[BgSync] Starting background sync for', walletAddress);

        try {
            await Promise.all([
                this.syncBalance(walletAddress),
                this.syncTransactions(walletAddress, network)
            ]);
            console.log('[BgSync] Sync completed successfully');
        } catch (err) {
            console.warn('[BgSync] Sync failed:', err.message);
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Sync Balance
     */
    async syncBalance(address) {
        try {
            // Fetch fresh balance
            const data = await this.rpcClient.getBalance(address);
            
            // Save to Chrome Storage (for instant UI access)
            const result = await chrome.storage.local.get('balances');
            const currentBalances = result.balances || {};
            
            // Only update if changed
            if (currentBalances[address] !== data.balance) {
                currentBalances[address] = data.balance;
                await chrome.storage.local.set({ balances: currentBalances });
                
                // Notify UI if open
                chrome.runtime.sendMessage({ 
                    type: 'BALANCE_UPDATED', 
                    data: { address, ...data } 
                }).catch(() => {}); // Ignore error if UI closed
            }
        } catch (err) {
            console.warn('[BgSync] Balance sync error:', err.message);
        }
    }

    /**
     * Sync Transactions (Smart Incremental)
     */
    async syncTransactions(address, network) {
        try {
            // 1. Get existing hash set from IndexedDB (lite version)
            // We need to implement a lightweight checker or just rely on 'smart sync' logic
            // For background, we just fetch recent 20 and merge.
            
            const info = await this.rpcClient.getAddressInfo(address, 20);
            if (!info.recent_transactions || info.recent_transactions.length === 0) return;

            // Simple logic: fetch details for txs we don't have details for?
            // Since we can't easily access IndexedDB in Service Worker context in all browsers (Firefox issues),
            // we have to be careful. Chrome Extension MV3 supports IndexedDB in SW.
            
            // Let's rely on the robust logic we put in App.jsx, but ported here.
            // For now, to ensure safety, we will just fetch the LATEST transaction
            // and notify if it's new. Full history sync is better left to UI when opened for now
            // to avoid massive background data usage.
            
            // BETTER STRATEGY: Update 'pending' transactions status
            // Check staging
            try {
                const staging = await this.rpcClient.getStagedTransactions();
                // If we have staging data, save to storage so UI sees it instantly
                await chrome.storage.local.set({ 
                    [`pending_txs_${address}`]: staging 
                });
            } catch (e) {}

        } catch (err) {
            console.warn('[BgSync] Tx sync error:', err.message);
        }
    }
}

export const backgroundSync = new BackgroundSyncService();
