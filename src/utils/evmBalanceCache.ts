/**
 * LOGIC: Handles EVM-specific balance caching using an in-memory Map and local storage persistence.
 * Implements a Stale-While-Revalidate (SWR) fetching pattern and in-flight request deduplication to load EVM balances and ERC20 balances quickly and reduce network requests.
 * EXPORTS:
 *   - evmBalanceCache (const class instance)
 *   - default (evmBalanceCache instance)
 * FUNCTIONS:
 *   - hydrate(): Restores cached items from local storage if within the storage retention age limit.
 *   - persist(): Saves current memory cache items to local storage.
 *   - getFresh(key): Returns cached value if older than 30s.
 *   - getStale(key): Returns cached value if older than 5m.
 *   - getAny(key): Returns cached value regardless of age as a last-resort fallback.
 *   - set(key, value): Sets cached value, triggers storage persist in microtask, and dispatches custom event 'evmBalanceUpdated'.
 *   - swr(key, fetcher, force): Stale-While-Revalidate wrapper. Instantly returns stale cache if available, runs fetcher in background to update, or awaits fetcher if no cache is available.
 *   - clearAddress(address): Evicts all cache keys containing the target address.
 */

const MEMORY_TTL = 30_000; // 30s — fresh
const STORAGE_TTL = 5 * 60_000; // 5min — stale-but-displayable
const STORAGE_KEY = "evm_balance_cache_v1";

interface Entry {
  value: string;
  ts: number;
}

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
    } catch {
      /* ignore corrupt */
    }
  }

  private persist() {
    try {
      const arr = Array.from(this.memory.entries());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {
      /* quota */
    }
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
    queueMicrotask(() => this.persist());

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("evmBalanceUpdated", { detail: { key, value } }),
      );
    }
  }

  /**
   * Stale-while-revalidate: return cached value if any, run fetcher in background to refresh.
   * If no cached value at all, await the fetcher.
   * Pass force = true to bypass cache checks and guarantee fresh values from fetcher.
   */
  async swr(
    key: string,
    fetcher: () => Promise<string>,
    force = false,
  ): Promise<string> {
    this.hydrate();
    const fresh = force ? null : this.getFresh(key);
    const stale = force ? null : this.getStale(key);

    if (fresh !== null) return fresh;

    if (!force && this.inflight.has(key))
      return this.inflight.get(key) as Promise<string>;

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

    if (stale !== null) {
      fetchPromise.catch(() => {
        /* swallowed for SWR; caller already has stale value */
      });
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
