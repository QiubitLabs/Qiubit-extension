import { useState } from "react";
import { Token } from "../../../types";
import { TokenIcon } from "../../shared/TokenIcon/TokenIcon";
import { DEFAULT_TOKENS } from "../../../constants/tokenLists";
import { formatAmount } from "../../../utils/crypto";

interface NetworkEntry {
  id: string;
  name: string;
  logoUrl: string;
  chainId?: number;
}

const isNativeCoin = (t: any): boolean => {
  if (!t) return false;
  if (t.isNative) return true;
  const symbol = (t.symbol || "").toUpperCase();
  const addr = (t.contractAddress || "").toLowerCase();
  if (t.chainId === 9048201 && symbol === "OCT") return true;
  if (t.chainId === 1151111081099710 && symbol === "SOL") return true;
  if (t.chainId === 9270000000000000 && symbol === "SUI") return true;
  if (t.chainId === 20000000000001 && symbol === "BTC") return true;
  if (
    !addr ||
    addr === "0x0000000000000000000000000000000000000000" ||
    addr === "11111111111111111111111111111111" ||
    addr === "bitcoin" ||
    addr === "sui" ||
    addr.includes("::sui::sui")
  ) {
    if (
      symbol === "ETH" ||
      symbol === "POL" ||
      symbol === "BNB" ||
      symbol === "MON" ||
      symbol === "HYPE"
    )
      return true;
  }
  return false;
};

const getNormalizedKey = (t: any): string => {
  if (isNativeCoin(t)) return `${t.chainId}-native`;
  return `${t.chainId}-${(t.contractAddress || "").toLowerCase()}`;
};

export interface TokenSelectorModalProps {
  target: "from" | "to";
  allTokens: Token[];
  networks: NetworkEntry[];
  activeChainFilter: string;
  setActiveChainFilter: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  customToken: any;
  isResolvingToken: boolean;
  tokenPrices: Map<string, { price: number; change24h: number }>;
  onSelect: (token: any, target: "from" | "to") => void;
  onClose: () => void;
  fixedChainId?: number;
}

