/**
 * EVM Provider — registry-driven RPC routing.
 *
 * All RPC URLs come from src/config/rpcEndpoints.ts.
 * ETH mainnet uses private RPCs (Infura/dRPC/zan.top/Chainstack) as primary.
 *
 * Alchemy (ALCHEMY_ETH_RPC) is used ONLY for:
 *   - estimateGas simulation on Ethereum mainnet (more accurate execution context)
 *   - alchemy_getAssetTransfers in EthHistoryService
 * All other calls use the private RPC pool to preserve Alchemy rate limits.
 */

import { ethers } from 'ethers';
import { getPrimaryRpc, getRpcEndpoint, getRpcList, ALCHEMY_ETH_RPC } from '../config/rpcEndpoints';
import { resolveNetwork, resolveNetworkByChainId } from '../services/network/NetworkResolver';

/**
 * Fast public RPC endpoints used strictly for read-only native and token balance queries.
 * Appended with the private RPC pool as fallback in case of rate limits (HTTP 429) or timeouts.
 */
export const BALANCE_PUBLIC_RPC: Record<number, string[]> = {
    143: ['https://rpc.monad.xyz'],                                 // Monad
    999: ['https://rpc.hyperliquid.xyz/evm'],                       // Hyperliquid
    137: ['https://polygon-rpc.com'],                               // Polygon
    42161: ['https://arb1.arbitrum.io/rpc'],                        // Arbitrum One
    56: ['https://bsc-dataseed.binance.org/'],                      // BNB Chain
};

/**
 * Returns the ordered list of RPC URLs for balance fetches:
 * Public endpoints first, followed by private nodes from the standard pool.
 */
export function getBalanceRpcList(chainId: number): string[] {
    const publics = BALANCE_PUBLIC_RPC[chainId] || [];
    const privates = getRpcList(chainId);
    
    const merged = [...publics];
    for (const p of privates) {
        if (p && !merged.includes(p)) {
            merged.push(p);
        }
    }
    return merged;
}

/** RPC URL for ETH mainnet (chainId 1) — uses private pool, not Alchemy. */
export function getEvmRpcUrl(): string {
    return getPrimaryRpc(1);
}

/** RPC URL by network registry key (e.g. 'ethereum', 'bsc', 'polygon', 'sepolia'). */
export function getEvmRpcUrlForNetwork(networkName: string): string {
    const config = resolveNetwork(networkName);
    if (config?.rpcUrl) return config.rpcUrl;
    if (config?.chainId) return getPrimaryRpc(config.chainId);
    return getRpcEndpoint(1);
}

/** RPC URL by chainId — checks user-added networks too. */
export function getEvmRpcUrlForChain(chainId: number): string {
    const config = resolveNetworkByChainId(chainId);
    return config?.rpcUrl ?? getPrimaryRpc(chainId);
}

export function getEvmProvider(): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(getEvmRpcUrl());
}

export function getEvmProviderForNetwork(networkName: string): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(getEvmRpcUrlForNetwork(networkName));
}

export function getEvmProviderForChain(chainId: number): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(getEvmRpcUrlForChain(chainId));
}

/**
 * Try op against every RPC for chainId in order.
 * On failure, advances to the next URL. Throws if all RPCs fail.
 */
