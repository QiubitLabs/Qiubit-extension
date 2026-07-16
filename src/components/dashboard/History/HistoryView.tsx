import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import "./HistoryView.css";
import "./HistoryTabs.css";

import { ChevronLeftIcon } from "../../shared/Icons";
import { FeedbackLottie } from "../../shared/FeedbackLottie";
import { TransactionItem } from "../Transactions";
import { TransactionDetailPage } from "../Transactions/TransactionDetailModal/TransactionDetailPage";
import { Transaction, Settings, Token } from "../../../types";
import {
  getAllNetworks,
  resolveNetwork,
} from "../../../services/network/NetworkResolver";
import { loadEvmTxHistory, saveEvmTxHistory } from "../../../utils/storage";

type TxWithNetwork = Transaction & { _network: string };

interface HistoryViewProps {
  transactions: Transaction[];
  address: string;
  evmAddress?: string;
  settings: Settings;
  onBack: () => void;
  isLoading: boolean;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  tokens?: Token[];
}

function TransactionSkeleton() {
  return (
    <div className="tx-skeleton">
      <div className="tx-skeleton-main">
        <div className="tx-skeleton-icon"></div>
        <div className="tx-skeleton-info">
          <div className="tx-skeleton-title"></div>
          <div className="tx-skeleton-subtitle"></div>
        </div>
      </div>
      <div className="tx-skeleton-side">
        <div className="tx-skeleton-amount"></div>
        <div className="tx-skeleton-time"></div>
      </div>
    </div>
  );
}

