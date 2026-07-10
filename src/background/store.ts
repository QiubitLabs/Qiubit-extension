import type {
  DappConnection,
  DappApproval,
  SessionCache,
  ChainConnection,
} from "./types";

export const activeDappPorts = new Set<chrome.runtime.Port>();

export const dappConnections = new Map<string, DappConnection>();

export const dappApprovals = new Map<string, DappApproval>();

export let activeSessionCache: SessionCache | null = null;

export let memorySessionKey: string | null = null;

export const solanaConnections = new Map<string, ChainConnection>();

export const suiConnections = new Map<string, ChainConnection>();

export function setActiveSessionCache(val: SessionCache | null): void {
  activeSessionCache = val;
}

export function setMemorySessionKey(val: string | null): void {
  memorySessionKey = val;
}
