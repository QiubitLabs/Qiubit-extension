/**
 * MoralisEvmService — indexer-backed EVM native balance reads.
 *
 * Moralis' REST balance endpoint is per-chain (the `chain` param takes a single
 * value, not an array), so this is not a single-call-all-chains aggregator.
 *
 * Because the API key is shared by every extension install, this is used only
 * as a **fallback** when the public RPC pool (which scales per-user IP) fails —
 * never as the primary path — so a large user base can't exhaust one shared
 * Moralis quota. Callers treat a `null` return as "unavailable" and surface the
 * original RPC error.
 */

import { ethers } from "ethers";

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

/** Decimal chainId → Moralis hex chain id. Only chains Moralis supports. */
const MORALIS_CHAIN_HEX: Record<number, string> = {
  1: "0x1", // Ethereum
  56: "0x38", // BSC
  137: "0x89", // Polygon
  8453: "0x2105", // Base
  42161: "0xa4b1", // Arbitrum
  11155111: "0xaa36a7", // Sepolia
};

/** True when Moralis can serve balances for this chain and a key is present. */
export function moralisSupportsChain(chainId: number): boolean {
  return (
    !!MORALIS_CHAIN_HEX[chainId] &&
    !!(import.meta.env.VITE_MORALIS_API_KEY as string)
  );
}

/**
 * Native balance (in whole units, e.g. ETH) for an EVM address on one chain.
 * Returns null on missing key, unsupported chain, or any request failure so
 * the caller can fall back to a direct RPC read.
 */
export async function fetchNativeBalanceMoralis(
  address: string,
  chainId: number,
): Promise<string | null> {
  const key = (import.meta.env.VITE_MORALIS_API_KEY as string) || "";
  const chain = MORALIS_CHAIN_HEX[chainId];
  if (!key || !chain) return null;

  try {
    const resp = await fetch(
      `${MORALIS_BASE}/${address}/balance?chain=${chain}`,
      { headers: { "X-Api-Key": key, accept: "application/json" } },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && typeof data.balance === "string") {
      return parseFloat(
        parseFloat(ethers.formatEther(data.balance)).toFixed(8),
      ).toString();
    }
    return null;
  } catch {
    return null;
  }
}
