/**
 * LOGIC: Provides unencrypted plaintext caching of wallet states (native balance, nonce, tokens, and timestamp) in local storage.
 * Designed to enable immediate UI loading when switching wallets without waiting for RPC calls, automatically discarding snapshots matching older schema versions.
 * EXPORTS:
 *   - WalletSnapshot (interface)
 *   - loadSnapshot (function)
 *   - saveSnapshot (function)
 *   - clearSnapshot (function)
 *   - snapshotAge (function)
 * FUNCTIONS:
 *   - loadSnapshot(address): Returns the parsed snapshot from localStorage if it exists and matches the active schema version.
 *   - saveSnapshot(address, patch): Updates properties of an existing snapshot or creates a new one, persisting it in localStorage.
 *   - clearSnapshot(address): Evicts the snapshot from localStorage.
 *   - snapshotAge(address): Returns elapsed time in milliseconds since the snapshot was saved.
 */

import { Token } from "../types";

const SCHEMA_VERSION = 2;
const KEY_PREFIX = "w_snap_";

export interface WalletSnapshot {
  v: number;
  address: string;
  balance: number;
  nonce: number;
  tokens: Token[];
  ts: number;
}

const key = (addr: string) => `${KEY_PREFIX}${addr}`;

export function loadSnapshot(address: string): WalletSnapshot | null {
  if (!address) return null;
  try {
    const raw = localStorage.getItem(key(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletSnapshot;
    if (parsed.v !== SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSnapshot(
  address: string,
  patch: Partial<Omit<WalletSnapshot, "v" | "address" | "ts">>,
): void {
  if (!address) return;
  try {
    const prev = loadSnapshot(address);
    const next: WalletSnapshot = {
      v: SCHEMA_VERSION,
      address,
      balance: patch.balance ?? prev?.balance ?? 0,
      nonce: patch.nonce ?? prev?.nonce ?? 0,
      tokens: patch.tokens ?? prev?.tokens ?? [],
      ts: Date.now(),
    };
    localStorage.setItem(key(address), JSON.stringify(next));
  } catch {
    /* quota or serialization */
  }
}

export function clearSnapshot(address: string): void {
  if (!address) return;
  try {
    localStorage.removeItem(key(address));
  } catch {
    /* ignore */
  }
}

export function snapshotAge(address: string): number {
  const snap = loadSnapshot(address);
  return snap ? Date.now() - snap.ts : Infinity;
}
