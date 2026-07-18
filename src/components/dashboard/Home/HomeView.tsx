import { useState, useEffect, useMemo } from "react";
import { PlusIcon, ChevronRightIcon } from "../../shared/Icons";
import { FeedbackLottie } from "../../shared/FeedbackLottie";
import { useDisplayCurrency } from "../../../hooks/useDisplayCurrency";
import { SUPPORTED_CURRENCIES, setDisplayCurrency } from "../../../services/network/CurrencyService";
import "./HomeView.css";
import { TokenItem } from "../TokenItem";
import {
  getMultipleTokenPrices,
  getMultiplePricesByContractsMultiChain,
  getCachedPrices,
  formatUsd,
} from "../../../services/network/PriceService";
import { AddTokenModal } from "./AddTokenModal";
import "./AddTokenModal.css";
import { Wallet, Token } from "../../../types";
import { filterTokensByNetwork } from "../../../constants/networks/registry";
import { resolveNetwork } from "../../../services/network/NetworkResolver";
import { splitMainAndLowAssets } from "../../../services/tokens/tokenVisibility";

interface HomeViewProps {
  wallet: Wallet;
  balance: number;
  transactions: any[];
  onCopyAddress: () => void;
  copied: boolean;

  onTokenClick: (token: Token) => void;
  isBalanceHidden: boolean;
  onToggleBalance: () => void;
  allTokens: Token[];
  isLoadingTokens: boolean;
  onRefresh: () => void;
  networkSetting?: string;
  /** Settings toggle: fold zero-balance default tokens into "low assets". */
  hideZeroBalances?: boolean;
}

