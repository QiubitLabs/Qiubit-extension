/**
 * Price Service - Fetches token prices from CoinGecko API
 * 
 * v2.0 Features:
 * - Persistent cache (survives refresh)
 * - Automatic cache expiration
 * - Fallback to cached data on API failure
 */

import { savePublicCache, getPublicCache } from '../../utils/storage/cache';

const COINGECKO_API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COINGECKO_API_URL) || 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = typeof import.meta !== 'undefined' ? import.meta.env.VITE_COINGECKO_API_KEY : undefined;

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_STORAGE_KEY = '_price_cache';

interface PriceData {
    price: number;
    change24h: number;
    marketCap?: number;
}

interface CacheEntry {
    data: PriceData;
    timestamp: number;
}

// Memory cache
let priceCache = new Map<string, CacheEntry>();

// In-flight request deduplication tracker
const inFlightRequests = new Map<string, Promise<PriceData | null>>();

// Initialize cache
(async () => {
    try {
        const parsed = await getPublicCache(CACHE_STORAGE_KEY);
        if (parsed) {
            priceCache = new Map(parsed);
        }
    } catch (error) {
        console.warn('[PriceService] Failed to load cache:', error);
    }
})();

// Save cache
async function saveCache() {
    try {
        const cacheArray = Array.from(priceCache.entries());
        await savePublicCache(CACHE_STORAGE_KEY, cacheArray);
    } catch (error) {
        console.warn('[PriceService] Failed to save cache:', error);
    }
}

// Token ID mapping for CoinGecko
const DEFAULT_OCT_ID = typeof import.meta !== 'undefined' && import.meta.env?.VITE_COINGECKO_OCT_ID
    ? import.meta.env.VITE_COINGECKO_OCT_ID
    : 'octra';

// Fallback mock data when API fails
const FALLBACK_PRICES: Record<string, PriceData> = {
    'OCT': {
        price: 0.15,
        change24h: 2.5,
        marketCap: 15000000
    },
    'ETH': {
        price: 2500,
        change24h: -1.2,
        marketCap: 300000000000
    },
    'BTC': {
        price: 45000,
        change24h: 0.8,
        marketCap: 850000000000
    }
};

const VS_CURRENCIES = typeof import.meta !== 'undefined' && import.meta.env?.VITE_COINGECKO_VS_CURRENCIES 
    ? import.meta.env.VITE_COINGECKO_VS_CURRENCIES 
    : 'usd';

const TOKEN_ID_MAP: Record<string, string | null> = {
    'OCT': DEFAULT_OCT_ID,
    'WOCT': DEFAULT_OCT_ID,
    'ETH': 'ethereum',
    'BTC': 'bitcoin',
    'USDT': 'tether',
    'USDC': 'usd-coin',
};

/**
 * Get price data for a token
 * @param {string} symbol - Token symbol (e.g., 'OCT', 'ETH')
 * @returns {Promise<PriceData | null>}
 */
export async function getTokenPrice(symbol: string): Promise<PriceData | null> {
    const coinId = TOKEN_ID_MAP[symbol.toUpperCase()];

    // Token not mapped to CoinGecko
    if (!coinId) {
        return null;
    }

    // Check cache
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }

    // Check if a request for this token is already in flight
    if (inFlightRequests.has(symbol)) {
        return inFlightRequests.get(symbol) as Promise<PriceData | null>;
    }

    const fetchPromise = (async () => {
        try {
            const headers: HeadersInit = {};
            if (COINGECKO_API_KEY) {
                // Use demo API key header for free tier (matches batch fn). Pro keys also work with this header.
                (headers as any)['x-cg-demo-api-key'] = COINGECKO_API_KEY;
            }

            const response = await fetch(
                `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=${VS_CURRENCIES}&include_24hr_change=true&include_market_cap=true`,
                { headers }
            );

            if (response.status === 429) {
                console.warn(`[PriceService] Rate limit hit for ${symbol} — using cached data`);
                if (cached) return cached.data;
                const fallbackData = FALLBACK_PRICES[symbol];
                if (fallbackData) return fallbackData;
                return null;
            }

            if (!response.ok) {
                throw new Error(`CoinGecko API error: ${response.status}`);
            }

            const data = await response.json();
            const coinData = data[coinId];

            if (!coinData) {
                return null;
            }

            const priceData: PriceData = {
                price: coinData[VS_CURRENCIES] || 0,
                change24h: coinData[`${VS_CURRENCIES}_24h_change`] || 0,
                marketCap: coinData[`${VS_CURRENCIES}_market_cap`] || 0
            };

            // Update cache and persist
            priceCache.set(symbol, {
                data: priceData,
                timestamp: Date.now()
            });
            saveCache();

            return priceData;
        } catch (error) {
            console.error(`[PriceService] Failed to fetch price for ${symbol}:`, error);

            // Fallback: Return expired cache if available
            if (cached) {
                console.warn(`[PriceService] Using stale cache for ${symbol}`);
                return cached.data;
            }

            // Fallback: Return mock data if available
            const fallbackData = FALLBACK_PRICES[symbol];
            if (fallbackData) {
                console.warn(`[PriceService] Using fallback mock data for ${symbol}`);
                return fallbackData;
            }

            return null;
        } finally {
            inFlightRequests.delete(symbol);
        }
    })();

    inFlightRequests.set(symbol, fetchPromise);
    return fetchPromise;
}

