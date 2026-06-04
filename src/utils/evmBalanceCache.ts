/**
 * EVM Balance Cache — memory + localStorage cache for Ethereum reads
 *
 * Mirrors balanceCache (Octra) but for EVM addresses. Uses stale-while-revalidate:
 * caller gets cached value immediately, then fetcher runs in background to update.
 *
 * Key shape: `${chainId}:${address}:${slot}` where slot is 'native' | 'erc20:<contract>'
 */

const MEMORY_TTL = 30_000;       // 30s — fresh
const STORAGE_TTL = 5 * 60_000;  // 5min — stale-but-displayable
const STORAGE_KEY = 'evm_balance_cache_v1';

interface Entry { value: string; ts: number; }

class EvmBalanceCache {
    private memory = new Map<string, Entry>();
    private inflight = new Map<string, Promise<string>>();
    private hydrated = false;

    private hydrate() {
        if (this.hydrated) return;
        this.hydrated = true;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const arr = JSON.parse(raw) as [string, Entry][];
            const now = Date.now();
            for (const [k, v] of arr) {
                if (now - v.ts < STORAGE_TTL) this.memory.set(k, v);
            }
        } catch { /* ignore corrupt */ }
    }

    private persist() {
        try {
            const arr = Array.from(this.memory.entries());
            localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
        } catch { /* quota */ }
    }

    /**
     * Get cached value if fresh, else null. Always cheap, no I/O.
     */
    getFresh(key: string): string | null {
        this.hydrate();
        const e = this.memory.get(key);
        if (!e) return null;
        if (Date.now() - e.ts < MEMORY_TTL) return e.value;
        return null;
    }

    /**
     * Get any cached value (fresh or stale within STORAGE_TTL). Returns null if absent or too old.
     */
    getStale(key: string): string | null {
        this.hydrate();
        const e = this.memory.get(key);
        if (!e) return null;
        if (Date.now() - e.ts < STORAGE_TTL) return e.value;
        return null;
    }

    /**
     * Get any cached value regardless of age. Used as last-resort fallback when both
     * primary and fallback RPCs fail — better to show old data than $0.
     */
    getAny(key: string): string | null {
        this.hydrate();
        return this.memory.get(key)?.value ?? null;
    }

    set(key: string, value: string): void {
        this.memory.set(key, { value, ts: Date.now() });
        // Persist async so we don't block
        queueMicrotask(() => this.persist());
        
        // Notify UI about the update
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('evmBalanceUpdated', { detail: { key, value } }));
        }
    }

    /**
     * Stale-while-revalidate: return cached value if any, run fetcher in background to refresh.
     * If no cached value at all, await the fetcher.
     * Pass force = true to bypass cache checks and guarantee fresh values from fetcher.
     */
    async swr(key: string, fetcher: () => Promise<string>, force = false): Promise<string> {
        this.hydrate();
        const fresh = force ? null : this.getFresh(key);
        const stale = force ? null : this.getStale(key);

        // Fresh hit — no fetch needed
        if (fresh !== null) return fresh;

        // In-flight dedup
        if (this.inflight.has(key)) return this.inflight.get(key) as Promise<string>;

        const fetchPromise = (async () => {
            try {
                const value = await fetcher();
                this.set(key, value);
                return value;
            } finally {
                this.inflight.delete(key);
            }
        })();
        this.inflight.set(key, fetchPromise);

        // If we have stale, return it now and let fetch run in background
        if (stale !== null) {
            fetchPromise.catch(() => { /* swallowed for SWR; caller already has stale value */ });
            return stale;
        }

        return fetchPromise;
    }

    clearAddress(address: string): void {
        const lower = address.toLowerCase();
        for (const k of Array.from(this.memory.keys())) {
            if (k.toLowerCase().includes(lower)) this.memory.delete(k);
        }
        this.persist();
    }
}

export const evmBalanceCache = new EvmBalanceCache();
export default evmBalanceCache;
