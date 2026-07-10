/**
 * LOGIC: Migration script (version 3) that resets lastBlock sync tracking markers used by EthHistoryService (keys prefixed with 'octra_lb:') in localStorage, forcing the wallet to re-sync its transaction history.
 * EXPORTS:
 *   - default (const Migration metadata and up function object)
 * FUNCTIONS:
 *   - up(): Scans all localStorage keys, finds those starting with 'octra_lb:' or matching 'octra_lb_reset_v5', and removes them.
 */

import type { Migration } from "./index";

const LS_LB = "octra_lb:";

const migration: Migration = {
  version: 3,
  name: "eth_lastblock_reset",
  async up(): Promise<void> {
    if (typeof localStorage === "undefined") return;

    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith(LS_LB)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));

    localStorage.removeItem("octra_lb_reset_v5");
  },
};

export default migration;
