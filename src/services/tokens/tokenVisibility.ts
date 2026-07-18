/**
 * tokenVisibility — single source of truth for which tokens each surface
 * shows. Home (main vs "low assets" split), Send (OCT-fallback rules) and
 * Swap (registry-only chains) all pull their rules from here so the logic
 * can never drift apart between screens again.
 *
 * EXPORTS:
 *   - LOW_ASSET_USD_THRESHOLD (const)
 *   - buildSendTokenList(parentTokens, octraBalance, network)
 *   - filterSwapEligibleTokens(tokens)
 *   - splitMainAndLowAssets(tokens, opts)
 *   - isLikelySpamToken(token)
 */

import type { Token } from "../../types";
import { NETWORK_REGISTRY } from "../../constants/networks/registry";

/** Holdings worth at least this (USD) always show in the main token list;
 *  smaller held balances collapse into the "low assets" section. */
export const LOW_ASSET_USD_THRESHOLD = 0.3;

/** Sentinel chainId used for Octra-native (OCT / OCS-01) tokens. */
export const OCTRA_SENTINEL_CHAIN_ID = 9048201;

/**
 * Token list for the Send picker. The hardcoded OCT fallback row belongs ONLY
 * to networks that actually include Octra ("octra" / "all") — every other
 * network (EVM, Solana, Sui, Bitcoin, user-added customs) must never show it,
 * even though none of their tokens carry the Octra-native `isNative` flag.
 */
export function buildSendTokenList(
  parentTokens: Token[] | undefined,
  octraBalance: number,
  network: string,
): Token[] {
  const includesOctra = network === "all" || network === "octra";
  const octNative: Token = {
    symbol: "OCT",
    name: "Octra",
    balance: octraBalance,
    isNative: true,
    logoType: "native",
  };
  if (!parentTokens || parentTokens.length === 0) {
    return includesOctra ? [octNative] : [];
  }
  const updated = parentTokens.map((t) =>
    t.isNative ? { ...t, balance: octraBalance } : t,
  );
  if (!includesOctra) return updated.filter((t) => !t.isNative);
  return updated.some((t) => t.isNative) ? updated : [octNative, ...updated];
}

/**
 * Swap only supports registry chains (LI.FI has no routes on user-added
 * custom networks), so drop custom-network tokens from the swap selector.
 */
export function filterSwapEligibleTokens(tokens: Token[]): Token[] {
  const registeredChainIds = new Set<number>(
    Object.values(NETWORK_REGISTRY)
      .map((n) => n.chainId)
      .filter((id): id is number => id != null),
  );
  registeredChainIds.add(OCTRA_SENTINEL_CHAIN_ID); // bridge tab
  return (tokens ?? []).filter(
    (t) => !t.chainId || registeredChainIds.has(t.chainId),
  );
}

export type PricedToken = Token & { price: number; change24h: number };

export interface SplitOptions {
  /** Native symbol of the active network (any VM). */
  nativeSymbol: string;
  /** Testnet / custom networks have no market prices — show everything. */
  noPriceNetwork: boolean;
  /** When true, zero-balance default tokens fold into "low assets" too. */
  hideZeroBalances?: boolean;
}

/**
 * Home list split. Main list: natives, Octra's own tokens (wOCT/OCS-01),
 * testnets (sorted last by the caller), zero-balance defaults (unless the
 * user opted to hide them), and any holding worth at least the threshold.
 * "Low assets" collapses dust — held balances worth less than the threshold,
 * plus unpriced tokens.
 */
export function splitMainAndLowAssets<T extends PricedToken>(
  tokens: T[],
  { nativeSymbol, noPriceNetwork, hideZeroBalances }: SplitOptions,
): { mainTokens: T[]; lowValueTokens: T[] } {
  const main: T[] = [];
  const low: T[] = [];

  for (const t of tokens) {
    const sym = (t.symbol || "").toUpperCase();
    const isNativeToken =
      t.isNative ||
      !t.contractAddress ||
      sym === "OCT" ||
      t.symbol === "ETH" ||
      t.symbol === nativeSymbol;
    const hasPrice = t.price && t.price > 0;
    const bal =
      typeof t.balance === "string" ? parseFloat(t.balance) : t.balance || 0;
    const usdValue = (t.price || 0) * (bal || 0);

    if (
      noPriceNetwork ||
      isNativeToken ||
      t.isOCS01 ||
      t.isTestnet ||
      sym === "WOCT" ||
      usdValue >= LOW_ASSET_USD_THRESHOLD ||
      (bal === 0 && hasPrice && !hideZeroBalances)
    ) {
      main.push(t);
    } else {
      low.push(t);
    }
  }

  return { mainTokens: main, lowValueTokens: low };
}

// ── Balance sanity ──────────────────────────────────────────────────────────

/**
 * No real native-coin holding exceeds a trillion units (whole-coin supplies
 * top out around 1e11 — even USDT). Pre-launch/test chains, however, mint
 * absurd joke balances (Tempo reported 4.2e57 PUSD). Values past this bound
 * are chain-side garbage, not funds.
 */
const MAX_PLAUSIBLE_NATIVE_BALANCE = 1e12;

/**
 * Clamp a formatted native balance to "0" when the chain reports a value that
 * cannot be real. Applies to NATIVE coins only — ERC-20s like SHIB can
 * legitimately exceed this.
 */
export function sanitizeNativeBalance(formatted: string): string {
  const n = parseFloat(formatted);
  if (!Number.isFinite(n) || n < 0) return "0";
  return n > MAX_PLAUSIBLE_NATIVE_BALANCE ? "0" : formatted;
}

// ── Spam / scam heuristics for auto-discovered tokens ──────────────────────

/** Airdrop-scam wording commonly embedded in token names/symbols. */
const SPAM_WORDS =
  /\b(claim|airdrop|reward|voucher|giveaway|bonus|redeem|prize)\b/i;
/** URLs baked into a name are the classic "visit site to claim" scam. */
const URL_LIKE = /(https?:\/\/|www\.|\.(com|io|xyz|net|org|app|site|fi)\b\/?)/i;

/**
 * True when a discovered token looks like airdrop spam. Heuristics only —
 * applied to AUTO-DISCOVERED tokens, never to defaults or tokens the user
 * added manually (a false positive there would hide a real asset).
 */
export function isLikelySpamToken(t: {
  symbol?: string;
  name?: string;
}): boolean {
  const symbol = (t.symbol || "").trim();
  const name = (t.name || "").trim();
  if (URL_LIKE.test(symbol) || URL_LIKE.test(name)) return true;
  if (SPAM_WORDS.test(symbol) || SPAM_WORDS.test(name)) return true;
  // Real tickers are short; 12+ chars is almost always a spam banner.
  if (symbol.length > 12) return true;
  // Non-ASCII "decoration" (emoji, box-drawing) in the ticker.
  if (/[^\x20-\x7E]/.test(symbol)) return true;
  return false;
}
