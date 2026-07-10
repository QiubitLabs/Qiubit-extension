import type { Migration } from "./index";
import { initDB, deleteData } from "../utils/indexedDB";
import { storage } from "../utils/storage/adapter";

const migration: Migration = {
  version: 4,
  name: "fix_pending_txs",
  async up(): Promise<void> {
    try {
      const db = await initDB();
      const txs: any[] = await new Promise((resolve, reject) => {
        const transaction = db.transaction(["transactions"], "readonly");
        const store = transaction.objectStore("transactions");
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });

      for (const tx of txs) {
        if (tx && tx.hash) {
          const isOctraNetwork =
            tx.network === "mainnet" || tx.network === "testnet";
          const isEvmHash =
            typeof tx.hash === "string" && tx.hash.startsWith("0x");
          const isMockNonEvmHash =
            typeof tx.hash === "string" &&
            (tx.hash.startsWith("SuiTx_") || tx.hash.startsWith("BtcTx_"));
          const isSolanaAddressOrHash =
            typeof tx.address === "string" &&
            tx.address.length >= 32 &&
            tx.address.length <= 44;

          if (
            isOctraNetwork &&
            (isEvmHash || isMockNonEvmHash || isSolanaAddressOrHash)
          ) {
            await deleteData("transactions", tx.hash);
          }
        }
      }
    } catch (err) {
      console.error(
        "[Migration] Failed to clean up IndexedDB transactions:",
        err,
      );
    }

    try {
      const allItems = await storage.get(null);
      for (const [key, value] of Object.entries(allItems)) {
        if (key.startsWith("qiubit_tx_history_")) {
          let txs: any[] = [];
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
            const filtered = txs.filter((tx: any) => {
              if (!tx || !tx.hash) return true;
              const isOctraNetwork =
                key.includes("_mainnet") || key.includes("_testnet");
              const isEvmHash =
                typeof tx.hash === "string" && tx.hash.startsWith("0x");
              const isMockNonEvmHash =
                typeof tx.hash === "string" &&
                (tx.hash.startsWith("SuiTx_") || tx.hash.startsWith("BtcTx_"));
              const isSolanaAddressOrHash =
                typeof tx.address === "string" &&
                tx.address.length >= 32 &&
                tx.address.length <= 44;

              if (
                isOctraNetwork &&
                (isEvmHash || isMockNonEvmHash || isSolanaAddressOrHash)
              ) {
                return false; // Exclude/Delete this item
              }
              return true;
            });

            if (filtered.length !== txs.length) {
              await storage.set({ [key]: filtered });
            }
          }
        }
      }
    } catch (err) {
      console.error(
        "[Migration] Failed to clean up storage transaction history keys:",
        err,
      );
    }
  },
};

export default migration;