export async function withEvmFallbackForChain<T>(
    chainId: number,
    op: (provider: ethers.JsonRpcProvider) => Promise<T>
): Promise<T> {
    const urls = getBalanceRpcList(chainId);
    let lastErr: unknown;
    for (const url of urls) {
        try {
            return await op(new ethers.JsonRpcProvider(url));
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr;
}

/** Run op on ETH mainnet RPC list in order (private pool → public fallbacks). */
export async function withEvmFallback<T>(op: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    return withEvmFallbackForChain(1, op);
}

export async function withEvmFallbackForNetwork<T>(
    networkName: string,
    op: (provider: ethers.JsonRpcProvider) => Promise<T>
): Promise<T> {
    const chainId = resolveNetwork(networkName)?.chainId ?? 0;
    if (chainId) return withEvmFallbackForChain(chainId, op);
    return op(new ethers.JsonRpcProvider(getEvmRpcUrlForNetwork(networkName)));
}

export interface GasTier {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}

export interface GasOptions {
    gasLimit: bigint;
    slow: GasTier;
    normal: GasTier;
    fast: GasTier;
}

function gweiToWei(gwei: string): bigint {
    const [intStr, fracStr = ''] = gwei.split('.');
    const frac9 = fracStr.padEnd(9, '0').slice(0, 9);
    return BigInt(intStr || '0') * 1_000_000_000n + BigInt(frac9);
}

export { gweiToWei };

/**
 * Estimate gas and fetch fee tiers for a transaction.
 *
 * On Ethereum mainnet: uses Alchemy for estimateGas (better execution accuracy),
 * then the private RPC pool for getFeeData (current gas price).
 * On other chains: uses the chain's own RPC for both.
 */
export async function fetchGasOptions(
    tx: ethers.TransactionRequest,
    fallbackLimit: bigint = 400_000n,
    networkName?: string
): Promise<GasOptions> {
    const isEthMainnet = !networkName || networkName === 'ethereum';
    const config = resolveNetwork(networkName || 'ethereum');
    const chainId = config?.chainId ?? 1;
    const feeProvider = networkName ? getEvmProviderForNetwork(networkName) : getEvmProvider();

    // Compile ordered list of providers for robust gas estimation and fee fetching
    const simProviders: ethers.JsonRpcProvider[] = [];
    
    // 1. Try Alchemy first on Ethereum Mainnet
    if (isEthMainnet && ALCHEMY_ETH_RPC) {
        try {
            simProviders.push(new ethers.JsonRpcProvider(ALCHEMY_ETH_RPC));
        } catch { /* ignore */ }
    }

    // 2. Try the registry's configured URL
    if (config?.rpcUrl) {
        try {
            simProviders.push(new ethers.JsonRpcProvider(config.rpcUrl));
        } catch { /* ignore */ }
    }

    // 3. Try standard RPC pool fallback endpoints
    const rpcUrls = getRpcList(chainId) || [];
    for (const url of rpcUrls) {
        if (url && url !== ALCHEMY_ETH_RPC && url !== config?.rpcUrl) {
            try {
                simProviders.push(new ethers.JsonRpcProvider(url));
            } catch { /* ignore */ }
        }
    }

    // 4. Default fallback provider
    if (simProviders.length === 0) {
        simProviders.push(feeProvider);
    }

    // Estimate gas limit by trying providers in priority order (dynamic, no hardcode)
    let gasLimit = fallbackLimit;
    for (const provider of simProviders) {
        try {
            const est = await provider.estimateGas(tx);
            gasLimit = (est * 120n) / 100n; // Apply 20% buffer
            break;
        } catch (err) {
            console.warn(`[fetchGasOptions] estimateGas failed on provider, trying next:`, err);
        }
    }

    // Fetch dynamic fee tiers by trying providers in priority order
    let feeData: ethers.FeeData | null = null;
    for (const provider of simProviders) {
        try {
            const fd = await provider.getFeeData();
            if (fd) {
                feeData = fd;
                break;
            }
        } catch (err) {
            console.warn(`[fetchGasOptions] getFeeData failed on provider, trying next:`, err);
        }
    }

    if (feeData) {
        const base = feeData.gasPrice || 20_000_000_000n;
        const slow = base;
        const normal = (base * 110n) / 100n;
        const fast = (base * 130n) / 100n;
        const tip = (price: bigint) => {
            const t = price / 10n > 1_000_000_000n ? price / 10n : 1_000_000_000n;
            return t > price ? price : t;
        };
        return {
            gasLimit,
            slow:   { maxFeePerGas: slow,   maxPriorityFeePerGas: tip(slow) },
            normal: { maxFeePerGas: normal, maxPriorityFeePerGas: tip(normal) },
            fast:   { maxFeePerGas: fast,   maxPriorityFeePerGas: tip(fast) },
        };
    } else {
        const base = 20_000_000_000n;
        const tip = 2_000_000_000n;
        return {
            gasLimit,
            slow:   { maxFeePerGas: base,            maxPriorityFeePerGas: tip },
            normal: { maxFeePerGas: base * 11n / 10n, maxPriorityFeePerGas: tip * 2n },
            fast:   { maxFeePerGas: base * 13n / 10n, maxPriorityFeePerGas: tip * 3n },
        };
    }
}
