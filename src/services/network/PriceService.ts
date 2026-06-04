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
        price: 0.0796,
        change24h: 36.52,
        marketCap: 15000000
    },
    'WOCT': {
        price: 0.0796,
        change24h: 36.52,
        marketCap: 15000000
    },
    'ETH': {
        price: 2123.49,
        change24h: 4.51,
        marketCap: 300000000000
    },
    'BTC': {
        price: 76935,
        change24h: 3.22,
        marketCap: 850000000000
    },
    'USDT': {
        price: 1.00,
        change24h: 0.0,
        marketCap: 100000000000
    },
    'USDC': {
        price: 0.9997,
        change24h: -0.00,
        marketCap: 30000000000
    },
    'DAI': {
        price: 1.00,
        change24h: 0.0,
        marketCap: 5000000000
    },
    'WBTC': {
        price: 76935,
        change24h: 3.22,
        marketCap: 10000000000
    },
    'LINK': {
        price: 15.00,
        change24h: 1.5,
        marketCap: 8000000000
    },
    'UNI': {
        price: 7.50,
        change24h: -0.5,
        marketCap: 4000000000
    },
    'PEPE': { price: 0.000009, change24h: 0.0, marketCap: 3800000000 },
    'SHIB': { price: 0.000015, change24h: 0.0, marketCap: 8800000000 },
    'MATIC': { price: 0.50, change24h: 0.0, marketCap: 5000000000 },
    'GRT': { price: 0.15, change24h: 0.0, marketCap: 1400000000 },
    'AAVE': { price: 180.00, change24h: 0.0, marketCap: 2700000000 },
    'MKR': { price: 1500.00, change24h: 0.0, marketCap: 1400000000 },
    'LDO': { price: 1.20, change24h: 0.0, marketCap: 1100000000 },
    'BNB': { price: 600.00, change24h: 0.0, marketCap: 86000000000 },
    'WBNB': { price: 600.00, change24h: 0.0, marketCap: 86000000000 },
    'POL': { price: 0.25, change24h: 0.0, marketCap: 2300000000 },
    'WPOL': { price: 0.25, change24h: 0.0, marketCap: 2300000000 },
    'WMATIC': { price: 0.50, change24h: 0.0, marketCap: 5000000000 },
    'WETH': { price: 2123.49, change24h: 4.51, marketCap: 300000000000 },
    'HYPE': { price: 64.23, change24h: 8.52, marketCap: 15000000000 },
    'MON': { price: 0.025, change24h: 0.0, marketCap: 500000000 },
    'SOL': {
        price: 154.52,
        change24h: 2.15,
        marketCap: 72000000000
    },
    'SUI': {
        price: 1.84,
        change24h: -1.25,
        marketCap: 4800000000
    },
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
    'DAI': 'dai',
    'WBTC': 'wrapped-bitcoin',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'PEPE': 'pepe',
    'SHIB': 'shiba-inu',
    'MATIC': 'matic-network',
    'WMATIC': 'matic-network',
    'WETH': 'ethereum',
    'WBNB': 'binancecoin',
    'GRT': 'the-graph',
    'AAVE': 'aave',
    'MKR': 'maker',
    'LDO': 'lido-dao',
    'BNB': 'binancecoin',
    'POL': 'polygon-ecosystem-token',
    'WPOL': 'polygon-ecosystem-token',
    'HYPE': 'hyperliquid',
    'MON': 'monad', // CoinGecko coin ID confirmed: api.coingecko.com/v3/simple/price?ids=monad
    'SOL': 'solana',
    'SUI': 'sui',
};

// GeckoTerminal network slugs — for tokens not on standard CoinGecko /simple/price.
// MON is covered by TOKEN_ID_MAP above, so this map is reserved for future tokens
// that only have on-chain pricing (e.g. new L2 native tokens before CoinGecko listing).
const GECKO_TERMINAL_NATIVE: Record<string, string> = {
    // Example: 'NEWTOKEN': 'some-network-slug'
};

/**
 * Fetch native token price from GeckoTerminal on-chain API.
 * Used for tokens not yet listed on the standard CoinGecko /simple/price endpoint.
 */
