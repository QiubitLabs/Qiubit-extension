/**
 * LOGIC: Coordinates EVM JSON-RPC provider instances, fallbacks/failovers, and gas fee estimation.
 * Rotates between public endpoints and private RPC pools upon connection failures, handles custom Gwei-to-Wei parsing, estimates gas limits with a 20% safety buffer, and calculates EIP-1559 gas price tiers.
 * EXPORTS:
 *   - BALANCE_PUBLIC_RPC (const record)
 *   - getBalanceRpcList (function)
 *   - getEvmRpcUrl (function)
 *   - getEvmRpcUrlForNetwork (function)
 *   - getEvmRpcUrlForChain (function)
 *   - getEvmProvider (function)
 *   - getEvmProviderForNetwork (function)
 *   - getEvmProviderForChain (function)
 *   - withEvmFallbackForChain (async function)
 *   - withEvmFallback (async function)
 *   - withEvmFallbackForNetwork (async function)
 *   - GasTier (interface)
 *   - GasOptions (interface)
 *   - gweiToWei (function)
 *   - fetchGasOptions (async function)
 * FUNCTIONS:
 *   - getBalanceRpcList(chainId): Merges fast public balance endpoints with private configuration nodes.
 *   - getEvmRpcUrl() / getEvmRpcUrlForNetwork(name) / getEvmRpcUrlForChain(id): Resolves active RPC URL for a chain or network name.
 *   - getEvmProvider() / getEvmProviderForNetwork(name) / getEvmProviderForChain(id): Returns a new JsonRpcProvider instance.
 *   - withEvmFallbackForChain(id, op) / withEvmFallback(op) / withEvmFallbackForNetwork(name, op): Executes a task while rotating providers across the RPC list on failure.
 *   - gweiToWei(gwei): Parses a decimal string representation of Gwei to Wei bigint without rounding errors.
 *   - fetchGasOptions(tx, fallbackLimit, networkName): Simulates transaction gas limit (preferring Alchemy on mainnet) and calculates slow/normal/fast fee data.
 */

import { ethers } from "ethers";
import {
  getPrimaryRpc,
  getRpcEndpoint,
  getRpcList,
  getTransactionRpc,
  getTransactionRpcList,
  ALCHEMY_ETH_RPC,
} from "../config/rpcEndpoints";
import {
  resolveNetwork,
  resolveNetworkByChainId,
} from "../services/network/NetworkResolver";

/**
 * Fast public RPC endpoints used strictly for read-only native and token balance queries.
 * Appended with the private RPC pool as fallback in case of rate limits (HTTP 429) or timeouts.
 */
export const BALANCE_PUBLIC_RPC: Record<number, string[]> = {
  143: ["https://rpc.monad.xyz"], // Monad
  999: ["https://rpc.hyperliquid.xyz/evm"], // Hyperliquid
  137: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://1rpc.io/matic",
  ], // Polygon (polygon-rpc.com now requires a key — dropped)
  42161: ["https://arb1.arbitrum.io/rpc"], // Arbitrum One
  56: ["https://bsc-dataseed.binance.org/"], // BNB Chain
  8453: ["https://mainnet.base.org"], // Base — public-first so balance reads
  //                                     never wait on keyed providers
  5042: ["https://5042.rpc.thirdweb.com"], // Arc mainnet (native gas: USDC)
  5042002: ["https://rpc.testnet.arc.network"], // Arc testnet
  1672: ["https://rpc.pharos.xyz"], // Pharos
  1625: ["https://rpc.gravity.xyz"], // Gravity
  4663: ["https://rpc.mainnet.chain.robinhood.com"], // Robinhood
  4326: ["https://mainnet.megaeth.com/rpc"], // MegaETH
  4217: ["https://rpc.tempo.xyz"], // Tempo
  5031: ["https://api.infra.mainnet.somnia.network"], // Somnia
  16661: ["https://evmrpc.0g.ai"], // 0G
  9745: ["https://rpc.plasma.to"], // Plasma
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

/**
 * RPC URL for TRANSACTIONS (send/swap/bridge/allowance) by registry key.
 * Prefers a private endpoint (Alchemy/Infura/…); custom user chains use their
 * own URL; public nodes are only a last resort for chains without private
 * coverage. Public endpoints stay reserved for balance reads on Home.
 */
export function getEvmRpcUrlForNetwork(networkName: string): string {
  const config = resolveNetwork(networkName);
  if (config?.chainId) {
    const priv = getTransactionRpc(config.chainId);
    if (priv) return priv;
  }
  if (config?.rpcUrl) return config.rpcUrl; // user-added custom chain
  if (config?.chainId) return getPrimaryRpc(config.chainId);
  return getRpcEndpoint(1);
}

/** Transaction RPC by chainId (private-first) — checks user-added networks too. */
export function getEvmRpcUrlForChain(chainId: number): string {
  const priv = getTransactionRpc(chainId);
  if (priv) return priv;
  const config = resolveNetworkByChainId(chainId);
  return config?.rpcUrl ?? getPrimaryRpc(chainId);
}

/**
 * Returns the first REACHABLE transaction RPC for a chain (private-first, then
 * public fallback). Guards against a private endpoint that doesn't actually
 * serve the chain (e.g. an ETH-only Alchemy key on Polygon) so sends never fail
 * with a raw 401. Each candidate is probed once with a 3s timeout.
 */
