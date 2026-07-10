/**
 * LOGIC: Balance Cache Manager implementing a 3-layer caching strategy (Memory cache, secure encrypted local storage cache, and network RPC) with request deduplication to avoid redundant concurrent RPC queries.
 * EXPORTS:
 *   - balanceCache (const class instance)
 *   - default (balanceCache instance)
 * FUNCTIONS:
 *   - get(address, password): Retrieves cached balance data from memory (fresh within 10s) or from secure storage (fresh within 5m). Returns stale status.
 *   - set(address, data, password): Updates memory and secure storage cache with balance, nonce, and last known balance.
 *   - fetchWithDedup(address, fetcher): Resolves concurrent fetches for the same address by using an in-flight promise map.
 *   - clear(address): Evicts memory cache entry for a specific address.
 *   - clearAll(): Wipes all memory cache and in-flight request maps.
 *   - getStats(): Returns count of items in memory cache and active in-flight requests.
 */

import { saveBalanceCacheSecure, getBalanceCacheSecure } from "./storage";
import { logInfo } from "./logger";

interface MemoryCacheEntry {
  data: any;
  timestamp: number;
}

interface CacheResult {
  balance: any;
  nonce: any;
  lastKnownBalance?: any;
  fromCache: "memory" | "storage";
  age: number;
  isStale: boolean;
}

class BalanceCache {
  private memoryCache: Map<string, MemoryCacheEntry>;
  private inflightRequests: Map<string, Promise<any>>;
  private MEMORY_TTL: number;
  private FRESH_TTL: number;
  private DISPLAY_TTL: number;

  constructor() {
    this.memoryCache = new Map();
    this.inflightRequests = new Map();

    this.MEMORY_TTL = 10 * 1000; // 10 seconds
    this.FRESH_TTL = 30 * 1000; // 30 seconds (Background fetch trigger)
    this.DISPLAY_TTL = 5 * 60 * 1000; // 5 minutes (Instant display allowed)
  }

  /**
   * Get balance with 3-layer strategy
   */
  async get(address: string, password?: string): Promise<CacheResult | null> {
    const memCached = this.memoryCache.get(address);
    if (memCached) {
      const age = Date.now() - memCached.timestamp;
      if (age < this.MEMORY_TTL) {
        logInfo(
          `[BalanceCache] Memory hit for ${address.slice(0, 10)}... (${Math.round(age / 1000)}s old)`,
        );
        return {
          ...memCached.data,
          fromCache: "memory",
          age,
          isStale: false,
        };
      }
    }

    if (password) {
      try {
        const storageCached = await getBalanceCacheSecure(address, password);
        if (storageCached) {
          const age =
            storageCached.age || Date.now() - (storageCached.timestamp || 0);

          if (age < this.DISPLAY_TTL) {
            logInfo(
              `[BalanceCache] Storage hit (${Math.round(age / 1000)}s old). Stale? ${age > this.FRESH_TTL}`,
            );

            this.memoryCache.set(address, {
              data: storageCached,
              timestamp: Date.now(),
            });

            return {
              ...storageCached,
              fromCache: "storage",
              age: age,
              isStale: age > this.FRESH_TTL, // Consumer should refetch if true
            };
          }
        }
      } catch (error) {
        console.warn("[BalanceCache] Storage cache failed:", error);
      }
    }

    logInfo(`[BalanceCache] Cache miss for ${address.slice(0, 10)}...`);
    return null;
  }

  /**
   * Set balance in all cache layers
   */
  async set(address: string, data: any, password?: string): Promise<void> {
    const cacheData = {
      balance: data.balance,
      nonce: data.nonce,
      lastKnownBalance: data.lastKnownBalance || data.balance,
    };

    this.memoryCache.set(address, {
      data: cacheData,
      timestamp: Date.now(),
    });

    if (password) {
      try {
        await saveBalanceCacheSecure(address, cacheData, password);
      } catch (error) {
        console.warn("[BalanceCache] Storage save failed:", error);
      }
    }
  }

  /**
   * Fetch with request deduplication
   * Prevents multiple simultaneous requests for same address
   */
  async fetchWithDedup<T>(
    address: string,
    fetcher: (addr: string) => Promise<T>,
  ): Promise<T> {
    if (this.inflightRequests.has(address)) {
      return this.inflightRequests.get(address) as Promise<T>;
    }

    const promise = fetcher(address);
    this.inflightRequests.set(address, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.inflightRequests.delete(address);
    }
  }

  /**
   * Clear cache for specific address
   */
  clear(address: string): void {
    this.memoryCache.delete(address);
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.memoryCache.clear();
    this.inflightRequests.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      memorySize: this.memoryCache.size,
      inflightRequests: this.inflightRequests.size,
    };
  }
}

export const balanceCache = new BalanceCache();

export default balanceCache;