async function getGeckoTerminalNativePrice(networkSlug: string): Promise<PriceData | null> {
    const NATIVE_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const cacheKey = `gecko:${networkSlug}:native`;
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

    try {
        const resp = await fetch(
            `https://api.geckoterminal.com/api/v2/simple/networks/${networkSlug}/token_price/${NATIVE_ADDRESS}`,
            { headers: { Accept: 'application/json;version=20230302' } }
        );
        if (!resp.ok) return null;
        const json = await resp.json();
        const priceStr = json?.data?.attributes?.token_prices?.[NATIVE_ADDRESS.toLowerCase()];
        if (!priceStr) return null;
        const price = parseFloat(priceStr);
        if (!price || price <= 0) return null;
        const entry: PriceData = { price, change24h: 0 };
        priceCache.set(cacheKey, { data: entry, timestamp: Date.now() });
        saveCache();
        return entry;
    } catch {
        return null;
    }
}

/**
 * Get price data for a token
 * @param {string} symbol - Token symbol (e.g., 'OCT', 'ETH')
 * @returns {Promise<PriceData | null>}
 */
export async function getTokenPrice(symbol: string): Promise<PriceData | null> {
    const upperSym = symbol.toUpperCase();

    // Try GeckoTerminal for native tokens with a known network slug
    const gtNetwork = GECKO_TERMINAL_NATIVE[upperSym];
    if (gtNetwork) {
        const gtPrice = await getGeckoTerminalNativePrice(gtNetwork);
        if (gtPrice) return gtPrice;
    }

    const coinId = TOKEN_ID_MAP[upperSym];

    // Token not mapped to CoinGecko; return fallback if available
    if (!coinId) {
        const fallback = FALLBACK_PRICES[upperSym];
        return fallback ?? null;
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

    const remainingSymbols = symbols;

    // 1. Baseline: apply FALLBACK_PRICES for all tokens so we always have something
    for (const s of remainingSymbols) {
        const fallback = FALLBACK_PRICES[s.toUpperCase()];
        if (fallback) results.set(s, { price: fallback.price, change24h: fallback.change24h });
    }

    // 2. GeckoTerminal live prices for native tokens on supported networks (e.g. MON/Monad)
    const gtSymbols = remainingSymbols.filter(s => GECKO_TERMINAL_NATIVE[s.toUpperCase()]);
    if (gtSymbols.length > 0) {
        const gtPrices = await Promise.all(
            gtSymbols.map(async s => ({
                symbol: s,
                data: await getGeckoTerminalNativePrice(GECKO_TERMINAL_NATIVE[s.toUpperCase()]).catch(() => null)
            }))
        );
        gtPrices.forEach(({ symbol, data }) => {
            if (data && data.price > 0) results.set(symbol, { price: data.price, change24h: data.change24h });
        });
    }

    // 3. Filter to tokens with a CoinGecko mapping
    const coinIds = remainingSymbols
        .map(s => ({ symbol: s, coinId: TOKEN_ID_MAP[s.toUpperCase()] }))
        .filter((item): item is { symbol: string; coinId: string } => !!item.coinId);

    if (coinIds.length === 0) return results;

    // 4. Override with fresh cache (only non-zero prices win over fallback)
    const allFreshCached = coinIds.every(({ symbol }) => {
        const entry = priceCache.get(symbol);
        return entry && Date.now() - entry.timestamp < CACHE_TTL && entry.data.price > 0;
    });
    if (allFreshCached) {
        coinIds.forEach(({ symbol }) => {
            const entry = priceCache.get(symbol);
            if (entry && entry.data.price > 0) results.set(symbol, { price: entry.data.price, change24h: entry.data.change24h });
        });
        return results;
    }

    // Seed results with cached values (non-zero overrides fallback; zero skipped so fallback wins)
    coinIds.forEach(({ symbol }) => {
        const entry = priceCache.get(symbol);
        if (entry && entry.data.price > 0) results.set(symbol, { price: entry.data.price, change24h: entry.data.change24h });
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
            console.warn('[PriceService] Rate limit hit (batch) — using cached data + fallbacks');
            // Fallbacks already applied in step 2; return what we have
            return results;
        }

        if (!response.ok) return results;

        const data = await response.json();

        coinIds.forEach(({ symbol, coinId }) => {
            const tokenData = data[coinId];
            if (tokenData) {
                const price = tokenData[VS_CURRENCIES] || 0;
                const change24h = tokenData[`${VS_CURRENCIES}_24h_change`] || 0;
                if (price > 0) {
                    results.set(symbol, { price, change24h });
                    priceCache.set(symbol, { data: { price, change24h }, timestamp: Date.now() });
                }
            }
        });
        saveCache();

        return results;
    } catch (error) {
        console.error('Failed to fetch multiple prices:', error);
        // Fallbacks already applied in step 2
        return results;
    }
}

/**
 * Get price data for a token by its Ethereum contract address using CoinGecko's simple/token_price/ethereum endpoint
 * @param {string} contractAddress - EVM contract address
 * @returns {Promise<PriceData | null>}
 */
export async function getTokenPriceByContract(contractAddress: string): Promise<PriceData | null> {
    const addressLower = contractAddress.toLowerCase();
    
    // Check cache
    const cacheKey = `contract:${addressLower}`;
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    
    try {
        const headers: HeadersInit = {};
        if (COINGECKO_API_KEY) {
            headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
        }

        const response = await fetch(
            `${COINGECKO_API_URL}/simple/token_price/ethereum?contract_addresses=${addressLower}&vs_currencies=${VS_CURRENCIES}&include_24hr_change=true`,
            { headers }
        );

        if (response.ok) {
            const data = await response.json();
            const coinData = data[addressLower];

            if (coinData) {
                const priceData: PriceData = {
                    price: coinData[VS_CURRENCIES] || 0,
                    change24h: coinData[`${VS_CURRENCIES}_24h_change`] || 0,
                };

                // Cache the result
                priceCache.set(cacheKey, {
                    data: priceData,
                    timestamp: Date.now()
                });
                saveCache();

                return priceData;
            }
        }
    } catch (error) {
        console.warn(`[PriceService] Failed to fetch price for contract ${contractAddress} via CoinGecko, trying fallbacks:`, error);
    }

    // Try DexScreener fallback for single address
    try {
        const dexResults = await fetchPricesFromDexScreener([{ symbol: 'TEMP', contractAddress }]);
        const res = dexResults.get('TEMP');
        if (res && res.price > 0) {
            return { price: res.price, change24h: res.change24h };
        }
    } catch { /* ignore */ }

    // Try DefiLlama fallback for single address (default to chainId 1 - Ethereum, but try to query)
    try {
        const llamaResults = await fetchPricesFromDefiLlama([{ symbol: 'TEMP', contractAddress, chainId: 1 }]);
        const res = llamaResults.get('TEMP');
        if (res && res.price > 0) {
            return { price: res.price, change24h: res.change24h };
        }
    } catch { /* ignore */ }

    if (cached) return cached.data;
    return null;
}

// CoinGecko platform IDs per EVM chain — used for contract-address price lookup
const COINGECKO_PLATFORM: Record<number, string> = {
    1:     'ethereum',
    56:    'binance-smart-chain',
    137:   'polygon-pos',
    8453:  'base',
    42161: 'arbitrum-one',
    10:    'optimistic-ethereum',
    43114: 'avalanche',
};

const DEFILLAMA_CHAIN_MAP: Record<number, string> = {
    1:     'ethereum',
    56:    'bsc',
    137:   'polygon',
    8453:  'base',
    42161: 'arbitrum',
    10:    'optimism',
    43114: 'avax',
};

async function fetchPricesFromDexScreener(
    tokens: Array<{ symbol: string; contractAddress: string }>
): Promise<Map<string, { price: number; change24h: number }>> {
    const results = new Map<string, { price: number; change24h: number }>();
    if (tokens.length === 0) return results;

    const addressList = tokens.map(t => t.contractAddress.toLowerCase()).join(',');
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addressList}`);
        if (!response.ok) return results;
        const data = await response.json();
        
        const pairs = data?.pairs || [];
        const addressToPair = new Map<string, any>();
        for (const pair of pairs) {
            const addr = pair?.baseToken?.address?.toLowerCase();
            if (!addr) continue;
            const existing = addressToPair.get(addr);
            if (!existing || (pair.volume?.h24 || 0) > (existing.volume?.h24 || 0)) {
                addressToPair.set(addr, pair);
            }
        }

        for (const t of tokens) {
            const addrLower = t.contractAddress.toLowerCase();
            const pair = addressToPair.get(addrLower);
            if (pair) {
                const price = parseFloat(pair.priceUsd || '0');
                const change24h = parseFloat(pair.priceChange?.h24 || '0');
                if (price > 0) {
                    results.set(t.symbol, { price, change24h });
                    priceCache.set(`contract:${addrLower}`, { data: { price, change24h }, timestamp: Date.now() });
                }
            }
        }
        saveCache();
    } catch (e) {
        console.warn('[PriceService] DexScreener fallback failed:', e);
    }
    return results;
}

async function fetchPricesFromDefiLlama(
    tokens: Array<{ symbol: string; contractAddress: string; chainId: number }>
): Promise<Map<string, { price: number; change24h: number }>> {
    const results = new Map<string, { price: number; change24h: number }>();
    if (tokens.length === 0) return results;

    const coinsList = tokens
        .map(t => {
            const chainPrefix = DEFILLAMA_CHAIN_MAP[t.chainId];
            if (!chainPrefix) return null;
            return `${chainPrefix}:${t.contractAddress.toLowerCase()}`;
        })
        .filter(Boolean)
        .join(',');

    if (!coinsList) return results;

    try {
        const response = await fetch(`https://coins.llama.fi/prices/current/${coinsList}`);
        if (!response.ok) return results;
        const data = await response.json();
        const coinsData = data?.coins || {};

        for (const t of tokens) {
            const chainPrefix = DEFILLAMA_CHAIN_MAP[t.chainId];
            if (!chainPrefix) continue;
            const key = `${chainPrefix}:${t.contractAddress.toLowerCase()}`;
            const coinInfo = coinsData[key];
            if (coinInfo) {
                const price = parseFloat(coinInfo.price || '0');
                const change24h = 0;
                if (price > 0) {
                    results.set(t.symbol, { price, change24h });
                    priceCache.set(`contract:${t.contractAddress.toLowerCase()}`, { data: { price, change24h }, timestamp: Date.now() });
                }
            }
        }
        saveCache();
    } catch (e) {
        console.warn('[PriceService] DefiLlama fallback failed:', e);
    }
    return results;
}

