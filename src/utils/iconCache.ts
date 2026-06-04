/**
 * Icon Cache — persists token icon images as base64 in localStorage.
 * First load fetches from CDN; subsequent loads are instant from cache.
 * Max 80 icons (~2–4 MB). Oldest entries evicted when limit is reached.
 */

const CACHE_KEY = '_icon_cache';
const MAX_ENTRIES = 80;

interface IconCacheStore {
    [url: string]: { data: string; ts: number };
}

function read(): IconCacheStore {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch {
        return {};
    }
}

function write(store: IconCacheStore): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(store));
    } catch {
        // Quota exceeded — evict half the entries and retry
        const entries = Object.entries(store).sort((a, b) => a[1].ts - b[1].ts);
        const trimmed = Object.fromEntries(entries.slice(Math.floor(entries.length / 2)));
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)); } catch { /* give up */ }
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
export function getCachedContractLogoUrl(contractAddress: string, chainId: number): string | null {
    if (!contractAddress || !chainId) return null;
    try {
        return localStorage.getItem(`_icl_${contractAddress.toLowerCase()}_${chainId}`);
    } catch {
        return null;
    }
}

/** Persists the discovered logo URL for a contract+chain (not the image, just the URL). */
export function setCachedContractLogoUrl(contractAddress: string, chainId: number, logoUrl: string): void {
    if (!contractAddress || !chainId || !logoUrl) return;
    try {
        localStorage.setItem(`_icl_${contractAddress.toLowerCase()}_${chainId}`, logoUrl);
    } catch { /* ignore quota errors */ }
}

export async function fetchAndCacheIcon(url: string): Promise<string | null> {
    if (!url) return null;
    // Return from cache if already stored
    const cached = getCachedIcon(url);
    if (cached) return cached;

    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                if (!base64) { resolve(null); return; }
                const store = read();
                // Evict oldest if at limit
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