export async function getWorkingTransactionRpc(
  chainId: number,
): Promise<string> {
  const custom = resolveNetworkByChainId(chainId)?.rpcUrl;
  const urls = getTransactionRpcList(chainId);
  if (custom && !urls.includes(custom)) urls.push(custom);
  for (const url of urls) {
    try {
      const p = new ethers.JsonRpcProvider(url, chainId, {
        staticNetwork: true,
      });
      await Promise.race([
        p.getBlockNumber(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
      ]);
      return url;
    } catch {
      /* try next */
    }
  }
  return urls[0] || custom || getPrimaryRpc(chainId);
}

export function getEvmProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getEvmRpcUrl());
}

export function getEvmProviderForNetwork(
  networkName: string,
): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getEvmRpcUrlForNetwork(networkName));
}

export function getEvmProviderForChain(
  chainId: number,
): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getEvmRpcUrlForChain(chainId));
}

/**
 * Read-only provider using a PUBLIC RPC. For reads that don't need the private
 * pool — tx-status polling, receipt checks — so those don't burn Infura/Alchemy
 * quota. Falls back to the transaction RPC if no public endpoint exists.
 */
export function getEvmReadProviderForNetwork(
  networkName: string,
): ethers.JsonRpcProvider {
  const config = resolveNetwork(networkName);
  const chainId = config?.chainId ?? 1;
  const publicUrl = getBalanceRpcList(chainId)[0] || getEvmRpcUrlForNetwork(networkName);
  return new ethers.JsonRpcProvider(publicUrl);
}

/**
 * Try op against every RPC for chainId in order.
 * On failure, advances to the next URL. Throws if all RPCs fail.
 */
export async function withEvmFallbackForChain<T>(
  chainId: number,
  op: (provider: ethers.JsonRpcProvider) => Promise<T>,
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
export async function withEvmFallback<T>(
  op: (provider: ethers.JsonRpcProvider) => Promise<T>,
): Promise<T> {
  return withEvmFallbackForChain(1, op);
}

export async function withEvmFallbackForNetwork<T>(
  networkName: string,
  op: (provider: ethers.JsonRpcProvider) => Promise<T>,
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
  const [intStr, fracStr = ""] = gwei.split(".");
  const frac9 = fracStr.padEnd(9, "0").slice(0, 9);
  return BigInt(intStr || "0") * 1_000_000_000n + BigInt(frac9);
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
  networkName?: string,
): Promise<GasOptions> {
  const isEthMainnet = !networkName || networkName === "ethereum";
  const config = resolveNetwork(networkName || "ethereum");
  const chainId = config?.chainId ?? 1;
  const feeProvider = networkName
    ? getEvmProviderForNetwork(networkName)
    : getEvmProvider();

  const simProviders: ethers.JsonRpcProvider[] = [];

  if (isEthMainnet && ALCHEMY_ETH_RPC) {
    try {
      simProviders.push(new ethers.JsonRpcProvider(ALCHEMY_ETH_RPC));
    } catch {
      /* ignore */
    }
  }

  if (config?.rpcUrl) {
    try {
      simProviders.push(new ethers.JsonRpcProvider(config.rpcUrl));
    } catch {
      /* ignore */
    }
  }

  const rpcUrls = getRpcList(chainId) || [];
  for (const url of rpcUrls) {
    if (url && url !== ALCHEMY_ETH_RPC && url !== config?.rpcUrl) {
      try {
        simProviders.push(new ethers.JsonRpcProvider(url));
      } catch {
        /* ignore */
      }
    }
  }

  if (simProviders.length === 0) {
    simProviders.push(feeProvider);
  }

  let gasLimit = fallbackLimit;
  for (const provider of simProviders) {
    try {
      const est = await provider.estimateGas(tx);
      gasLimit = (est * 120n) / 100n; // Apply 20% buffer
      break;
    } catch (err) {
      console.warn(
        `[fetchGasOptions] estimateGas failed on provider, trying next:`,
        err,
      );
    }
  }

  let feeData: ethers.FeeData | null = null;
  for (const provider of simProviders) {
    try {
      const fd = await provider.getFeeData();
      if (fd) {
        feeData = fd;
        break;
      }
    } catch (err) {
      console.warn(
        `[fetchGasOptions] getFeeData failed on provider, trying next:`,
        err,
      );
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
      slow: { maxFeePerGas: slow, maxPriorityFeePerGas: tip(slow) },
      normal: { maxFeePerGas: normal, maxPriorityFeePerGas: tip(normal) },
      fast: { maxFeePerGas: fast, maxPriorityFeePerGas: tip(fast) },
    };
  } else {
    const base = 20_000_000_000n;
    const tip = 2_000_000_000n;
    return {
      gasLimit,
      slow: { maxFeePerGas: base, maxPriorityFeePerGas: tip },
      normal: {
        maxFeePerGas: (base * 11n) / 10n,
        maxPriorityFeePerGas: tip * 2n,
      },
      fast: {
        maxFeePerGas: (base * 13n) / 10n,
        maxPriorityFeePerGas: tip * 3n,
      },
    };
  }
}
