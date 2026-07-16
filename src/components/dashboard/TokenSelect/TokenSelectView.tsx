import { useState, useEffect, useRef } from "react";
import { formatAmount } from "../../../utils/crypto";
import {
  getCachedPrices,
  getMultipleTokenPrices,
  formatUsd,
  formatPrice,
} from "../../../services/network/PriceService";
import { ChevronLeftIcon, SearchIcon } from "../../shared/Icons";
import { TokenIcon } from "../../shared/TokenIcon";
import { resolveNetworkForToken } from "../../../services/network/NetworkResolver";
import "./TokenSelect.css";
import { Token } from "../../../types";

interface TokenSelectViewProps {
  tokens: Token[];
  onSelect: (token: Token) => void;
  onBack: () => void;
}

export function TokenSelectView({
  tokens,
  onSelect,
  onBack,
}: TokenSelectViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [chainFilter, setChainFilter] = useState("all");
  const [showChainDropdown, setShowChainDropdown] = useState(false);
  const [chainSearch, setChainSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showChainDropdown) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node))
        setShowChainDropdown(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showChainDropdown]);

  const pickChain = (id: string) => {
    setChainFilter(id);
    setShowChainDropdown(false);
    setChainSearch("");
  };
  const [priceMap, setPriceMap] = useState<
    Map<string, { price: number; change24h: number }>
  >(() => getCachedPrices());

  useEffect(() => {
    const symbols = tokens.map((t) => t.symbol);
    getMultipleTokenPrices(symbols).then((map) => {
      if (map.size > 0) setPriceMap((prev) => new Map([...prev, ...map]));
    });
  }, [tokens]);

  const tokenNetId = (t: Token): string =>
    resolveNetworkForToken(t)?.id ?? "octra";

  // Distinct chains present in the token list, in first-seen order, for the
  // horizontal filter row.
  const chains = (() => {
    const seen = new Map<string, { id: string; name: string; icon?: string }>();
    for (const t of tokens) {
      const net = resolveNetworkForToken(t);
      if (net && !seen.has(net.id))
        seen.set(net.id, {
          id: net.id,
          name: net.shortName || net.displayName,
          icon: net.iconUrl,
        });
    }
    return Array.from(seen.values());
  })();

  const tokenUsd = (token: Token): number => {
    const price = token.isTestnet
      ? 0
      : (priceMap.get(token.symbol)?.price ?? 0);
    const bal =
      typeof token.balance === "string"
        ? parseFloat(token.balance)
        : token.balance;
    const usd = price * (bal || 0);
    return isNaN(usd) ? 0 : usd;
  };

  const filteredTokens = tokens
    .filter((token) => {
      const matchesSearch =
        token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesChain =
        chainFilter === "all" || tokenNetId(token) === chainFilter;
      return matchesSearch && matchesChain;
    })
    // Highest USD value first
    .sort((a, b) => tokenUsd(b) - tokenUsd(a));

  return (
    <div className="token-select-view animate-fade-in">
      <div className="flex items-center gap-md mb-lg">
        <button className="header-icon-btn" onClick={onBack}>
          <ChevronLeftIcon size={20} />
        </button>
        <h2 className="text-lg font-semibold">Select Token</h2>
      </div>

      {/* Search Input */}
      <div className="token-search">
        <div className="token-search-input">
          <SearchIcon size={16} className="token-search-icon" />
          <input
            type="text"
            placeholder="Search tokens..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Chain filter — only meaningful when the wallet holds tokens on >1 chain.
          Horizontal chips for quick taps + a dropdown so every chain is
          reachable without sideways scrolling. */}
      {chains.length > 1 && (
        <div className="token-chain-filter-row">
          <div className="chain-dropdown-wrap" ref={dropdownRef}>
            <button
              className={`chain-chip chain-dropdown-trigger ${chainFilter !== "all" ? "active" : ""}`}
              onClick={() => setShowChainDropdown((v) => !v)}
            >
              <span>
                {chainFilter === "all"
                  ? "All"
                  : (chains.find((c) => c.id === chainFilter)?.name ??
                    chainFilter)}
              </span>
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{ opacity: 0.6, flexShrink: 0 }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showChainDropdown && (
              <div className="chain-dropdown-menu">
                <div className="chain-dropdown-search">
                  <SearchIcon size={13} />
                  <input
                    type="text"
                    placeholder="Search network..."
                    value={chainSearch}
                    onChange={(e) => setChainSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                {"all networks".includes(chainSearch.toLowerCase()) && (
                  <button
                    className={`chain-dropdown-item ${chainFilter === "all" ? "active" : ""}`}
                    onClick={() => pickChain("all")}
                  >
                    All networks
                  </button>
                )}
                {chains
                  .filter((c) =>
                    c.name.toLowerCase().includes(chainSearch.toLowerCase()),
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      className={`chain-dropdown-item ${chainFilter === c.id ? "active" : ""}`}
                      onClick={() => pickChain(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="token-chain-filter">
            {chains.map((c) => (
              <button
                key={c.id}
                className={`chain-chip ${chainFilter === c.id ? "active" : ""}`}
                onClick={() => setChainFilter(c.id)}
                title={c.name}
              >
                {c.icon ? (
                  <img className="chain-chip-img" src={c.icon} alt="" />
                ) : null}
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="token-select-list">
        {filteredTokens.length === 0 ? (
          <div className="token-select-empty">
            <p>No tokens found</p>
          </div>
        ) : (
          filteredTokens.map((token) => {
            const priceData = token.isTestnet
              ? null
              : priceMap.get(token.symbol);
            const price = priceData?.price ?? 0;
            const bal =
              typeof token.balance === "string"
                ? parseFloat(token.balance)
                : token.balance;
            const usdValue = price * bal;

            return (
              <button
                key={`${token.symbol}-${token.chainId ?? '0'}-${token.contractAddress || 'native'}`}
                className="token-select-item"
                onClick={() => onSelect(token)}
              >
                <div className="token-select-icon">
                  <TokenIcon
                    symbol={token.symbol}
                    logoUrl={token.logoUrl}
                    size={32}
                    contractAddress={token.contractAddress}
                    chainId={token.chainId}
                  />
                </div>
                <div className="token-select-info">
                  <span className="token-select-symbol">{token.symbol}</span>
                  <span className="token-select-balance-text">
                    {formatAmount(token.balance)}
                  </span>
                </div>
                <div className="token-select-market">
                  <span className="token-market-value">
                    {formatUsd(usdValue)}
                  </span>
                  <span className="token-market-price">
                    {formatPrice(price)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
