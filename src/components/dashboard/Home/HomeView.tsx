import { useState, useEffect, useMemo } from "react";
import { PlusIcon, ChevronRightIcon } from "../../shared/Icons";
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
import {
  filterTokensByNetwork,
  NETWORK_REGISTRY,
} from "../../../constants/networks/registry";

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
}: HomeViewProps) {
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
    const netConfig = NETWORK_REGISTRY[networkSetting];
    const isEvm = netConfig?.isEVM === true;
    const isSolana = netConfig?.id === "solana";
    const isSui = netConfig?.id === "sui";
    const isBitcoin = netConfig?.id === "bitcoin";

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

    const filtered = filterTokensByNetwork(
      mappedTokens,
      networkSetting,
    ) as Token[];

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
      })
      .filter((t) => {
        if (t.isNative) return true;
        const upperSymbol = t.symbol.toUpperCase();
        const balanceNum =
          typeof t.balance === "string"
            ? parseFloat(t.balance)
            : t.balance || 0;
        if (balanceNum > 0) return true;

        const popularSymbols = [
          "ETH",
          "WOCT",
          "USDC",
          "USDT",
          "DAI",
          "WBTC",
          "LINK",
          "UNI",
          "PEPE",
          "SHIB",
          "MATIC",
          "POL",
          "BNB",
          "GRT",
          "AAVE",
          "MKR",
          "LDO",
          "MON",
          "HYPE",
          "SOL",
          "SUI",
          "BTC",
        ];
        return popularSymbols.includes(upperSymbol);
      });

    return mapped.sort((a, b) => {
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
    const netConfig = NETWORK_REGISTRY[networkSetting];
    const isEvm = netConfig?.isEVM === true;
    const nativeSymbol =
      isEvm && netConfig?.nativeToken ? netConfig.nativeToken.symbol : "OCT";

    const main: (Token & { price: number; change24h: number })[] = [];
    const low: (Token & { price: number; change24h: number })[] = [];

    sortedTokensWithPrices.forEach((t) => {
      const isNativeToken =
        t.isNative ||
        !t.contractAddress ||
        t.symbol === "OCT" ||
        t.symbol === "ETH" ||
        t.symbol === nativeSymbol;
      const hasPrice = t.price && t.price > 0;

      // OCS-01 tokens have no market price but are the user's own Octra tokens,
      // so keep them in the main list rather than the collapsed low-value area.
      if (isNativeToken || hasPrice || t.isOCS01) {
        main.push(t);
      } else {
        low.push(t);
      }
    });

    return { mainTokens: main, lowValueTokens: low };
  }, [sortedTokensWithPrices, networkSetting]);

  return (
    <>
      {/* Balance Card */}
      <div
        className="balance-card"
        onClick={onToggleBalance}
        style={{ cursor: "pointer" }}
      >
        {isLoadingTokens && balance === 0 && !allTokens?.length ? (
          <div className="flex-col items-center gap-sm">
            <div
              className="skeleton"
              style={{ width: "120px", height: "32px", borderRadius: "6px" }}
            />
            <div
              className="skeleton"
              style={{
                width: "100px",
                height: "14px",
                borderRadius: "4px",
                marginTop: "8px",
              }}
            />
          </div>
        ) : isBalanceHidden ? (
          <div className="balance-amount">
            <span className="balance-hidden">••••••</span>
          </div>
        ) : (
          <>
            {/* Total Portfolio USD */}
            <div className="balance-usd">{displayUsdValue}</div>

            {/* 24h Change Row */}
            {totalUsdValue > 0 && (
              <div className="portfolio-change-row">
                <span
                  className={`portfolio-change-usd ${portfolioChangeUsd >= 0 ? "positive" : "negative"}`}
                >
                  {portfolioChangeUsd >= 0 ? "+" : ""}
                  {formatUsd(portfolioChangeUsd)}
                </span>
                <span
                  className={`portfolio-change-pct ${portfolioChangePct >= 0 ? "positive" : "negative"}`}
                >
                  {portfolioChangePct >= 0 ? "+" : ""}
                  {portfolioChangePct.toFixed(2)}%
                </span>
              </div>
            )}
          </>
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
            <div
              style={{
                marginBottom: "16px",
                opacity: 0.8,
                color: "var(--text-tertiary)",
              }}
            >
              <svg
                width="120"
                height="120"
                viewBox="0 0 100 100"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <ellipse
                  className="ghost-shadow"
                  cx="50"
                  cy="92"
                  rx="20"
                  ry="3"
                  fill="currentColor"
                  fillOpacity="0.2"
                />
                <g className="ghost-body">
                  <path
                    d="M50 15C30 15 15 35 15 60V85L22 78L29 85L36 78L43 85L50 78L57 85L64 78L71 85L78 78L85 85V60C85 35 70 15 50 15Z"
                    fill="currentColor"
                    fillOpacity="0.05"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="38"
                    cy="45"
                    r="4"
                    fill="currentColor"
                    fillOpacity="0.8"
                  />
                  <circle
                    cx="62"
                    cy="45"
                    r="4"
                    fill="currentColor"
                    fillOpacity="0.8"
                  />
                  <ellipse
                    cx="50"
                    cy="58"
                    rx="3"
                    ry="4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M15 55C10 55 5 45 10 40"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M85 55C90 55 95 45 90 40"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </g>
              </svg>
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