/**
 * Get synchronous snapshot of all currently cached prices
 */
export function getCachedPrices(): Map<string, { price: number; change24h: number }> {
    const result = new Map<string, { price: number; change24h: number }>();
    priceCache.forEach((entry, symbol) => {
        result.set(symbol, { price: entry.data.price, change24h: entry.data.change24h });
    });
    return result;
}

/**
 * Get prices for multiple tokens at once
 * @param {string[]} symbols - Array of token symbols
 * @returns {Promise<Map<string, {price: number, change24h: number}>>}
 */
export async function getMultipleTokenPrices(symbols: string[]): Promise<Map<string, { price: number, change24h: number }>> {
    const results = new Map<string, { price: number, change24h: number }>();

    // Filter to only tokens with CoinGecko mapping
    const coinIds = symbols
        .map(s => ({ symbol: s, coinId: TOKEN_ID_MAP[s.toUpperCase()] }))
        .filter(item => item.coinId);

    if (coinIds.length === 0) {
        return results;
    }

    // Check if all requested tokens have fresh cache — skip API if so
    const allCached = coinIds.every(({ symbol }) => {
        const entry = priceCache.get(symbol);
        return entry && Date.now() - entry.timestamp < CACHE_TTL;
    });
    if (allCached) {
        coinIds.forEach(({ symbol }) => {
            const entry = priceCache.get(symbol);
            if (entry) results.set(symbol, { price: entry.data.price, change24h: entry.data.change24h });
        });
        return results;
    }

    // Populate results from cache first so we have something to return on error
    coinIds.forEach(({ symbol }) => {
        const entry = priceCache.get(symbol);
        if (entry) results.set(symbol, { price: entry.data.price, change24h: entry.data.change24h });
    });

    try {
        const headers: HeadersInit = {};
        if (COINGECKO_API_KEY) {
            (headers as any)['x-cg-demo-api-key'] = COINGECKO_API_KEY;
        }

        const ids = Array.from(new Set(coinIds.map(c => c.coinId))).join(',');
        const response = await fetch(
            `${COINGECKO_API_URL}/simple/price?ids=${ids}&vs_currencies=${VS_CURRENCIES}&include_24hr_change=true`,
            { headers }
        );

        if (response.status === 429) {
            console.warn('[PriceService] Rate limit hit (batch) — using cached data');
            return results; // already populated from cache above
        }

        if (!response.ok) {
            return results;
        }

        const data = await response.json();

        coinIds.forEach(({ symbol, coinId }) => {
            if (!coinId) return;
            const tokenData = data[coinId];
            if (tokenData) {
                const entry = { price: tokenData[VS_CURRENCIES] || 0, change24h: tokenData[`${VS_CURRENCIES}_24h_change`] || 0 };
                results.set(symbol, entry);
                priceCache.set(symbol, { data: { ...entry }, timestamp: Date.now() });
            }
        });
        saveCache();

        return results;
    } catch (error) {
        console.error('Failed to fetch multiple prices:', error);
        return results; // return whatever we have from cache
    }
}

/**
 * Format price for display
 * @param {number} price 
 * @returns {string}
 */
export function formatPrice(price: number | null | undefined): string {
    if (!price || price === 0) return '--';

    if (price < 0.01) {
        return `$${price.toFixed(6)}`;
    } else if (price < 1) {
        return `$${price.toFixed(4)}`;
    } else if (price < 1000) {
        return `$${price.toFixed(2)}`;
    } else {
        return `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    }
}

/**
 * Format percentage change
 * @param {number} change 
 * @returns {string}
 */
export function formatChange(change: number | null | undefined): string {
    if (change === null || change === undefined) return '--';

    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
}

/**
 * Check if token has price data available
 * @param {string} symbol 
 * @returns {boolean}
 */
export function hasPriceData(symbol: string): boolean {
    return TOKEN_ID_MAP[symbol.toUpperCase()] !== undefined && TOKEN_ID_MAP[symbol.toUpperCase()] !== null;
}

/**
 * Format USD value for display
 * @param {number} value 
 * @returns {string}
 */
export function formatUsd(value: number | null | undefined): string {
    if (!value || value === 0 || isNaN(value)) {
        return '$0.00';
    }

    return `$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Calculate USD value from token amount and price
 * @param {number|string} amount - Token amount
 * @param {number} price - Token price in USD
 * @returns {number}
 */
export function calculateUsdValue(amount: number | string, price: number | null | undefined): number {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!numAmount || !price || isNaN(numAmount) || isNaN(price)) {
        return 0;
    }
    return numAmount * price;
}

export default {
    getTokenPrice,
    getMultipleTokenPrices,
    getCachedPrices,
    formatPrice,
    formatChange,
    hasPriceData,
    formatUsd,
    calculateUsdValue,
};
