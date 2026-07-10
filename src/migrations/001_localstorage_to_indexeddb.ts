/**
 * LOGIC: Migration script (version 1) that relocates legacy transaction history records stored in localStorage (keys starting with '_x4e_hist_') into IndexedDB.
 * Parsed entries are saved using saveTransaction, and migrated localStorage keys are subsequently evicted.
 * EXPORTS:
 *   - default (const Migration metadata and up function object)
 * FUNCTIONS:
 *   - up(): Scans all localStorage keys, parses active histories, parses address and network parameters, saves transactions to IndexedDB, and removes successfully migrated storage items.
 */

import type { Migration } from "./index";
import { initDB, saveTransaction } from "../utils/indexedDB";

const migration: Migration = {
  version: 1,
  name: "localstorage_to_indexeddb",
  async up(): Promise<void> {
    if (typeof localStorage === "undefined") return;

    await initDB();

    const migratedKeys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("_x4e_hist_")) continue;

      try {
        const stored = localStorage.getItem(key);
        if (!stored) continue;

        const txs = JSON.parse(stored);
        if (!Array.isArray(txs) || txs.length === 0) continue;

        const parts = key.replace("_x4e_hist_", "").split("_");
        const network = parts[0] || "mainnet";

        for (const tx of txs) {
          await saveTransaction({ ...tx, network, migratedAt: Date.now() });
        }

        migratedKeys.push(key);
      } catch {}
    }

    migratedKeys.forEach((k) => localStorage.removeItem(k));
  },
};

export default migration;