export function HomeView({
  wallet,
  balance,
  onTokenClick,
  isBalanceHidden,
  onToggleBalance,
  allTokens,
  isLoadingTokens,
  onRefresh,
  networkSetting = "all",
  hideZeroBalances = false,
}: HomeViewProps) {
  const { currency } = useDisplayCurrency();
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState("crypto");
  const [showAddTokenModal, setShowAddTokenModal] = useState(false);
  const [isLowValueExpanded, setIsLowValueExpanded] = useState(false);

  const displayBalance = balance;

  const [totalUsdValue, setTotalUsdValue] = useState(0);
  // Bumps to force fiat strings to re-render after a currency change
  const [currencyTick, setCurrencyTick] = useState(0);
  useEffect(() => {
    const handler = () => setCurrencyTick((t) => t + 1);
    window.addEventListener("qiubit:currency-changed", handler);
    return () => window.removeEventListener("qiubit:currency-changed", handler);
  }, []);

  const [priceMap, setPriceMap] = useState<
    Map<string, { price: number; change24h: number }>
  >(() => getCachedPrices());

  useEffect(() => {
    let cancelled = false;
    const fetchPrices = async () => {
      const nonTestnetTokens = allTokens.filter((t) => !t.isTestnet);
      const symbols = Array.from(
        new Set(nonTestnetTokens.map((t) => t.symbol)),
      );
      if (symbols.length === 0) return;
      const prices = await getMultipleTokenPrices(symbols);

      const noPriceContractTokens = nonTestnetTokens.filter(
        (t) =>
          t.contractAddress &&
          t.contractAddress !== "0x0000000000000000000000000000000000000000" &&
          !prices.has(t.symbol),
      );
      if (noPriceContractTokens.length > 0) {
        const contractPrices = await getMultiplePricesByContractsMultiChain(
          noPriceContractTokens.map((t) => ({
            symbol: t.symbol,
            contractAddress: t.contractAddress!,
            chainId: t.chainId ?? 1,
          })),
        );
        contractPrices.forEach((v, k) => prices.set(k, v));
      }

      if (cancelled) return;
      setPriceMap(prices);
    };
    fetchPrices();
    return () => {
      cancelled = true;
    };
  }, [allTokens]);

  const tokens = useMemo(() => {
    // resolveNetwork (not NETWORK_REGISTRY) so custom user-added chains
    // (user_<chainId>) resolve too — otherwise their native token fell back to
    // OCT and the chain's real native never showed on Home.
    const netConfig = resolveNetwork(networkSetting);
    const isEvm = netConfig?.isEVM === true;
    // Detect by addressType (not a hardcoded id) so custom Solana-VM / Sui-VM
    // networks (id `user_<chainId>`) get their native token too.
    const isSolana = netConfig?.addressType === "solana";
    const isSui = netConfig?.addressType === "sui";
    const isBitcoin = netConfig?.addressType === "bitcoin";

    const nativeToken: Token =
      isEvm && netConfig.nativeToken
        ? {
            symbol: netConfig.nativeToken.symbol,
            name: netConfig.nativeToken.name,
            balance:
              allTokens?.find(
                (t) =>
                  t.symbol === netConfig.nativeToken!.symbol &&
                  t.isEVM &&
                  t.chainId === netConfig.chainId,
              )?.balance || "0.0000",
            isNative: false,
            isEVM: true,
            chainId: netConfig.chainId!,
            isTestnet: netConfig.isTestnet,
            logoUrl: netConfig.nativeToken.logoUrl,
            decimals: netConfig.nativeToken.decimals,
          }
        : isSolana && netConfig?.nativeToken
          ? {
              symbol: netConfig.nativeToken.symbol,
              name: netConfig.nativeToken.name,
              balance:
                allTokens?.find(
                  (t) =>
                    t.symbol === netConfig.nativeToken!.symbol &&
                    t.isSolana &&
                    t.chainId === netConfig.chainId,
                )?.balance || "0.0000",
              isNative: false,
              isSolana: true,
              chainId: netConfig.chainId!,
              isTestnet: netConfig.isTestnet,
              logoUrl: netConfig.nativeToken.logoUrl,
              decimals: netConfig.nativeToken.decimals,
            }
          : isSui && netConfig?.nativeToken
            ? {
                symbol: netConfig.nativeToken.symbol,
                name: netConfig.nativeToken.name,
                balance:
                  allTokens?.find(
                    (t) =>
                      t.symbol === netConfig.nativeToken!.symbol &&
                      t.isSui &&
                      t.chainId === netConfig.chainId,
                  )?.balance || "0.0000",
                isNative: false,
                isSui: true,
                chainId: netConfig.chainId!,
                isTestnet: netConfig.isTestnet,
                logoUrl: netConfig.nativeToken.logoUrl,
                decimals: netConfig.nativeToken.decimals,
              }
            : isBitcoin && netConfig?.nativeToken
              ? {
                  symbol: netConfig.nativeToken.symbol,
                  name: netConfig.nativeToken.name,
                  balance:
                    allTokens?.find(
                      (t) =>
                        t.symbol === netConfig.nativeToken!.symbol &&
                        t.isBitcoin &&
                        t.chainId === netConfig.chainId,
                    )?.balance || "0.0000",
                  isNative: false,
                  isBitcoin: true,
                  chainId: netConfig.chainId!,
                  isTestnet: netConfig.isTestnet,
                  logoUrl: netConfig.nativeToken.logoUrl,
                  decimals: netConfig.nativeToken.decimals,
                }
              : {
                  symbol: "OCT",
                  name: "Octra",
                  balance: displayBalance,
                  isNative: true,
                  logoType: "native",
                };

    if (!allTokens || allTokens.length === 0) {
      return [nativeToken];
    }

    const mappedTokens = allTokens.map((token: Token) =>
      token.isNative ? { ...token, balance: displayBalance } : token,
    );

    if (networkSetting === "all") {
      const hasNative = mappedTokens.some((t: Token) => t.isNative);
      const octNativeToken: Token = {
        symbol: "OCT",
        name: "Octra",
        balance: displayBalance,
        isNative: true,
        logoType: "native",
      };
      return hasNative ? mappedTokens : [octNativeToken, ...mappedTokens];
    }

    let filtered = filterTokensByNetwork(
      mappedTokens,
      networkSetting,
    ) as Token[];

    // Hard guard: OCT (the Octra-native token, isNative===true) must only ever
    // appear on the Octra network or the "all" view — never on EVM / Solana /
    // Sui / testnet / custom networks. Chain natives (ETH, SOL, SUI, custom) are
    // isNative:false, so they are untouched.
    if (networkSetting !== "octra") {
      filtered = filtered.filter(
        (t) => !(t.isNative === true || (t.symbol || "").toUpperCase() === "OCT"),
      );
    }

    // Dedupe by asset identity (vm + symbol + contract). Stale snapshot entries
    // or double-injection can yield the same asset twice; entries carrying a
    // chainId win over chainId-less twins, and distinct chainIds (mainnet vs
    // testnet) stay separate assets.
    {
      const groups = new Map<string, Token[]>();
      for (const t of filtered) {
        const vm = t.isSolana
          ? "sol"
          : t.isSui
            ? "sui"
            : t.isBitcoin
              ? "btc"
              : t.isEVM
                ? "evm"
                : "octra";
        const key = `${vm}:${(t.symbol || "").toUpperCase()}:${(t.contractAddress || "").toLowerCase()}`;
        const arr = groups.get(key);
        if (arr) arr.push(t);
        else groups.set(key, [t]);
      }
      const deduped: Token[] = [];
      for (const list of groups.values()) {
        const withChain = list.filter((t) => t.chainId != null);
        if (withChain.length === 0) {
          deduped.push(list[0]);
          continue;
        }
        const byChain = new Map<number, Token>();
        for (const t of withChain) byChain.set(t.chainId!, t);
        deduped.push(...byChain.values());
      }
      filtered = deduped;
    }

    if (isEvm && netConfig?.nativeToken) {
      const hasEvmNative = filtered.some(
        (t) => t.symbol === netConfig.nativeToken!.symbol && !t.contractAddress,
      );
      if (!hasEvmNative) {
        return [nativeToken, ...filtered];
      }
    } else if (isSolana && netConfig?.nativeToken) {
      const hasSolNative = filtered.some(
        (t) => t.symbol === netConfig.nativeToken!.symbol && t.isSolana,
      );
      if (!hasSolNative) {
        return [nativeToken, ...filtered];
      }
    } else if (isSui && netConfig?.nativeToken) {
      const hasSuiNative = filtered.some(
        (t) => t.symbol === netConfig.nativeToken!.symbol && t.isSui,
      );
      if (!hasSuiNative) {
        return [nativeToken, ...filtered];
      }
    } else if (isBitcoin && netConfig?.nativeToken) {
      const hasBtcNative = filtered.some(
        (t) => t.symbol === netConfig.nativeToken!.symbol && t.isBitcoin,
      );
      if (!hasBtcNative) {
        return [nativeToken, ...filtered];
      }
    }

    return filtered;
  }, [allTokens, displayBalance, networkSetting]);

  useEffect(() => {
    const filtered = filterTokensByNetwork(tokens, networkSetting, true);
    const total = filtered.reduce((sum, token) => {
      const entry = token.isTestnet
        ? null
        : (priceMap.get(token.symbol) ??
          priceMap.get(token.symbol.toUpperCase()));
      const price = entry?.price ?? 0;
      const bal =
        typeof token.balance === "string"
          ? parseFloat(token.balance)
          : token.balance || 0;
      return sum + bal * price;
    }, 0);
    setTotalUsdValue(total);
  }, [tokens, priceMap, networkSetting]);

  const displayUsdValue = useMemo(
    () => formatUsd(totalUsdValue),
    [totalUsdValue, currencyTick],
  );

  const { portfolioChangeUsd, portfolioChangePct } = useMemo(() => {
    const filtered = filterTokensByNetwork(tokens, networkSetting, true);
    let changeUsd = 0;
    for (const token of filtered) {
      const entry = token.isTestnet
        ? null
        : (priceMap.get(token.symbol) ??
          priceMap.get(token.symbol.toUpperCase()));
      if (!entry || !entry.change24h) continue;
      const bal =
        typeof token.balance === "string"
          ? parseFloat(token.balance)
          : token.balance || 0;
      changeUsd += bal * entry.price * (entry.change24h / 100);
    }
    const prevUsd = totalUsdValue - changeUsd;
    const pct = prevUsd > 0 ? (changeUsd / prevUsd) * 100 : 0;
    return { portfolioChangeUsd: changeUsd, portfolioChangePct: pct };
  }, [tokens, priceMap, totalUsdValue, networkSetting]);

  const sortedTokensWithPrices = useMemo(() => {
    const mapped = tokens
      .map((t) => {
        const entry = t.isTestnet
          ? null
          : (priceMap.get(t.symbol) ?? priceMap.get(t.symbol.toUpperCase()));
        return {
          ...t,
          price: entry?.price || 0,
          change24h: entry?.change24h ?? 0,
        };
      });
    // No symbol whitelist here anymore: everything in `tokens` is already
    // curated (minimal defaults, chain natives, user-added, or discovered
    // with a balance). A hardcoded "popular symbols" list silently hid the
    // native coins of newly registered chains (Pharos/Tempo/Gravity/…).

    // Octra's own tokens are pinned to the top regardless of fiat value:
    // OCT (native) first, then wOCT (wrapped), then everything else by USD
    // desc. Testnet tokens always sink to the very bottom (no real value),
    // like MetaMask/OKX — but stay in the main list, never in "low assets".
    const rank = (t: Token & { price?: number }): number => {
      if (t.isTestnet) return 3;
      const sym = (t.symbol || "").toUpperCase();
      if (t.isNative || sym === "OCT") return 0;
      if (sym === "WOCT") return 1;
      return 2;
    };
    return mapped.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const balA =
        typeof a.balance === "string" ? parseFloat(a.balance) : a.balance || 0;
      const balB =
        typeof b.balance === "string" ? parseFloat(b.balance) : b.balance || 0;
      const usdA = a.price * balA;
      const usdB = b.price * balB;
      return usdB - usdA;
    });
  }, [tokens, priceMap]);

  const { mainTokens, lowValueTokens } = useMemo(() => {
    const netConfig = resolveNetwork(networkSetting);
    // Native symbol of the active network, any VM (EVM/Solana/Sui/Bitcoin/
    // custom) — not just EVM, otherwise SUI/SOL natives fell into "low assets".
    const nativeSymbol = netConfig?.nativeToken?.symbol ?? "OCT";

    // Testnets and custom chains have no market prices at all, so the
    // price-based "low assets" split is meaningless there — show everything.
    const noPriceNetwork =
      netConfig?.isTestnet === true || networkSetting.startsWith("user_");

    return splitMainAndLowAssets(sortedTokensWithPrices, {
      nativeSymbol,
      noPriceNetwork,
      hideZeroBalances,
    });
  }, [sortedTokensWithPrices, networkSetting, hideZeroBalances]);

  return (
    <>
      {/* Balance Card */}
      <div
        className="balance-card"
        onClick={onToggleBalance}
        style={{ cursor: "pointer" }}
      >
        {/* Ambient textures and reflections */}
        <div className="balance-card-texture" />
        <div className="balance-card-reflection" />

        {/* Card Inner Content */}
        <div className="balance-card-content">
          {/* Top Row: Value title & Currency Label */}
          <div className="balance-card-top">
            <div className="balance-card-label-container" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="balance-card-label">Est. Total Value</span>
              {isBalanceHidden ? (
                <svg className="balance-eye-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                <svg className="balance-eye-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </div>
            
            {/* Clickable Currency Selector */}
            <div
              className="balance-card-currency"
              onClick={(e) => {
                e.stopPropagation();
                setShowCurrencyDropdown((prev) => !prev);
              }}
            >
              <span>{currency}</span>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>

          {/* Middle Row: Balance */}
          <div className="balance-card-middle">
            {isLoadingTokens && balance === 0 && !allTokens?.length ? (
              <div
                className="skeleton"
                style={{ width: "140px", height: "36px", borderRadius: "8px", background: "rgba(255, 255, 255, 0.1)" }}
              />
            ) : isBalanceHidden ? (
              <span className="balance-card-hidden">••••••</span>
            ) : (
              <h2 className="balance-card-amount">{displayUsdValue}</h2>
            )}
          </div>

          {/* Bottom Row: Trend & Owner Name */}
          <div className="balance-card-bottom">
            <div className="balance-card-info-group">
              {/* Trend Indicator */}
              {isLoadingTokens && balance === 0 && !allTokens?.length ? (
                <div
                  className="skeleton"
                  style={{ width: "90px", height: "18px", borderRadius: "4px", background: "rgba(255, 255, 255, 0.1)" }}
                />
              ) : !isBalanceHidden && totalUsdValue > 0 ? (
                <div className={`balance-card-trend ${portfolioChangeUsd >= 0 ? "positive" : "negative"}`}>
                  {portfolioChangeUsd >= 0 ? (
                    <svg className="balance-card-trend-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="19" x2="12" y2="5"></line>
                      <polyline points="5 12 12 5 19 12"></polyline>
                    </svg>
                  ) : (
                    <svg className="balance-card-trend-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <polyline points="19 12 12 19 5 12"></polyline>
                    </svg>
                  )}
                  <span>
                    {portfolioChangeUsd >= 0 ? "+" : ""}
                    {formatUsd(portfolioChangeUsd)} ({portfolioChangePct >= 0 ? "+" : ""}
                    {portfolioChangePct.toFixed(2)}%)
                  </span>
                </div>
              ) : null}

              {/* Owner Info */}
              <div>
                <div className="balance-card-holder-label">Card Holder</div>
                <div className="balance-card-holder-name">
                  {wallet.name || "Main Wallet"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Currency Dropdown overlay & menu */}
        {showCurrencyDropdown && (
          <div
            className="currency-dropdown-backdrop"
            onClick={(e) => {
              e.stopPropagation();
              setShowCurrencyDropdown(false);
            }}
          />
        )}
        {showCurrencyDropdown && (
          <div
            className="currency-dropdown-menu"
            onClick={(e) => e.stopPropagation()}
          >
            {SUPPORTED_CURRENCIES.map((opt) => (
              <button
                key={opt.code}
                type="button"
                className={`currency-dropdown-item ${opt.code === currency ? "active" : ""}`}
                onClick={async (e) => {
                  e.stopPropagation();
                  await setDisplayCurrency(opt.code);
                  window.dispatchEvent(new CustomEvent("qiubit:currency-changed"));
                  setShowCurrencyDropdown(false);
                }}
              >
                <span className="currency-dropdown-code">{opt.code}</span>
                <span className="currency-dropdown-symbol">{opt.symbol}</span>
                <span className="currency-dropdown-label">{opt.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content Tabs - Simplified */}
      <div className="tabs">
        <button
          className={`tab-item ${activeTab === "crypto" ? "active" : ""}`}
          onClick={() => setActiveTab("crypto")}
        >
          Crypto
        </button>
        <button
          className={`tab-item ${activeTab === "nft" ? "active" : ""}`}
          onClick={() => setActiveTab("nft")}
        >
          NFTs
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === "crypto" && (
          <div className="token-list-container">
            <div className="token-list-header flex justify-between items-center mb-sm">
              <span className="text-xs text-tertiary font-medium uppercase tracking-wider">
                Assets
              </span>
              <button
                className="icon-btn-ghost text-accent"
                onClick={() => setShowAddTokenModal(true)}
                title="Add Custom Token"
                style={{ padding: "4px" }}
              >
                <PlusIcon size={18} />
              </button>
            </div>
            <div className="token-list">
              {/* MAIN ASSETS (NATIVE OR WITH PRICES) */}
              {mainTokens.map((token: Token & { price?: number }) => (
                <TokenItem
                  key={
                    token.isNative
                      ? "OCT-NATIVE"
                      : token.contractAddress
                        ? `${token.chainId || "1"}-${token.contractAddress}`
                        : `${token.chainId || "oct"}-${token.symbol}`
                  }
                  token={token}
                  onClick={() => onTokenClick(token)}
                  hideBalance={isBalanceHidden}
                />
              ))}

              {/* LOW VALUE ASSETS COLLAPSIBLE ACCORDION */}
              {lowValueTokens.length > 0 && (
                <div className="low-value-assets-section">
                  <button
                    type="button"
                    className={`low-value-assets-header ${isLowValueExpanded ? "expanded" : ""}`}
                    onClick={() => setIsLowValueExpanded(!isLowValueExpanded)}
                  >
                    <span>Low-value assets ({lowValueTokens.length})</span>
                    <ChevronRightIcon
                      size={16}
                      className="arrow-icon"
                      style={{
                        transition: "transform var(--transition-fast)",
                        transform: isLowValueExpanded
                          ? "rotate(90deg)"
                          : "rotate(0deg)",
                      }}
                    />
                  </button>

                  {isLowValueExpanded && (
                    <div className="low-value-tokens-list">
                      {lowValueTokens.map(
                        (token: Token & { price?: number }) => (
                          <TokenItem
                            key={
                              token.isNative
                                ? "OCT-NATIVE"
                                : token.contractAddress
                                  ? `${token.chainId || "1"}-${token.contractAddress}`
                                  : `${token.chainId || "oct"}-${token.symbol}`
                            }
                            token={token}
                            onClick={() => onTokenClick(token)}
                            hideBalance={isBalanceHidden}
                          />
                        ),
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SKELETON LOADER FOR ASSETS IF LOADING AND NONE RENDERED YET */}
              {isLoadingTokens &&
                sortedTokensWithPrices.length === 0 &&
                [1, 2].map((i) => (
                  <div
                    key={`skel-${i}`}
                    className="flex items-center gap-sm"
                    style={{ opacity: 0.6, padding: "14px var(--space-xl)" }}
                  >
                    <div
                      className="skeleton"
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        flexShrink: 0,
                      }}
                    />
                    <div className="flex-1 flex flex-col gap-xs">
                      <div
                        className="skeleton"
                        style={{ width: "40px", height: "12px" }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: "30px", height: "8px" }}
                      />
                    </div>
                    <div
                      className="skeleton"
                      style={{ width: "40px", height: "12px" }}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === "nft" && (
          <div className="empty-state flex flex-col items-center py-3xl">
            <div style={{ marginBottom: "8px" }}>
              <FeedbackLottie kind="empty" size={140} />
            </div>
            <p>No NFTs yet</p>
            <span className="text-tertiary text-sm">
              Your NFTs will appear here
            </span>
          </div>
        )}
      </div>

      {/* Add Token Modal */}
      {showAddTokenModal && (
        <AddTokenModal
          walletAddress={wallet.address}
          initialNetworkId={networkSetting}
          onAdded={() => onRefresh()}
          onClose={() => setShowAddTokenModal(false)}
        />
      )}
    </>
  );
}
