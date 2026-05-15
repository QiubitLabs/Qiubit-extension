/**
 * WalletSnapshot — per-wallet instant-load cache
 *
 * Stored in localStorage per address so wallet switch shows last-known state
 * immediately without waiting for RPC. Updated after every successful fetch.
 */

import { Token } from '../types';

const SCHEMA_VERSION = 2;
const KEY_PREFIX = 'w_snap_';

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
        // Drop snapshots from older schema versions
        if (parsed.v !== SCHEMA_VERSION) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function saveSnapshot(
    address: string,
    patch: Partial<Omit<WalletSnapshot, 'v' | 'address' | 'ts'>>
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
    } catch { /* quota or serialization */ }
}

export function clearSnapshot(address: string): void {
    if (!address) return;
    try { localStorage.removeItem(key(address)); } catch { /* ignore */ }
}

export function snapshotAge(address: string): number {
    const snap = loadSnapshot(address);
    return snap ? Date.now() - snap.ts : Infinity;
}
