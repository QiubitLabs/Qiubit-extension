/**
 * Balance Cache Unit Tests
 * Tests for caching, deduplication, and memory management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the storageSecure module
vi.mock('../../src/utils/storageSecure', () => ({
    saveBalanceCacheSecure: vi.fn(),
    getBalanceCacheSecure: vi.fn()
}));

// Import after mocking
import { balanceCache } from '../../src/utils/balanceCache';

describe('BalanceCache', () => {

    beforeEach(() => {
        // Clear cache before each test
        balanceCache.clearAll();
    });

    describe('Memory Cache', () => {
        it('should store and retrieve from memory cache', async () => {
            const address = 'oct1test123456789';
            const data = { balance: 100, nonce: 5 };

            await balanceCache.set(address, data, null);
            const cached = await balanceCache.get(address, null);

            expect(cached).toBeDefined();
            expect(cached.balance).toBe(100);
            expect(cached.nonce).toBe(5);
            expect(cached.fromCache).toBe('memory');
        });

        it('should return null for non-existent address', async () => {
            const result = await balanceCache.get('oct1nonexistent', null);
            expect(result).toBeNull();
        });
    });

    describe('Request Deduplication', () => {
        it('should deduplicate simultaneous requests', async () => {
            const address = 'oct1deduptest';
            let fetchCount = 0;

            const fetcher = async () => {
                fetchCount++;
                await new Promise(r => setTimeout(r, 100));
                return { balance: 50, nonce: 1 };
            };

            // Fire 3 simultaneous requests
            const [result1, result2, result3] = await Promise.all([
                balanceCache.fetchWithDedup(address, fetcher),
                balanceCache.fetchWithDedup(address, fetcher),
                balanceCache.fetchWithDedup(address, fetcher)
            ]);

            // Should only fetch once
            expect(fetchCount).toBe(1);

            // All should return same result
            expect(result1.balance).toBe(50);
            expect(result2.balance).toBe(50);
            expect(result3.balance).toBe(50);
        });

        it('should make new request after previous completes', async () => {
            const address = 'oct1sequential';
            let fetchCount = 0;

            const fetcher = async () => {
                fetchCount++;
                return { balance: fetchCount * 10, nonce: fetchCount };
            };

            const result1 = await balanceCache.fetchWithDedup(address, fetcher);
            const result2 = await balanceCache.fetchWithDedup(address, fetcher);

            expect(fetchCount).toBe(2);
            expect(result1.balance).toBe(10);
            expect(result2.balance).toBe(20);
        });
    });

    describe('Cache Clearing', () => {
        it('should clear specific address', async () => {
            const address1 = 'oct1addr1';
            const address2 = 'oct1addr2';

            await balanceCache.set(address1, { balance: 100, nonce: 1 }, null);
            await balanceCache.set(address2, { balance: 200, nonce: 2 }, null);

            balanceCache.clear(address1);

            const result1 = await balanceCache.get(address1, null);
            const result2 = await balanceCache.get(address2, null);

            expect(result1).toBeNull();
            expect(result2).not.toBeNull();
            expect(result2.balance).toBe(200);
        });

        it('should clear all cache', async () => {
            await balanceCache.set('oct1a', { balance: 1, nonce: 1 }, null);
            await balanceCache.set('oct1b', { balance: 2, nonce: 2 }, null);

            balanceCache.clearAll();

            const stats = balanceCache.getStats();
            expect(stats.memorySize).toBe(0);
            expect(stats.inflightRequests).toBe(0);
        });
    });

    describe('Statistics', () => {
        it('should return correct stats', async () => {
            await balanceCache.set('oct1x', { balance: 10, nonce: 1 }, null);
            await balanceCache.set('oct1y', { balance: 20, nonce: 2 }, null);

            const stats = balanceCache.getStats();
            expect(stats.memorySize).toBe(2);
            expect(stats.inflightRequests).toBe(0);
        });
    });
});
