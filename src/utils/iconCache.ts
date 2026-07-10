/**
 * LOGIC: Caches token icon image assets in local storage as Base64 data URLs.
 * Automatically handles image downloads from CDN, converts them to base64, limits cache size to 80 items by evicting the oldest entries, and handles local storage quota limitations by trimming the cache dynamically.
 * EXPORTS:
 *   - getCachedIcon (function)
 *   - getCachedContractLogoUrl (function)
 *   - setCachedContractLogoUrl (function)
 *   - fetchAndCacheIcon (async function)
 * FUNCTIONS:
 *   - read(): Deserializes the icon cache dictionary from local storage.
 *   - write(store): Serializes the icon cache dictionary to local storage; evicts oldest half if local storage quota is exceeded.
 *   - getCachedIcon(url): Retrieves base64 image data for the specified URL from the cache.
 *   - getCachedContractLogoUrl(contractAddress, chainId): Gets the URL string mapped to a specific contract/chain.
 *   - setCachedContractLogoUrl(contractAddress, chainId, logoUrl): Saves the URL string mapping for a contract/chain.
 *   - fetchAndCacheIcon(url): Downloads the image, encodes it as base64, evicts the oldest entry if size exceeds 80, saves it to storage, and returns the base64 string.
 */

const CACHE_KEY = "_icon_cache";
const MAX_ENTRIES = 80;

interface IconCacheStore {
  [url: string]: { data: string; ts: number };
}

function read(): IconCacheStore {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function write(store: IconCacheStore): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    const entries = Object.entries(store).sort((a, b) => a[1].ts - b[1].ts);
    const trimmed = Object.fromEntries(
      entries.slice(Math.floor(entries.length / 2)),
    );
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } catch {
      /* give up */
    }
  }
}

export function getCachedIcon(url: string): string | null {
  if (!url) return null;
  try {
    const store = read();
    return store[url]?.data ?? null;
  } catch {
    return null;
  }
}

/** Returns the previously discovered logo URL for a given contract+chain. */
export function getCachedContractLogoUrl(
  contractAddress: string,
  chainId: number,
): string | null {
  if (!contractAddress || !chainId) return null;
  try {
    return localStorage.getItem(
      `_icl_${contractAddress.toLowerCase()}_${chainId}`,
    );
  } catch {
    return null;
  }
}

/** Persists the discovered logo URL for a contract+chain (not the image, just the URL). */
export function setCachedContractLogoUrl(
  contractAddress: string,
  chainId: number,
  logoUrl: string,
): void {
  if (!contractAddress || !chainId || !logoUrl) return;
  try {
    localStorage.setItem(
      `_icl_${contractAddress.toLowerCase()}_${chainId}`,
      logoUrl,
    );
  } catch {
    /* ignore quota errors */
  }
}

export async function fetchAndCacheIcon(url: string): Promise<string | null> {
  if (!url) return null;
  const cached = getCachedIcon(url);
  if (cached) return cached;

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (!base64) {
          resolve(null);
          return;
        }
        const store = read();
        const entries = Object.entries(store);
        if (entries.length >= MAX_ENTRIES) {
          entries.sort((a, b) => a[1].ts - b[1].ts);
          delete store[entries[0][0]];
        }
        store[url] = { data: base64, ts: Date.now() };
        write(store);
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
