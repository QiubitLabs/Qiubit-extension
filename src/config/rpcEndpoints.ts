import {
  getRpcListFromPool,
  getPrivateRpcListFromPool,
} from "../services/rpc/rpcPool";

/**
 * RPC Endpoint Configuration
 *
 * Each chain has an ordered list of RPC URLs (index 0 = primary, rest = fallbacks).
 *
 * Ethereum mainnet uses private RPCs in priority order:
 *   Infura → dRPC → zan.top → Chainstack → public nodes
 *
 * ALCHEMY_ETH_RPC is exported separately and used ONLY for:
 *   - estimateGas simulation (evmProvider.fetchGasOptions on Ethereum mainnet)
 * Transaction history now uses eth_getLogs via getRpcList — no Alchemy required.
 * Do NOT add it to the general RPC list — preserve its rate limit for those features.
 *
 * For user-added custom chains, the RPC URL is supplied by the user at add-time
 * and stored via UserNetworkService. getRpcList() falls back to ETH mainnet
 * for unknown chainIds — callers should use resolveNetworkByChainId() first.
 *
 * To add a new built-in chain: push its chainId → string[] entry below.
 * Custom chains never need code changes here.
 */

const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);

const _infura = (e.VITE_ETH_RPC_INFURA as string | undefined) || "";
const _drpc = (e.VITE_ETH_RPC_DRPC as string | undefined) || "";
const _zan = (e.VITE_ETH_RPC_ZAN as string | undefined) || "";
const _chainstack = (e.VITE_ETH_RPC_CHAINSTACK as string | undefined) || "";

export const ALCHEMY_ETH_RPC: string =
  (e.VITE_ETH_RPC_URL as string | undefined) ||
  (e.VITE_FALLBACK_ETH_RPC_URL as string | undefined) ||
  "";

const _ethMainnet: string[] = [
  _infura,
  _drpc,
  _zan,
  _chainstack,
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
].filter(Boolean);

/**
 * RPC list per chainId (decimal).
 * Index 0 = primary, rest = fallbacks tried in order on failure.
 */
export const RPC_ENDPOINTS: Record<number, string[]> = {
  1: _ethMainnet,

  11155111: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc.sepolia.org",
  ],

  56: [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc-rpc.publicnode.com",
    "https://1rpc.io/bnb",
  ],

  137: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://1rpc.io/matic",
    "https://polygon.llamarpc.com",
  ],

  8453: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://1rpc.io/base",
  ],

  42161: [
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum-one-rpc.publicnode.com",
    "https://1rpc.io/arb",
  ],

  10: [
    "https://mainnet.optimism.io",
    "https://optimism-rpc.publicnode.com",
    "https://1rpc.io/op",
  ],

  43114: [
    "https://api.avax.network/ext/bc/C/rpc",
    "https://avalanche-c-chain-rpc.publicnode.com",
    "https://1rpc.io/avax/c",
  ],

  143: [
    "https://rpc.monad.xyz",
    "https://rpc1.monad.xyz",
    "https://rpc2.monad.xyz",
    "https://rpc3.monad.xyz",
    "https://rpc-mainnet.monadinfra.com",
  ],

  999: ["https://rpc.hyperliquid.xyz/evm"],
};

/** Returns all RPC URLs for a chain (primary + fallbacks). */
export function getRpcList(chainId: number): string[] {
  return getRpcListFromPool(chainId);
}

/** Returns the primary (first) RPC URL for a chain. */
export function getPrimaryRpc(chainId: number): string {
  return getRpcList(chainId)[0] ?? "";
}

/**
 * Ordered RPC list for signing/broadcasting transactions: private endpoints
 * first (Alchemy/Infura/…), then the public pool as fallback. Public is kept as
 * a fallback because a private endpoint may not actually cover a chain (e.g. an
 * Ethereum-only Alchemy key can't serve Polygon), so transactions must still
 * work rather than fail outright. Callers should pick the first reachable one.
 */
export function getTransactionRpcList(chainId: number): string[] {
  const priv = getPrivateRpcListFromPool(chainId);
  const pub = getRpcListFromPool(chainId);
  return [...priv, ...pub.filter((u) => u && !priv.includes(u))];
}

/** Primary transaction RPC (private-first). */
export function getTransactionRpc(chainId: number): string {
  return getTransactionRpcList(chainId)[0] ?? "";
}

/**
 * @deprecated Use getPrimaryRpc(chainId) instead.
 */
export function getRpcEndpoint(chainId: number): string {
  return getPrimaryRpc(chainId);
}
