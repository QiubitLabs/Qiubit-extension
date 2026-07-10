/**
 * LOGIC: Migration script (version 2) that removes stale EVM transaction history cache entries (keys prefixed with 'evm_hist_v0:') from extension storage to reclaim storage.
 * EXPORTS:
 *   - default (const Migration metadata and up function object)
 * FUNCTIONS:
 *   - up(): Queries all chrome extension local storage items, filters keys matching the deprecated prefix 'evm_hist_v0:', and removes them.
 */

import type { Migration } from "./index";

const migration: Migration = {
  version: 2,
  name: "evm_hist_v0_cleanup",
  async up(): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;

    await new Promise<void>((resolve) => {
      chrome.storage.local.get(null, (all) => {
        const staleKeys = Object.keys(all || {}).filter((k) =>
          k.startsWith("evm_hist_v0:"),
        );
        if (staleKeys.length === 0) {
          resolve();
          return;
        }
        chrome.storage.local.remove(staleKeys, () => resolve());
      });
    });
  },
};

export default migration;