export function TokenSelectorModal({
  target,
  allTokens,
  networks,
  activeChainFilter,
  setActiveChainFilter,
  searchQuery,
  setSearchQuery,
  customToken,
  isResolvingToken,
  tokenPrices,
  onSelect,
  onClose,
  fixedChainId,
}: TokenSelectorModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const allDefaults: any[] = [];
  Object.keys(DEFAULT_TOKENS).forEach((cid) => {
    const chainId = Number(cid);
    (DEFAULT_TOKENS[chainId] || []).forEach((t) =>
      allDefaults.push({ ...t, chainId }),
    );
  });

  const resolveChainId = (t: any): number | null => {
    if (t.chainId) return t.chainId;
    if (t.isNative) return 9048201;
    if (t.isSolana) return 1151111081099710;
    if (t.isSui) return 9270000000000000;
    if (t.isBitcoin) return 20000000000001;
    if (t.isEVM) return 1;
    return null;
  };

  const userActiveTokens: any[] =
    (allTokens
      ?.map((t) => {
        const chainId = resolveChainId(t);
        if (chainId === null) return null;
        let defaultAddress = "0x0000000000000000000000000000000000000000";
        if (chainId === 20000000000001) defaultAddress = "bitcoin";
        else if (chainId === 9270000000000000) defaultAddress = "sui";
        return {
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals || 18,
          contractAddress: t.contractAddress || defaultAddress,
          logoUrl: t.logoUrl || "",
          chainId,
          balance:
            typeof t.balance === "string"
              ? t.balance
              : (t.balance || 0).toString(),
          isNative: t.isNative,
          isSolana: t.isSolana,
          isSui: t.isSui,
          isBitcoin: t.isBitcoin,
          isTestnet: t.isTestnet,
        };
      })
      .filter(Boolean) as any[]) || [];

  const tokenMap = new Map<string, any>();
  allDefaults.forEach((t) =>
    tokenMap.set(getNormalizedKey(t), { ...t, balance: "0" }),
  );
  userActiveTokens.forEach((t) => {
    const key = getNormalizedKey(t);
    const existing = tokenMap.get(key);
    tokenMap.set(
      key,
      existing
        ? {
            ...existing,
            ...t,
            logoUrl: existing.logoUrl || t.logoUrl,
            name: existing.name || t.name,
            decimals: existing.decimals || t.decimals,
            contractAddress: existing.contractAddress || t.contractAddress,
          }
        : t,
    );
  });

  let mergedList = Array.from(tokenMap.values()).filter((t) => {
    if (t.chainId === 11155111) return false;
    if (t.isTestnet) return false;
    if (fixedChainId && t.chainId !== fixedChainId) return false;
    if (t.chainId === 1) {
      const sym = (t.symbol || "").toUpperCase();
      if (["OSC01", "OCS01", "OSC", "OCS", "OSCT"].includes(sym)) return false;
    }
    return true;
  });

  if (activeChainFilter !== "all") {
    const activeDef = networks.find((n) => n.id === activeChainFilter);
    if (activeDef?.chainId)
      mergedList = mergedList.filter((t) => t.chainId === activeDef.chainId);
  }

  const searchLower = searchQuery.toLowerCase().trim();
  const finalList = mergedList.filter((t) => {
    if (!searchLower) return true;
    return (
      t.symbol.toLowerCase().includes(searchLower) ||
      t.name.toLowerCase().includes(searchLower) ||
      t.contractAddress.toLowerCase() === searchLower
    );
  });

  // USD value of a holding = balance * price. Tokens with a balance but no
  // known price get value 0 and fall back to the raw-balance tiebreaker below.
  const usdValueOf = (t: any): number => {
    const bal = parseFloat(t.balance || "0");
    if (!(bal > 0)) return 0;
    const info = tokenPrices.get((t.symbol || "").toUpperCase());
    return info && info.price > 0 ? bal * info.price : 0;
  };

  // Sort by holding value (nominal USD) descending, so the tokens the user
  // owns most of surface first. Falls back to raw balance, then symbol.
  const sortedList = [...finalList].sort((a, b) => {
    const ua = usdValueOf(a),
      ub = usdValueOf(b);
    if (ua !== ub) return ub - ua;
    const ba = parseFloat(a.balance || "0"),
      bb = parseFloat(b.balance || "0");
    const aHas = ba > 0,
      bHas = bb > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (aHas && bHas && ba !== bb) return bb - ba;
    return a.symbol.localeCompare(b.symbol);
  });

  return (
    <div
      className="modal-overlay solid-overlay"
      style={{
        background: "#0D0D0D",
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        className="modal-content selector-modal"
        style={{
          background: "#0D0D0D",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          maxWidth: "100%",
          maxHeight: "100%",
          border: "none",
          borderRadius: 0,
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="fee-popup-title">Select token to pay</span>
          <button className="modal-close-btn" onClick={onClose}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="selector-search-wrapper">
          <svg
            className="search-icon-svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="selector-search-input"
            placeholder="Search coin name or contract address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {!fixedChainId && (
          <div className="network-horizontal-scroll">
            {networks.map((net) => {
              const isActive = activeChainFilter === net.id;
              if (net.id === "all") {
                return (
                  <button
                    key={net.id}
                    className={`network-tab-circle tab-all-label ${isActive ? "active" : ""}`}
                    onClick={() => setActiveChainFilter(net.id)}
                  >
                    All
                  </button>
                );
              }
              return (
                <button
                  key={net.id}
                  className={`network-tab-circle ${isActive ? "active" : ""}`}
                  onClick={() => setActiveChainFilter(net.id)}
                  title={net.name}
                >
                  <img src={net.logoUrl} alt="" className="network-tab-img" />
                </button>
              );
            })}
          </div>
        )}

        <div className="token-list-container">
          {isResolvingToken && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "12px 16px",
                color: "var(--widget-text-tertiary)",
                fontSize: "13px",
              }}
            >
              <div className="spinner-small" />
              <span>Resolving token...</span>
            </div>
          )}

          {customToken &&
            !sortedList.some(
              (t) =>
                t.contractAddress.toLowerCase() ===
                customToken.contractAddress.toLowerCase(),
            ) && (
              <div
                className="token-select-item"
                style={{
                  borderBottom: "1px solid var(--widget-border)",
                  marginBottom: "4px",
                }}
                onClick={() => onSelect(customToken, target)}
              >
                <div className="token-item-left">
                  <div className="token-item-logo-container">
                    <TokenIcon
                      symbol={customToken.symbol}
                      logoUrl={undefined}
                      size={36}
                      contractAddress={customToken.contractAddress}
                      chainId={customToken.chainId}
                    />
                    {(() => {
                      const cd = networks.find(
                        (n) => n.chainId === customToken.chainId,
                      );
                      return cd?.logoUrl ? (
                        <img
                          src={cd.logoUrl}
                          alt=""
                          className="token-item-chain-badge"
                        />
                      ) : null;
                    })()}
                  </div>
                  <div className="token-item-info">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <span className="token-item-symbol">
                        {customToken.symbol}
                      </span>
                      {customToken.contractAddress && (
                        <button
                          className="copy-contract-btn"
                          style={{
                            background: "none",
                            border: "none",
                            padding: "2px",
                            color: "var(--widget-text-tertiary, #888)",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginLeft: "4px",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(
                              customToken.contractAddress,
                            );
                            const key = getNormalizedKey(customToken);
                            setCopiedKey(key);
                            setTimeout(() => setCopiedKey(null), 1500);
                          }}
                          title="Copy contract address"
                        >
                          {copiedKey === getNormalizedKey(customToken) ? (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#22c55e"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                                ry="2"
                              />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                    <span
                      className="token-item-name"
                      style={{ fontFamily: "monospace", fontSize: "11px" }}
                    >
                      {customToken.contractAddress.slice(0, 8)}…
                      {customToken.contractAddress.slice(-6)}
                    </span>
                  </div>
                </div>
                <div className="token-item-right">
                  <span
                    style={{
                      fontSize: "10px",
                      color: "var(--widget-primary)",
                      background: "rgba(99,102,241,0.1)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    Import
                  </span>
                </div>
              </div>
            )}

          {sortedList.length === 0 && !customToken && !isResolvingToken ? (
            <div
              style={{
                textAlign: "center",
                padding: "30px 0",
                color: "var(--widget-text-tertiary)",
                fontSize: "13px",
              }}
            >
              No tokens found
            </div>
          ) : (
            sortedList.map((tok) => {
              const bal = parseFloat(tok.balance || "0");
              const chainDef = networks.find((n) => n.chainId === tok.chainId);
              const chainBadgeUrl = chainDef?.logoUrl || "/eth-icon.svg";
              const priceInfo = tokenPrices.get(tok.symbol.toUpperCase());
              const usdVal = priceInfo && bal > 0 ? bal * priceInfo.price : 0;

              return (
                <div
                  key={getNormalizedKey(tok) + "-" + tok.symbol}
                  className="token-select-item"
                  onClick={() => onSelect(tok, target)}
                >
                  <div className="token-item-left">
                    <div className="token-item-logo-container">
                      <TokenIcon
                        symbol={tok.symbol}
                        logoUrl={tok.logoUrl}
                        size={36}
                        contractAddress={tok.contractAddress}
                        chainId={tok.chainId}
                      />
                      {tok.chainId !== 9048201 && (
                        <img
                          src={chainBadgeUrl}
                          alt=""
                          className="token-item-chain-badge"
                        />
                      )}
                    </div>
                    <div className="token-item-info">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span className="token-item-symbol">{tok.symbol}</span>
                        {isNativeCoin(tok) && (
                          <span
                            style={{
                              fontSize: "9px",
                              fontWeight: "bold",
                              letterSpacing: "0.05em",
                              color: "rgba(255,255,255,0.6)",
                              background: "rgba(255,255,255,0.08)",
                              padding: "2px 5px",
                              borderRadius: "3px",
                              border: "1px solid rgba(255,255,255,0.1)",
                              textTransform: "uppercase",
                            }}
                          >
                            Native
                          </span>
                        )}
                        {!isNativeCoin(tok) &&
                          tok.contractAddress &&
                          tok.contractAddress !==
                            "0x0000000000000000000000000000000000000000" && (
                            <button
                              className="copy-contract-btn"
                              style={{
                                background: "none",
                                border: "none",
                                padding: "2px",
                                color: "var(--widget-text-tertiary, #888)",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginLeft: "4px",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(
                                  tok.contractAddress || "",
                                );
                                const key = getNormalizedKey(tok);
                                setCopiedKey(key);
                                setTimeout(() => setCopiedKey(null), 1500);
                              }}
                              title="Copy contract address"
                            >
                              {copiedKey === getNormalizedKey(tok) ? (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="#22c55e"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <rect
                                    x="9"
                                    y="9"
                                    width="13"
                                    height="13"
                                    rx="2"
                                    ry="2"
                                  />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              )}
                            </button>
                          )}
                      </div>
                      <span className="token-item-name">{tok.name}</span>
                    </div>
                  </div>
                  <div className="token-item-right">
                    {bal > 0 && (
                      <div className="token-item-balance-container">
                        <span className="token-item-balance">
                          {formatAmount(bal)}
                        </span>
                        {usdVal > 0 && (
                          <span className="token-item-fiat">
                            ${usdVal.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="token-item-star">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
