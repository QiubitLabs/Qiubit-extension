/**
 * Balance Cache Manager - 3-Layer Caching Strategy
 * 
 * ARCHITECTURE:
 * Layer 1: Memory Cache (10s TTL, instant access)
 * Layer 2: Encrypted localStorage (30s TTL, 5ms access)
 * Layer 3: Network RPC (500ms access)
 * 
 * FEATURES:
 * - Request deduplication
 * - Automatic cache promotion
 * - Encrypted persistence
 * - Batch state updates
 * 
 * @version 2.0.0
 */

import { saveBalanceCacheSecure, getBalanceCacheSecure } from './storageSecure';

class BalanceCache {
    constructor() {
        this.memoryCache = new Map();
        this.inflightRequests = new Map();

        // TTL Configuration
        this.MEMORY_TTL = 10 * 1000;    // 10 seconds
        this.FRESH_TTL = 30 * 1000;     // 30 seconds (Background fetch trigger)
        this.DISPLAY_TTL = 5 * 60 * 1000; // 5 minutes (Instant display allowed)
    }

    /**
     * Get balance with 3-layer strategy
     * @returns {Promise<{balance, nonce, fromCache, isStale}>}
     */
    async get(address, password) {
        // Layer 1: Memory Cache (instant)
        const memCached = this.memoryCache.get(address);
        if (memCached) {
            const age = Date.now() - memCached.timestamp;
            if (age < this.MEMORY_TTL) {
                console.log(`[BalanceCache] Memory hit for ${address.slice(0, 10)}... (${Math.round(age / 1000)}s old)`);
                return {
                    ...memCached.data,
                    fromCache: 'memory',
                    age,
                    isStale: false
                };
            }
        }

        // Layer 2: Encrypted localStorage (5ms)
        if (password) {
            try {
                const storageCached = await getBalanceCacheSecure(address, password);
                if (storageCached) {
                    const age = storageCached.age || (Date.now() - (storageCached.timestamp || 0));
                    
                    // STALE-WHILE-REVALIDATE:
                    // If data is visible (< 5 min), return it immediately!
                    if (age < this.DISPLAY_TTL) {
                        console.log(`[BalanceCache] Storage hit (${Math.round(age / 1000)}s old). Stale? ${age > this.FRESH_TTL}`);

                        // Promote to memory cache
                        this.memoryCache.set(address, {
                            data: storageCached,
                            timestamp: Date.now()
                        });

                        return {
                            ...storageCached,
                            fromCache: 'storage',
                            age: age,
                            isStale: age > this.FRESH_TTL // Consumer should refetch if true
                        };
                    }
                }
            } catch (error) {
                console.warn('[BalanceCache] Storage cache failed:', error);
            }
        }

        // Cache miss - will fetch from network
        console.log(`[BalanceCache] Cache miss for ${address.slice(0, 10)}...`);
        return null;
    }

    /**
     * Set balance in all cache layers
     */
    async set(address, data, password) {
        const cacheData = {
            balance: data.balance,
            nonce: data.nonce,
            lastKnownBalance: data.lastKnownBalance || data.balance
        };

        // Layer 1: Memory Cache
        this.memoryCache.set(address, {
            data: cacheData,
            timestamp: Date.now()
        });

        // Layer 2: Encrypted localStorage
        if (password) {
            try {
                await saveBalanceCacheSecure(address, cacheData, password);
            } catch (error) {
                console.warn('[BalanceCache] Storage save failed:', error);
            }
        }
    }

    /**
     * Fetch with request deduplication
     * Prevents multiple simultaneous requests for same address
     */
    async fetchWithDedup(address, fetcher) {
        // Check if request already in-flight
        if (this.inflightRequests.has(address)) {
            // Silent: Reusing in-flight request
            return this.inflightRequests.get(address);
        }

        // Create new request
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
    clear(address) {
        this.memoryCache.delete(address);
        // Storage cache will expire naturally
    }

    /**
     * Clear all caches
     */
    clearAll() {
        this.memoryCache.clear();
        this.inflightRequests.clear();
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            memorySize: this.memoryCache.size,
            inflightRequests: this.inflightRequests.size
        };
    }
}

// Singleton instance
export const balanceCache = new BalanceCache();

export default balanceCache;

