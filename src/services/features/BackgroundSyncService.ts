import { getRpcClient } from "../network/RpcService";
import { logInfo } from "../../utils/logger";

/**
 * Background Sync Service
 * Handles periodic data synchronization in the background context
 */
class BackgroundSyncService {
  isSyncing: boolean = false;
  rpcClient: any;

  constructor() {
    this.isSyncing = false;
    this.rpcClient = getRpcClient();
  }

  /**
   * Main sync function called by Alarms
   */
  async syncAll(walletAddress: string, network: string): Promise<void> {
    if (this.isSyncing || !walletAddress) return;
    this.isSyncing = true;
    logInfo("[BgSync] Starting background sync for", walletAddress);

    try {
      await Promise.all([
        this.syncBalance(walletAddress),
        this.syncTransactions(walletAddress, network),
      ]);
      logInfo("[BgSync] Sync completed successfully");
    } catch (err: any) {
      console.warn("[BgSync] Sync failed:", err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync Balance
   */
  async syncBalance(address: string): Promise<void> {
    try {
      const data = await this.rpcClient.getBalance(address);

      const result = await chrome.storage.local.get("balances");
      const currentBalances: Record<string, number> = (result.balances ||
        {}) as Record<string, number>;

      if (currentBalances[address] !== data.balance) {
        currentBalances[address] = data.balance;
        await chrome.storage.local.set({ balances: currentBalances });

        chrome.runtime
          .sendMessage({
            type: "BALANCE_UPDATED",
            data: { address, ...data },
          })
          .catch(() => {}); // Ignore error if UI closed
      }
    } catch (err: any) {
      console.warn("[BgSync] Balance sync error:", err.message);
    }
  }

  /**
   * Sync Transactions (Smart Incremental)
   */
  async syncTransactions(address: string, _network: string): Promise<void> {
    try {
      const info = await this.rpcClient.getAddressInfo(address, 20);
      if (!info.recent_transactions || info.recent_transactions.length === 0)
        return;

      try {
        const staging = await this.rpcClient.getStagedTransactions();
        await chrome.storage.local.set({
          [`pending_txs_${address}`]: staging,
        });
      } catch (e) {}
    } catch (err: any) {
      console.warn("[BgSync] Tx sync error:", err.message);
    }
  }
}

export const backgroundSync = new BackgroundSyncService();
