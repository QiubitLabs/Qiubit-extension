import type { DappConnection, DappApproval, SessionCache, ChainConnection } from './types';

// Long-lived port connections from dApp content scripts
export const activeDappPorts = new Set<chrome.runtime.Port>();

// Per-origin dApp connection state (persisted to chrome.storage.local)
export const dappConnections = new Map<string, DappConnection>();

// Pending approval requests (in-memory only, not persisted)
export const dappApprovals = new Map<string, DappApproval>();

// In-memory session cache (populated from chrome.storage.session on startup)
export let activeSessionCache: SessionCache | null = null;

// Zero-trust session key (memory only, never persisted to storage)
export let memorySessionKey: string | null = null;

// Per-origin Solana connection state (in-memory only)
export const solanaConnections = new Map<string, ChainConnection>();

// Per-origin Sui connection state (in-memory only)
export const suiConnections = new Map<string, ChainConnection>();

export function setActiveSessionCache(val: SessionCache | null): void {
    activeSessionCache = val;
}

export function setMemorySessionKey(val: string | null): void {
    memorySessionKey = val;
}