/**
 * Fetch prices for a batch of contract addresses on a single CoinGecko platform.
 * Internal helper — use getMultiplePricesByContractsMultiChain for external callers.
 */
async function fetchContractPricesForPlatform(
    platform: string,
    tokens: Array<{ symbol: string; contractAddress: string }>
): Promise<Map<string, { price: number; change24h: number }>> {
    const results = new Map<string, { price: number; change24h: number }>();
    if (tokens.length === 0) return results;

    const toFetch: Array<{ symbol: string; contractAddress: string }> = [];
    for (const t of tokens) {
        const cacheKey = `contract:${t.contractAddress.toLowerCase()}`;
        const cached = priceCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL && cached.data.price > 0) {
            results.set(t.symbol, { price: cached.data.price, change24h: cached.data.change24h });
        } else {
            toFetch.push(t);
        }
    }

    if (toFetch.length === 0) return results;

    const addressList = toFetch.map(t => t.contractAddress.toLowerCase()).join(',');
    try {
        const headers: HeadersInit = {};
        if (COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;

        const response = await fetch(
            `${COINGECKO_API_URL}/simple/token_price/${platform}?contract_addresses=${addressList}&vs_currencies=${VS_CURRENCIES}&include_24hr_change=true`,
            { headers }
        );

        if (response.status === 429) {
            for (const t of toFetch) {
                const stale = priceCache.get(`contract:${t.contractAddress.toLowerCase()}`);
                if (stale) results.set(t.symbol, { price: stale.data.price, change24h: stale.data.change24h });
            }
            return results;
        }

        if (!response.ok) return results;

        const data = await response.json();
        for (const t of toFetch) {
            const addrLower = t.contractAddress.toLowerCase();
            const coinData = data[addrLower];
            if (coinData) {
                const price = coinData[VS_CURRENCIES] || 0;
                const change24h = coinData[`${VS_CURRENCIES}_24h_change`] || 0;
                if (price > 0) {
                    results.set(t.symbol, { price, change24h });
                    priceCache.set(`contract:${addrLower}`, { data: { price, change24h }, timestamp: Date.now() });
                }
            }
        }
        saveCache();
    } catch {
        // Return whatever we have from cache
        for (const t of toFetch) {
            const stale = priceCache.get(`contract:${t.contractAddress.toLowerCase()}`);
            if (stale) results.set(t.symbol, { price: stale.data.price, change24h: stale.data.change24h });
        }
    }

    // Try DexScreener and DefiLlama fallbacks for any missing tokens
    const missing = toFetch.filter(t => !results.has(t.symbol));
    if (missing.length > 0) {
        try {
            const chainId = Number(Object.keys(COINGECKO_PLATFORM).find(key => COINGECKO_PLATFORM[Number(key)] === platform) || 1);
            const dexResults = await fetchPricesFromDexScreener(missing);
            dexResults.forEach((val, key) => results.set(key, val));

            const stillMissing = missing.filter(t => !results.has(t.symbol));
            if (stillMissing.length > 0) {
                const stillMissingWithChain = stillMissing.map(t => ({ ...t, chainId }));
                const llamaResults = await fetchPricesFromDefiLlama(stillMissingWithChain);
                llamaResults.forEach((val, key) => results.set(key, val));
            }
        } catch (e) {
            console.warn('[PriceService] Fallbacks inside fetchContractPricesForPlatform failed:', e);
        }
    }

    return results;
}

