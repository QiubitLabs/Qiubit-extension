/**
 * Price Service - Fetches token prices from CoinGecko API
 * 
 * v2.0 Features:
 * - Persistent cache (survives refresh)
 * - Automatic cache expiration
 * - Fallback to cached data on API failure
 */

const COINGECKO_API_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_COINGECKO_API_URL) || 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = typeof import.meta !== 'undefined' ? import.meta.env.VITE_COINGECKO_API_KEY : undefined;

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_STORAGE_KEY = '_price_cache';

// Load cache from localStorage on init
let priceCache = new Map();
try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    if (stored) {
        const parsed = JSON.parse(stored);
        // Restore Map from stored array
        priceCache = new Map(parsed);
    }
} catch (error) {
    console.warn('[PriceService] Failed to load cache:', error);
    priceCache = new Map();
}

// Save cache to localStorage
function saveCache() {
    try {
        // Convert Map to array for JSON serialization
        const cacheArray = Array.from(priceCache.entries());
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheArray));
    } catch (error) {
        console.warn('[PriceService] Failed to save cache:', error);
    }
}

// Token ID mapping for CoinGecko
// Add mappings for tokens when they get listed on CoinGecko
const TOKEN_ID_MAP = {
    'OCT': null,  // Octra not listed yet
    'ETH': 'ethereum',
    'BTC': 'bitcoin',
    'USDT': 'tether',
    'USDC': 'usd-coin',
};

/**
 * Get price data for a token
 * @param {string} symbol - Token symbol (e.g., 'OCT', 'ETH')
 * @returns {Promise<{price: number, change24h: number, marketCap: number} | null>}
 */
export async function getTokenPrice(symbol) {
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

    try {
        const response = await fetch(
            `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
            {
                headers: COINGECKO_API_KEY ? { 'x-cg-pro-api-key': COINGECKO_API_KEY } : {}
            }
        );

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = await response.json();
        const coinData = data[coinId];

        if (!coinData) {
            return null;
        }

        const priceData = {
            price: coinData.usd,
            change24h: coinData.usd_24h_change || 0,
            marketCap: coinData.usd_market_cap || 0
        };

        // Update cache and persist
        priceCache.set(symbol, {
            data: priceData,
            timestamp: Date.now()
        });
        saveCache(); // Persist to localStorage

        return priceData;
    } catch (error) {
        console.error(`[PriceService] Failed to fetch price for ${symbol}:`, error);

        // Fallback: Return expired cache if available
        if (cached) {
            console.warn(`[PriceService] Using stale cache for ${symbol}`);
            return cached.data;
        }

        return null;
    }
}

/**
 * Get prices for multiple tokens at once
 * @param {string[]} symbols - Array of token symbols
 * @returns {Promise<Map<string, {price: number, change24h: number}>>}
 */
export async function getMultipleTokenPrices(symbols) {
    const results = new Map();

    // Filter to only tokens with CoinGecko mapping
    const coinIds = symbols
        .map(s => ({ symbol: s, coinId: TOKEN_ID_MAP[s.toUpperCase()] }))
        .filter(item => item.coinId);

    if (coinIds.length === 0) {
        return results;
    }

    try {
        const headers = {};
        if (COINGECKO_API_KEY) {
            headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
        }

        const ids = coinIds.map(c => c.coinId).join(',');
        const response = await fetch(
            `${COINGECKO_API_URL}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
            { headers }
        );

        if (!response.ok) {
            return results;
        }

        const data = await response.json();

        coinIds.forEach(({ symbol, coinId }) => {
            const tokenData = data[coinId];
            if (tokenData) {
                results.set(symbol, {
                    price: tokenData.usd || 0,
                    change24h: tokenData.usd_24h_change || 0,
                });
            }
        });

        return results;
    } catch (error) {
        console.error('Failed to fetch multiple prices:', error);
        return results;
    }
}

/**
 * Format price for display
 * @param {number} price 
 * @returns {string}
 */
export function formatPrice(price) {
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
export function formatChange(change) {
    if (change === null || change === undefined) return '--';

    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
}

/**
 * Check if token has price data available
 * @param {string} symbol 
 * @returns {boolean}
 */
export function hasPriceData(symbol) {
    return TOKEN_ID_MAP[symbol.toUpperCase()] !== undefined && TOKEN_ID_MAP[symbol.toUpperCase()] !== null;
}

/**
 * Format USD value for display
 * @param {number} value 
 * @returns {string}
 */
export function formatUsd(value) {
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
export function calculateUsdValue(amount, price) {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!numAmount || !price || isNaN(numAmount) || isNaN(price)) {
        return 0;
    }
    return numAmount * price;
}

export default {
    getTokenPrice,
    getMultipleTokenPrices,
    formatPrice,
    formatChange,
    hasPriceData,
    formatUsd,
    calculateUsdValue,
};
