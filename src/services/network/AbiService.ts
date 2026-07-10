/**
 * AbiService — fetch and cache contract ABIs from Etherscan-compatible APIs.
 *
 * ABIs are cached in localStorage to avoid repeated network fetches.
 * Supports any chain with a block explorer that exposes `?module=contract&action=getabi`.
 */

import { resolveNetworkByChainId } from "./NetworkResolver";

const ABI_CACHE_KEY = "abi_cache_v1";
const ABI_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  abi: any[];
  fetchedAt: number;
}

type AbiCache = Record<string, CacheEntry>; // key = `${chainId}:${address.toLowerCase()}`

function readCache(): AbiCache {
  try {
    return JSON.parse(localStorage.getItem(ABI_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: AbiCache): void {
  try {
    localStorage.setItem(ABI_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota — ignore */
  }
}

function cacheKey(chainId: number, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

/**
 * Fetch the ABI for a contract address on the given chain.
 * Returns the parsed ABI array, or null if not found / explorer unavailable.
 */
export async function fetchAbi(
  contractAddress: string,
  chainId: number,
): Promise<any[] | null> {
  const key = cacheKey(chainId, contractAddress);
  const cache = readCache();
  const cached = cache[key];

  if (cached && Date.now() - cached.fetchedAt < ABI_TTL_MS) {
    return cached.abi;
  }

  const networkConfig = resolveNetworkByChainId(chainId);
  if (!networkConfig) return null;

  const historyApi = networkConfig.historyApi;
  if (historyApi.type !== "etherscan_compatible" || !historyApi.baseUrl)
    return null;

  try {
    const url = `${historyApi.baseUrl}?module=contract&action=getabi&address=${contractAddress}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "1" || !data.result) return null;

    const abi = JSON.parse(data.result) as any[];
    cache[key] = { abi, fetchedAt: Date.now() };
    writeCache(cache);
    return abi;
  } catch {
    return null;
  }
}

/** Clear the entire ABI cache. */
export function clearAbiCache(): void {
  localStorage.removeItem(ABI_CACHE_KEY);
}

/** Remove a specific contract's ABI from cache (forces re-fetch). */
export function evictAbi(contractAddress: string, chainId: number): void {
  const cache = readCache();
  delete cache[cacheKey(chainId, contractAddress)];
  writeCache(cache);
}