export function HistoryView({
  transactions,
  address: _address,
  evmAddress,
  settings,
  onBack,
  isLoading,
  onLoadMore,
  hasMore,
  isLoadingMore,
  tokens,
}: HistoryViewProps) {
  const EVM_HISTORY_NETS = useMemo(() => {
    const allNets = getAllNetworks();
    return Object.entries(allNets)
      .filter(([, n]) => n.isEVM)
      .map(([id, n]) => ({
        id,
        label: n.displayName,
        color: n.badgeColor ?? "#627EEA",
        nativeSymbol: n.nativeToken?.symbol ?? "ETH",
      }));
  }, []);

  const [filter, setFilter] = useState("all");
  const [networkFilter, setNetworkFilter] = useState<"all" | string>("all");
  const [selectedTx, setSelectedTx] = useState<TxWithNetwork | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [evmTxsByNetwork, setEvmTxsByNetwork] = useState<
    Map<string, Transaction[]>
  >(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const settledEvmHashes = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isLoading || isLoadingMore || !hasMore)
      return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 50) onLoadMore();
  }, [isLoading, isLoadingMore, hasMore, onLoadMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  const network = settings?.network || "all";

  const loadAllEvmHistory = useCallback(async () => {
    if (!evmAddress || network === "octra") return;
    for (const net of EVM_HISTORY_NETS) {
      const cached = await loadEvmTxHistory(net.id, evmAddress);
      setEvmTxsByNetwork((prev) => {
        const current = prev.get(net.id);
        if (JSON.stringify(current) === JSON.stringify(cached)) return prev;
        const next = new Map(prev);
        next.set(net.id, cached);
        return next;
      });
    }
  }, [evmAddress, network, EVM_HISTORY_NETS]);

  // Load EVM history from storage, then refresh only when it actually changes.
  // In the extension, chrome.storage.onChanged fires on every saveEvmTxHistory
  // write, so there is no need to poll storage on a timer. A light interval is
  // used only in the dev localStorage polyfill, which has no change events.
  useEffect(() => {
    if (!evmAddress || network === "octra") {
      setEvmTxsByNetwork(new Map());
      return;
    }
    let cancelled = false;
    const reload = () => {
      if (!cancelled) loadAllEvmHistory();
    };
    reload();

    const onChanged = (changes: { [key: string]: unknown }) => {
      if (Object.keys(changes).some((k) => k.startsWith("evm_hist_v1:"))) {
        reload();
      }
    };
    const canListen =
      typeof chrome !== "undefined" && !!chrome.storage?.onChanged;
    if (canListen) {
      chrome.storage.onChanged.addListener(onChanged);
    }
    const devInterval = canListen ? null : setInterval(reload, 4000);

    return () => {
      cancelled = true;
      if (canListen) chrome.storage.onChanged.removeListener(onChanged);
      if (devInterval) clearInterval(devInterval);
    };
  }, [evmAddress, network, loadAllEvmHistory]);

  // Check pending EVM txs against the chain. A transient RPC error must NOT
  // settle the tx, otherwise it would stay "pending" forever; we simply retry
  // on the next tick. Only receipts (confirmed/failed) settle a hash.
  const reconcilePending = useCallback(async () => {
    if (!evmAddress) return;
    for (const [netId, txs] of evmTxsByNetwork) {
      const pending = txs.filter(
        (tx) =>
          tx.status === "pending" &&
          tx.hash &&
          !settledEvmHashes.current.has(tx.hash),
      );
      if (pending.length === 0) continue;

      try {
        const { getEvmProviderForNetwork } = await import(
          "../../../utils/evmProvider"
        );
        const provider = getEvmProviderForNetwork(netId);

        for (const tx of pending) {
          if (!tx.hash) continue;
          try {
            const receipt = await provider.getTransactionReceipt(tx.hash);
            if (receipt !== null) {
              settledEvmHashes.current.add(tx.hash);
              const newStatus = receipt.status === 1 ? "confirmed" : "failed";
              await saveEvmTxHistory(netId, evmAddress, [
                { ...tx, status: newStatus as Transaction["status"] },
              ]);
            }
            // receipt null → still pending on-chain; leave it, retry next tick.
          } catch {
            // Transient RPC error → don't settle; retry on the next tick.
          }
        }
      } catch {
        /* provider unavailable for this network */
      }
    }
  }, [evmTxsByNetwork, evmAddress]);

  const hasPendingEvm = useMemo(
    () =>
      Array.from(evmTxsByNetwork.values()).some((txs) =>
        txs.some(
          (tx) =>
            tx.status === "pending" &&
            tx.hash &&
            !settledEvmHashes.current.has(tx.hash),
        ),
      ),
    [evmTxsByNetwork],
  );

  // Poll for receipts only while something is pending, then stop.
  useEffect(() => {
    if (!hasPendingEvm) return;
    reconcilePending();
    const interval = setInterval(reconcilePending, 7000);
    return () => clearInterval(interval);
  }, [hasPendingEvm, reconcilePending]);

  const contractToSymbol = useMemo(() => {
    const map = new Map<string, string>();
    if (!tokens) return map;
    for (const t of tokens) {
      if (
        t.contractAddress &&
        t.contractAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        map.set(t.contractAddress.toLowerCase(), t.symbol);
      }
    }
    return map;
  }, [tokens]);

  const allTransactions = useMemo((): TxWithNetwork[] => {
    const isOctOnly = network === "octra";
    const isEvmOnly = !isOctOnly && resolveNetwork(network)?.isEVM;

    const nonEvmTxList: TxWithNetwork[] = (isEvmOnly ? [] : transactions).map(
      (tx) => {
        const netId = tx.networkId || "octra";
        // Registry lookup covers testnets (solana-devnet, sui-testnet, …) and
        // user-added networks, not just the hardcoded mainnet ids.
        const defaultToken = resolveNetwork(netId)?.nativeToken?.symbol ?? "OCT";
        return {
          ...tx,
          _network: netId,
          networkId: netId,
          token: tx.token || defaultToken,
        };
      },
    );

    const evmTxList: TxWithNetwork[] = [];
    if (!isOctOnly) {
      evmTxsByNetwork.forEach((txs, netId) => {
        const evmNet = EVM_HISTORY_NETS.find((n) => n.id === netId);
        const nativeSymbol = evmNet?.nativeSymbol ?? "ETH";
        txs.forEach((tx) =>
          evmTxList.push({
            ...tx,
            _network: netId,
            networkId: tx.networkId || netId,
            token: tx.token || nativeSymbol,
          }),
        );
      });
    }

    const combined = [...nonEvmTxList, ...evmTxList];
    const seen = new Set<string>();
    return combined
      .filter((tx) => {
        if (!tx.hash) return true;
        if (seen.has(tx.hash)) return false;
        seen.add(tx.hash);
        return true;
      })
      .sort((a, b) => {
        const aT =
          typeof a.timestamp === "string"
            ? parseInt(a.timestamp)
            : (a.timestamp as number);
        const bT =
          typeof b.timestamp === "string"
            ? parseInt(b.timestamp)
            : (b.timestamp as number);
        return bT - aT;
      })
      .map((tx) => {
        if (tx.contractAddress) {
          const sym = contractToSymbol.get(tx.contractAddress.toLowerCase());
          if (sym) return { ...tx, token: sym };
        }
        return tx;
      });
  }, [transactions, evmTxsByNetwork, network, contractToSymbol]);

  const availableNetworks = useMemo((): string[] => {
    const order = [
      "octra",
      "solana",
      "sui",
      "bitcoin",
      ...EVM_HISTORY_NETS.map((n) => n.id),
    ];
    if (network !== "all") {
      return order.filter((id) => id === network);
    }
    return order;
  }, [EVM_HISTORY_NETS, network]);

  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      if (networkFilter !== "all" && tx._network !== networkFilter)
        return false;
      if (filter === "all") return true;
      if (filter === "pending") return tx.status === "pending";
      if (filter === "sent")
        return (
          tx.type === "out" ||
          tx.type === "shield" ||
          tx.type === "private" ||
          tx.type === "swap"
        );
      if (filter === "received")
        return (
          tx.type === "in" || tx.type === "unshield" || tx.type === "claim"
        );
      return true;
    });
  }, [allTransactions, filter, networkFilter]);

  const pendingCount = useMemo(() => {
    return allTransactions.filter((tx) => tx.status === "pending").length;
  }, [allTransactions]);

  const getNetworkMeta = (netId: string) => {
    const cfg = resolveNetwork(netId);
    if (cfg)
      return { label: cfg.displayName, color: cfg.badgeColor ?? "#888" };
    const evmNet = EVM_HISTORY_NETS.find((n) => n.id === netId);
    return evmNet
      ? { label: evmNet.label, color: evmNet.color }
      : { label: netId, color: "#888" };
  };

  if (selectedTx) {
    return (
      <TransactionDetailPage
        tx={selectedTx}
        network={settings?.network || "mainnet"}
        onBack={() => setSelectedTx(null)}
        evmAddress={evmAddress}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-md mb-xl">
        <button className="header-icon-btn" onClick={onBack}>
          <ChevronLeftIcon size={20} />
        </button>
        <h2 className="text-lg font-semibold" style={{ flex: 1 }}>
          Transaction History
        </h2>
      </div>

      {/* Type Filter Tabs & Dropdown */}
      <div
        className="flex items-center justify-between mb-lg"
        style={{ position: "relative" }}
      >
        <div className="tab-pills" style={{ marginBottom: 0 }}>
          <button
            className={`tab-pill ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`tab-pill ${filter === "sent" ? "active" : ""}`}
            onClick={() => setFilter("sent")}
          >
            Sent
          </button>
          <button
            className={`tab-pill ${filter === "received" ? "active" : ""}`}
            onClick={() => setFilter("received")}
          >
            Received
          </button>
          {pendingCount > 0 && (
            <button
              className={`tab-pill tab-pill-pending ${filter === "pending" ? "active" : ""}`}
              onClick={() => setFilter("pending")}
            >
              Pending ({pendingCount})
            </button>
          )}
        </div>

        {availableNetworks.length > 1 && (
          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button
              className="network-select-trigger-text"
              onClick={() => setShowDropdown(!showDropdown)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                padding: "4px 8px",
                transition: "color 0.2s",
              }}
            >
              <span>
                {networkFilter === "all"
                  ? "All networks"
                  : getNetworkMeta(networkFilter).label}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: showDropdown ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              >
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {showDropdown && (
              <div
                className="network-dropdown-list animate-fade-in"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "8px",
                  background: "#151515",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  zIndex: 100,
                  minWidth: "150px",
                  maxHeight: "200px",
                  overflowY: "auto",
                  padding: "4px 0",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <button
                  onClick={() => {
                    setNetworkFilter("all");
                    setShowDropdown(false);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "8px 16px",
                    textAlign: "left",
                    color:
                      networkFilter === "all"
                        ? "#ffffff"
                        : "var(--text-secondary)",
                    fontSize: "13px",
                    fontWeight: networkFilter === "all" ? 700 : 500,
                    cursor: "pointer",
                    width: "100%",
                    display: "block",
                  }}
                >
                  All networks
                </button>

                {availableNetworks.map((netId) => {
                  const meta = getNetworkMeta(netId);
                  const isActive = networkFilter === netId;
                  return (
                    <button
                      key={netId}
                      onClick={() => {
                        setNetworkFilter(netId);
                        setShowDropdown(false);
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: "8px 16px",
                        textAlign: "left",
                        color: isActive ? "#ffffff" : "var(--text-secondary)",
                        fontSize: "13px",
                        fontWeight: isActive ? 700 : 500,
                        cursor: "pointer",
                        width: "100%",
                        display: "block",
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && filteredTransactions.length === 0 ? (
        <div className="tx-section">
          <div className="tx-list">
            <TransactionSkeleton />
            <TransactionSkeleton />
            <TransactionSkeleton />
          </div>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="tx-empty py-3xl flex flex-col items-center">
          <div style={{ margin: "0 0 8px 0" }}>
            <FeedbackLottie kind="empty" size={140} />
          </div>
          <p className="text-tertiary">
            {filter === "pending"
              ? "No pending transactions"
              : "No transactions found"}
          </p>
          {(filter !== "all" || networkFilter !== "all") && (
            <p className="text-xs text-tertiary mt-sm">
              Try changing the filter
            </p>
          )}
        </div>
      ) : (
        <div
          className="tx-section history-scroll-container"
          ref={scrollContainerRef}
        >
          <div className="tx-list">
            {filteredTransactions.map((tx, index) => (
              <TransactionItem
                key={tx.hash || index}
                tx={tx}
                onClick={() => setSelectedTx(tx)}
              />
            ))}
          </div>
          {isLoadingMore && (
            <div className="tx-load-more">
              <TransactionSkeleton />
            </div>
          )}
          {!hasMore && filteredTransactions.length > 5 && (
            <div className="tx-end">
              <p>End of history</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
