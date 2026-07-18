/**
 * Native gas-token classification.
 *
 * Every chain pays gas in SOME token, but that token behaves differently for
 * pricing and decimals. This module is the single source of truth for "what
 * kind of native does this chain use", derived from NETWORK_REGISTRY so it can
 * never drift out of sync with the chain list.
 *
 * Three kinds:
 *
 *   "eth"        — native gas is ETH (shared ETH price feed).
 *                  Ethereum, Base, Arbitrum, Optimism, Robinhood, MegaETH,
 *                  Sepolia…
 *
 *   "stablecoin" — native gas is a USD-pegged stablecoin. These chains have NO
 *                  separate coin — the stablecoin IS the gas token, and it uses
 *                  a DUAL-DECIMAL model (18 decimals for eth_getBalance/msg.value
 *                  and gas, 6 decimals for the ERC-20 interface).
 *                    • Arc   → USDC   (chainId 5042 / testnet 5042002)
 *                    • Tempo → PathUSD/PUSD (chainId 4217)
 *
 *   "own"        — the chain has its own native coin with its own price.
 *                  BNB, POL, MON, HYPE, PROS, G, SOMI, 0G, XPL, SOL, SUI, BTC,
 *                  OCT…
 */

import { NETWORK_REGISTRY } from "./registry";

export type NativeGasKind = "eth" | "stablecoin" | "own";

/** Symbols that mean "USD stablecoin used as native gas". */
const STABLECOIN_GAS_SYMBOLS = new Set<string>([
  "USDC",
  "USDT",
  "USDT0",
  "PUSD",
  "PATHUSD",
  "USDE",
  "USDS",
  "DAI",
  "EURC",
  "USD",
]);

/** Build chainId → NativeGasKind once from the registry. */
const KIND_BY_CHAIN_ID: Record<number, NativeGasKind> = (() => {
  const map: Record<number, NativeGasKind> = {};
  for (const cfg of Object.values(NETWORK_REGISTRY)) {
    if (cfg.chainId == null) continue;
    const sym = cfg.nativeToken?.symbol?.toUpperCase() ?? "";
    map[cfg.chainId] = STABLECOIN_GAS_SYMBOLS.has(sym)
      ? "stablecoin"
      : sym === "ETH"
        ? "eth"
        : "own";
  }
  return map;
})();

/** Classify a chain's native gas token. Unknown chains default to "own". */
export function nativeGasKind(chainId?: number | null): NativeGasKind {
  if (chainId == null) return "own";
  return KIND_BY_CHAIN_ID[chainId] ?? "own";
}

/**
 * True when the native gas token is a USD stablecoin (Arc, Tempo…). Callers use
 * this for the dual-decimals model and to treat the native as a $1 asset.
 */
export function isStablecoinGasChain(chainId?: number | null): boolean {
  return nativeGasKind(chainId) === "stablecoin";
}

/**
 * Chains registered while their MAINNET is not officially live. Adding a
 * chainId here disables its balance fetch (useWalletData filters it out of
 * allSupportedChainIds) while its 0-balance native row stays visible on Home.
 *
 * Currently EMPTY by design: every chain fetches normally so nothing needs a
 * code change on launch day. Pre-launch garbage state is handled by
 * sanitizeNativeBalance() instead, which rejects impossible balances (e.g.
 * Tempo reporting 4.2e57 PUSD). Re-add a chainId here only if a pre-launch
 * chain reports PLAUSIBLE-looking phantom balances that the sanity guard
 * can't catch.
 */
export const PRE_LAUNCH_CHAIN_IDS = new Set<number>([]);

export function isPreLaunchChain(chainId?: number | null): boolean {
  return chainId != null && PRE_LAUNCH_CHAIN_IDS.has(chainId);
}
