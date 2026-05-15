/**
 * EVM Provider — Alchemy-only
 *
 * Uses VITE_ETH_RPC_URL (Alchemy) as the single EVM JSON-RPC endpoint.
 */

import { ethers } from 'ethers';

const ALCHEMY_RPC =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ETH_RPC_URL) || '';

const FALLBACK_ALCHEMY_RPC =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FALLBACK_ETH_RPC_URL) || '';

export function getEvmRpcUrl(): string {
    return ALCHEMY_RPC;
}

export function getEvmProvider(): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(ALCHEMY_RPC);
}

export async function withEvmFallback<T>(op: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    try {
        return await op(new ethers.JsonRpcProvider(ALCHEMY_RPC));
    } catch (e: any) {
        // Fallback to secondary Alchemy RPC if rate limited or failed
        if (e?.message?.includes('429') || e?.status === 429 || e?.info?.error?.code === 429 || e?.code === 'SERVER_ERROR' || e?.code === 'NETWORK_ERROR') {
            console.warn('[EVM Provider] Primary RPC failed, falling back to secondary RPC...', e);
            return await op(new ethers.JsonRpcProvider(FALLBACK_ALCHEMY_RPC));
        }
        throw e;
    }
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


// Parse a decimal Gwei string (e.g. "0.496839934") → wei BigInt
export function gweiToWei(gwei: string): bigint {
    const [intStr, fracStr = ''] = gwei.split('.');
    const frac9 = fracStr.padEnd(9, '0').slice(0, 9);
    return BigInt(intStr || '0') * 1_000_000_000n + BigInt(frac9);
}

/**
 * Fetch real gas options.
 * - gasLimit: eth_estimateGas on the actual tx (+ 20% buffer), or fallbackGasLimit
 * - slow/normal/fast: Etherscan Gas Oracle (SafeGasPrice / ProposeGasPrice / FastGasPrice)
 *
 * Include `from` in the tx when the contract checks caller balance (e.g. ERC20 transfer).
 */
export async function fetchGasOptions(
    tx: ethers.TransactionRequest,
    fallbackLimit: bigint = 400_000n
): Promise<GasOptions> {
    const provider = getEvmProvider();

    // 1. Get accurate Gas Limit (Simulation)
    let gasLimit = fallbackLimit;
    try {
        const est = await provider.estimateGas(tx);
        gasLimit = (est * 120n) / 100n; // 20% buffer
    } catch (e) { 
        console.warn("[EVM Provider] Simulation failed, using fallback gas limit"); 
    }

    // 2. Get base fee and apply multipliers
    try {
        const feeData = await provider.getFeeData();
        const base = feeData.gasPrice || 20_000_000_000n; // fallback to 20 Gwei

        const slow = base;
        const normal = (base * 110n) / 100n;
        const fast = (base * 130n) / 100n;

        // Priority fee (miner tip) - 10% of base fee, min 1 Gwei, but never more than the fee itself
        const tip = (price: bigint) => {
            const desiredTip = price / 10n > 1_000_000_000n ? price / 10n : 1_000_000_000n;
            return desiredTip > price ? price : desiredTip;
        };

        return {
            gasLimit,
            slow:   { maxFeePerGas: slow,   maxPriorityFeePerGas: tip(slow) },
            normal: { maxFeePerGas: normal, maxPriorityFeePerGas: tip(normal) },
            fast:   { maxFeePerGas: fast,   maxPriorityFeePerGas: tip(fast) }
        };
    } catch (e) {
        console.warn("[EVM Provider] Fee data unavailable, using ultimate fallback");
        const base = 20_000_000_000n;
        const tip = 2_000_000_000n;
        return {
            gasLimit,
            slow:   { maxFeePerGas: base, maxPriorityFeePerGas: tip },
            normal: { maxFeePerGas: base * 11n / 10n, maxPriorityFeePerGas: tip * 2n },
            fast:   { maxFeePerGas: base * 13n / 10n, maxPriorityFeePerGas: tip * 3n }
        };
    }
}