/**
 * Batch-fetch prices for tokens on Ethereum only (backwards compat).
 * @deprecated Use getMultiplePricesByContractsMultiChain for multi-chain support.
 */
export async function getMultiplePricesByContracts(
    tokens: Array<{ symbol: string; contractAddress: string }>
): Promise<Map<string, { price: number; change24h: number }>> {
    return fetchContractPricesForPlatform('ethereum', tokens);
}

/**
 * Automatically fetch prices for any EVM token by contract address, across all supported chains.
 * No manual TOKEN_ID_MAP entry needed — works for any imported/discovered token.
 * Tokens without a supported chain (e.g. Octra) are skipped silently.
 */
export async function getMultiplePricesByContractsMultiChain(
    tokens: Array<{ symbol: string; contractAddress: string; chainId: number }>
): Promise<Map<string, { price: number; change24h: number }>> {
    const results = new Map<string, { price: number; change24h: number }>();
    if (tokens.length === 0) return results;

    // Group tokens by their CoinGecko platform
    const byPlatform = new Map<string, Array<{ symbol: string; contractAddress: string }>>();
    for (const t of tokens) {
        const platform = COINGECKO_PLATFORM[t.chainId];
        if (!platform || !t.contractAddress || t.contractAddress === '0x0000000000000000000000000000000000000000') continue;
        const arr = byPlatform.get(platform) ?? [];
        arr.push({ symbol: t.symbol, contractAddress: t.contractAddress });
        byPlatform.set(platform, arr);
    }

    // Fetch all platforms in parallel — each platform = 1 API call
    const fetches = Array.from(byPlatform.entries()).map(([platform, list]) =>
        fetchContractPricesForPlatform(platform, list)
    );
    const allResults = await Promise.all(fetches);
    allResults.forEach(m => m.forEach((v, k) => results.set(k, v)));

    return results;
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
 * Seed the price cache with a known price (e.g., from LI.FI token API response).
 * Keyed by both symbol and contract address so HomeView lookups hit.
 */
export function seedTokenPrice(symbol: string, contractAddress: string, price: number, change24h = 0): void {
    if (price <= 0) return;
    const entry = { data: { price, change24h }, timestamp: Date.now() };
    priceCache.set(symbol.toUpperCase(), entry);
    if (contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000') {
        priceCache.set(`contract:${contractAddress.toLowerCase()}`, entry);
    }
    saveCache();
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
    getTokenPriceByContract,
    formatPrice,
    formatChange,
    hasPriceData,
    formatUsd,
    calculateUsdValue,
};
