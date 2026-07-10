import { useState, useCallback, useEffect, useRef } from "react";
import { logInfo } from "../utils/logger";
import { Wallet, Transaction } from "../types";
import { getRpcClient } from "../services/network/RpcService";
import {
  loadTxHistoryAsync,
  saveTxHistorySecure as saveTxHistory,
  getAllPrivacyTransactionsSecure as getAllPrivacyTransactions,
  pruneExpiredPendingTxs,
} from "../utils/storage";
import { ocs01Manager } from "../services/features/OCS01TokenService";

let stagedTxCache: { data: any[]; ts: number } | null = null;
const STAGED_TTL = 20_000;

const TX_REFRESH_MIN_SPACING = 30_000;

const INITIAL_TX_FETCH = 100; // tx refs requested when local storage is empty (first ever load)
const INCREMENTAL_TX_CHECK = 10; // tx refs checked on each periodic/manual refresh
const DISPLAY_PAGE = 25; // items shown per page
const LOAD_MORE_FETCH = 50; // extra refs requested when user needs more beyond storage

async function getStagedTxsCached(rpcClient: any): Promise<any[]> {
  if (stagedTxCache && Date.now() - stagedTxCache.ts < STAGED_TTL) {
    return stagedTxCache.data;
  }
  const result = await rpcClient.getStagedTransactions();
  stagedTxCache = { data: result || [], ts: Date.now() };
  return stagedTxCache.data;
}

