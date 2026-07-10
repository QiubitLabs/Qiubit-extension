/**
 * AddressBookService - Store and retrieve named addresses
 */

import type { AddressNetwork } from "../../utils/validation";

const STORAGE_KEY = "qiubit_address_book";

export interface AddressEntry {
  label: string;
  address: string;
  network: AddressNetwork;
  addedAt: number;
}

async function load(): Promise<AddressEntry[]> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return (result[STORAGE_KEY] as AddressEntry[]) || [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function save(entries: AddressEntry[]): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: entries });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    /* ignore */
  }
}

export const addressBookService = {
  async getAll(): Promise<AddressEntry[]> {
    return load();
  },

  async add(entry: Omit<AddressEntry, "addedAt">): Promise<void> {
    const entries = await load();
    const existing = entries.findIndex((e) => e.address === entry.address);
    if (existing >= 0) {
      entries[existing] = { ...entry, addedAt: entries[existing].addedAt };
    } else {
      entries.unshift({ ...entry, addedAt: Date.now() });
    }
    await save(entries);
  },

  async remove(address: string): Promise<void> {
    const entries = await load();
    await save(entries.filter((e) => e.address !== address));
  },

  async getRecent(
    network: AddressNetwork,
    limit = 5,
  ): Promise<AddressEntry[]> {
    const entries = await load();
    return entries
      .filter((e) => e.network === network)
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, limit);
  },
};