export function useTransactionHistory(
  wallet: Wallet | null,
  password: string | null,
  settings: any,
) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [displayLimit, setDisplayLimit] = useState(DISPLAY_PAGE);
  const [totalOnChain, setTotalOnChain] = useState(0);
  const [storedCount, setStoredCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const rpcClient = getRpcClient();
  const lastTxRefreshAt = useRef<Map<string, number>>(new Map());
  const inflightTxRefresh = useRef<Map<string, Promise<void>>>(new Map());

  const displayLimitRef = useRef(DISPLAY_PAGE);
  const totalOnChainRef = useRef(0);
  const storedCountRef = useRef(0);

  useEffect(() => {
    displayLimitRef.current = displayLimit;
  }, [displayLimit]);
  useEffect(() => {
    totalOnChainRef.current = totalOnChain;
  }, [totalOnChain]);
  useEffect(() => {
    storedCountRef.current = storedCount;
  }, [storedCount]);

  const hasMoreTxs = displayLimit < storedCount || storedCount < totalOnChain;

  const renderDisplay = useCallback(
    async (limit: number): Promise<void> => {
      if (!wallet?.address) return;
      const addr = wallet.address;
      const network = settings.network || "mainnet";

      try {
        const stored: Transaction[] = await loadTxHistoryAsync(
          network,
          addr,
          1000,
        );
        const sorted = stored.sort(
          (a, b) => Number(b.timestamp) - Number(a.timestamp),
        );
        setStoredCount(stored.length);
        storedCountRef.current = stored.length;

        let pendingTxs: Transaction[] = [];
        if (network === "octra" || network === "mainnet" || network === "all") {
          try {
            const stagingTxs = await getStagedTxsCached(rpcClient);
            if (stagingTxs?.length) {
              const userAddrLower = addr.toLowerCase();
              const confirmedHashes = new Set(stored.map((tx) => tx.hash));
              pendingTxs = stagingTxs
                .filter((tx: any) => {
                  const from = (tx.from || "").toLowerCase();
                  const to = (tx.to || tx.to_ || "").toLowerCase();
                  return (
                    (from === userAddrLower || to === userAddrLower) &&
                    !confirmedHashes.has(tx.hash)
                  );
                })
                .map(
                  (tx: any): Transaction => ({
                    hash: tx.hash || `pending_${tx.nonce}`,
                    type:
                      (tx.to || tx.to_ || "").toLowerCase() === userAddrLower
                        ? "in"
                        : "out",
                    amount:
                      parseFloat(tx.amount || 0) /
                      (tx.amount && String(tx.amount).includes(".")
                        ? 1
                        : 1_000_000),
                    address:
                      (tx.to || tx.to_ || "").toLowerCase() === userAddrLower
                        ? tx.from
                        : tx.to || tx.to_,
                    timestamp: Date.now(),
                    status: "pending" as const,
                    token: "OCT",
                    ou: tx.ou,
                  }),
                );
            }
          } catch {
            /* ignore staging errors */
          }
        }

        setTransactions([...pendingTxs, ...sorted.slice(0, limit)]);
      } catch {
        /* ignore */
      }
    },
    [wallet?.address, settings.network, rpcClient],
  );

  const fetchAndMerge = useCallback(
    async (fetchLimit: number): Promise<void> => {
      if (!wallet?.address) return;
      const addr = wallet.address;
      const network = settings.network || "mainnet";

      if (network === "solana") {
        if (!wallet.solanaAddress) return;
        try {
          const { solanaRpc } =
            await import("../services/network/SolanaRpcService");
          const txs = await solanaRpc.getTransactionHistory(
            wallet.solanaAddress,
            fetchLimit,
          );
          if (txs.length > 0) {
            setTotalOnChain(txs.length);
            totalOnChainRef.current = txs.length;
            await saveTxHistory(txs, network, addr);
          }
        } catch (e) {
          console.error("Failed to fetch Solana history:", e);
        }
        return;
      }

      if (network === "sui") {
        if (!wallet.suiAddress) return;
        try {
          const { suiRpc } = await import("../services/network/SuiRpcService");
          const txs = await suiRpc.getTransactionHistory(
            wallet.suiAddress,
            fetchLimit,
          );
          if (txs.length > 0) {
            setTotalOnChain(txs.length);
            totalOnChainRef.current = txs.length;
            await saveTxHistory(txs, network, addr);
          }
        } catch (e) {
          console.error("Failed to fetch Sui history:", e);
        }
        return;
      }

      if (network === "bitcoin") {
        if (!wallet.bitcoinAddress) return;
        try {
          const { bitcoinRpc } =
            await import("../services/network/BitcoinRpcService");
          const txs = await bitcoinRpc.getTransactionHistory(
            wallet.bitcoinAddress,
          );
          if (txs.length > 0) {
            setTotalOnChain(txs.length);
            totalOnChainRef.current = txs.length;
            await saveTxHistory(txs, network, addr);
          }
        } catch (e) {
          console.error("Failed to fetch Bitcoin history:", e);
        }
        return;
      }

      try {
        const [allPrivacyLogs, info] = await Promise.all([
          getAllPrivacyTransactions(password || ""),
          rpcClient.getAddressInfo(addr, fetchLimit),
        ]);

        const total = info.transaction_count || 0;
        setTotalOnChain(total);
        totalOnChainRef.current = total;

        if (!info.recent_transactions?.length) return;

        const stored: Transaction[] = await loadTxHistoryAsync(
          network,
          addr,
          1000,
        );
        const existingTxMap = new Map(stored.map((tx) => [tx.hash, tx]));

        const hashesToFetch: any[] = [];
        for (const ref of info.recent_transactions) {
          const existing = existingTxMap.get(ref.hash);
          if (existing?.status === "confirmed") continue; // Skip already confirmed to avoid missing others
          if (!existing || existing.status === "pending")
            hashesToFetch.push(ref);
        }

        if (hashesToFetch.length === 0) return;

        const newConfirmedTxs: Transaction[] = [];
        const TX_CONCURRENCY = 2;
        for (let i = 0; i < hashesToFetch.length; i += TX_CONCURRENCY) {
          const batch = hashesToFetch.slice(i, i + TX_CONCURRENCY);
          if (i > 0) await new Promise((r) => setTimeout(r, 300));

          const results = await Promise.all(
            batch.map(async (ref) => {
              try {
                const txData = await rpcClient.getTransaction(ref.hash);
                const parsed = txData.parsed_tx || txData;
                const toAddr = parsed.to || parsed.to_;
                const isIncoming = toAddr?.toLowerCase() === addr.toLowerCase();
                const privacyLog = allPrivacyLogs[ref.hash] || null;

                let txType = isIncoming ? "in" : "out";
                // Counterparty shown in the row/detail. For token transfers the
                // tx-level `to` is the contract, so this is refined below.
                let counterparty = isIncoming ? parsed.from : toAddr;
                let amount =
                  parseFloat(parsed.amount_raw || parsed.amount || 0) /
                  1_000_000;
                let token = "OCT";
                let contractAddress: string | undefined = undefined;

                if (txData.program_receipt) {
                  const receipt = txData.program_receipt;
                  if (
                    [
                      "lock_trusted",
                      "unlock_trusted",
                      "lock_to_eth",
                      "unlock_bridge",
                    ].includes(receipt.method)
                  ) {
                    if (
                      Array.isArray(receipt.args) &&
                      receipt.args.length > 1
                    ) {
                      amount = parseFloat(receipt.args[1]) / 1_000_000;
                    }
                    txType = "shield";
                  }
                } else if (parsed.op_type === "call") {
                  contractAddress = toAddr;
                  if (contractAddress) {
                    try {
                      const meta = await ocs01Manager.getTokenMetadata(
                        contractAddress,
                        addr,
                      );
                      token = meta.symbol || "OCS01";
                    } catch {
                      token = "OCS01";
                    }
                  }
                  const method = parsed.encrypted_data || "";
                  if (method === "transfer" && parsed.message) {
                    try {
                      const p = JSON.parse(parsed.message);
                      if (Array.isArray(p) && p.length >= 2) {
                        const recipient = p[0];
                        let dec = 6;
                        if (contractAddress) {
                          const meta = await ocs01Manager.getTokenMetadata(
                            contractAddress,
                            addr,
                          );
                          dec = meta.decimals ?? 6;
                        }
                        amount = parseFloat(p[1]) / Math.pow(10, dec);

                        if (
                          recipient &&
                          recipient.toLowerCase() === addr.toLowerCase()
                        ) {
                          txType = "in";
                          // I'm the recipient → counterparty is the sender
                          counterparty = parsed.from;
                        } else {
                          txType = "out";
                          // I sent it → counterparty is the recipient
                          counterparty = recipient || toAddr;
                        }
                      }
                    } catch (e) {
                      /* ignore parse error */
                    }
                  } else if (parsed.message) {
                    try {
                      const p = JSON.parse(parsed.message);
                      if (Array.isArray(p) && p.length >= 2) {
                        let dec = 6;
                        if (contractAddress) {
                          const meta = await ocs01Manager.getTokenMetadata(
                            contractAddress,
                            addr,
                          );
                          dec = meta.decimals ?? 6;
                        }
                        amount = parseFloat(p[1]) / Math.pow(10, dec);
                      }
                    } catch (e) {
                      /* ignore parse error */
                    }
                  }
                }

                if (privacyLog) txType = privacyLog.type;

                const timestampRaw = parsed.timestamp || txData.timestamp;
                const safeRaw =
                  typeof timestampRaw === "number" ? timestampRaw : Date.now();
                const safeTimestamp =
                  safeRaw < 100_000_000_000 ? safeRaw * 1000 : safeRaw;

                return {
                  hash: ref.hash,
                  type: txType as "in" | "out",
                  amount,
                  token,
                  contractAddress,
                  address: counterparty,
                  timestamp: safeTimestamp,
                  status: "confirmed" as const,
                  epoch: txData.epoch || ref.epoch || parsed.epoch,
                  ou: parsed.ou || txData.ou || "10000",
                  fee: parsed.fee,
                };
              } catch (e: any) {
                console.warn(
                  `[useTransactionHistory] Failed to fetch tx ${ref.hash}:`,
                  e.message,
                );
                return null;
              }
            }),
          );

          newConfirmedTxs.push(...(results.filter(Boolean) as Transaction[]));
        }

        if (newConfirmedTxs.length > 0) {
          await saveTxHistory(newConfirmedTxs, network, addr);
        }
      } catch (error) {
        console.error("[useTransactionHistory] fetchAndMerge failed:", error);
      }
    },
    [wallet?.address, rpcClient, password, settings.network],
  );

  const refreshTransactions = useCallback(
    async (opts: { force?: boolean } = {}): Promise<void> => {
      if (!wallet?.address) return;
      const addr = wallet.address;
      const network = settings.network || "mainnet";

      if (!opts.force) {
        const last = lastTxRefreshAt.current.get(addr) ?? 0;
        if (Date.now() - last < TX_REFRESH_MIN_SPACING) {
          logInfo(
            `[useTransactionHistory] Skipping (${Math.round((Date.now() - last) / 1000)}s since last)`,
          );
          return;
        }
        const inflight = inflightTxRefresh.current.get(addr);
        if (inflight) return inflight;
      }

      const promise = (async () => {
        try {
          const hasStorage =
            (await loadTxHistoryAsync(network, addr, 1)).length > 0;
          const fetchLimit = hasStorage
            ? INCREMENTAL_TX_CHECK
            : INITIAL_TX_FETCH;

          await fetchAndMerge(fetchLimit);
          await renderDisplay(displayLimitRef.current);
          lastTxRefreshAt.current.set(addr, Date.now());
        } finally {
          inflightTxRefresh.current.delete(addr);
        }
      })();

      if (!opts.force) {
        inflightTxRefresh.current.set(addr, promise);
      }
      return promise;
    },
    [wallet?.address, fetchAndMerge, renderDisplay, settings.network],
  );

  const loadMoreTransactions = useCallback(async (): Promise<void> => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    const newLimit = displayLimitRef.current + DISPLAY_PAGE;
    setDisplayLimit(newLimit);
    displayLimitRef.current = newLimit;

    try {
      if (
        newLimit > storedCountRef.current &&
        storedCountRef.current < totalOnChainRef.current
      ) {
        await fetchAndMerge(LOAD_MORE_FETCH);
      }
      await renderDisplay(newLimit);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, fetchAndMerge, renderDisplay]);

  useEffect(() => {
    setTransactions([]);

    if (!wallet?.address) return;
    setDisplayLimit(DISPLAY_PAGE);
    displayLimitRef.current = DISPLAY_PAGE;
    setStoredCount(0);
    storedCountRef.current = 0;
    setTotalOnChain(0);
    totalOnChainRef.current = 0;
    const network = settings.network || "mainnet";

    pruneExpiredPendingTxs(network, wallet.address, wallet.evmAddress).catch(
      () => {},
    );

    let cancelled = false;
    const updateFromStorage = async () => {
      try {
        const stored = await loadTxHistoryAsync(network, wallet.address, 1000);
        if (!cancelled) {
          const sorted = stored.sort(
            (a, b) => Number(b.timestamp) - Number(a.timestamp),
          );
          setStoredCount(stored.length);
          storedCountRef.current = stored.length;

          const slice = sorted.slice(0, displayLimitRef.current);
          setTransactions((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(slice)) return prev;
            return slice;
          });
        }
      } catch {
        /* ignore */
      }
    };

    updateFromStorage();

    const interval = setInterval(updateFromStorage, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet?.address, settings.network]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    transactions,
    hasMoreTxs,
    isLoadingMore,
    setTransactions,
    refreshTransactions,
    loadMoreTransactions,
  };
}
