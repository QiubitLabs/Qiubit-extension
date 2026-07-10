import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { logInfo } from "../utils/logger";
import { ethers } from "ethers";
import { Wallet, Token } from "../types";
import { WalletService } from "../services/core/WalletService";
import { SessionService } from "../services/core/SessionService";
import { saveWalletsSecure } from "../utils/storage";
import { loadSnapshot, saveSnapshot } from "../utils/walletSnapshot";
import { evmBalanceCache } from "../utils/evmBalanceCache";
import { withEvmFallbackForNetwork } from "../utils/evmProvider";
import { getEvmTokensForNetwork, EVM_NETWORKS } from "../constants/evmNetworks";
import { discoverAllChainTokens } from "../services/network/TokenDiscoveryService";
import { NETWORK_REGISTRY } from "../constants/networks/registry";
import { getUserNetworksSync } from "../services/network/UserNetworkService";
import { getCustomTokens } from "../services/features/CustomTokenService";
import { getRpcList } from "../config/rpcEndpoints";
import { solanaRpc } from "../services/network/SolanaRpcService";
import { suiRpc } from "../services/network/SuiRpcService";
import { bitcoinRpc } from "../services/network/BitcoinRpcService";

/**
 * Fetch Solana balance using SolanaRpcService
 */
async function fetchSolanaBalance(solanaAddress: string): Promise<string> {
  return solanaRpc.getBalance(solanaAddress);
}

/**
 * Fetch Sui balance using SuiRpcService
 */
async function fetchSuiBalance(suiAddress: string): Promise<string> {
  return suiRpc.getBalance(suiAddress);
}

/**
 * Fetch Bitcoin balance using BitcoinRpcService
 */
async function fetchBitcoinBalance(bitcoinAddress: string): Promise<string> {
  return bitcoinRpc.getBalance(bitcoinAddress);
}

const MIN_REFRESH_SPACING_MANUAL = 3_000; // 3s — block rapid manual refresh spam
const MIN_REFRESH_SPACING_AUTO = 5 * 60_000; // 5min — auto refresh only if last fetch > 5min
const AUTO_INTERVAL_MS = 5 * 60_000; // 5min — auto-refresh interval

const WALLET_ADDR_BY_VM: Record<string, (w: Wallet) => string | undefined> = {
  octra: (w) => w.address,
  evm: (w) => w.evmAddress,
  solana: (w) => w.solanaAddress,
  sui: (w) => w.suiAddress,
  bitcoin: (w) => w.bitcoinAddress,
};

const VM_FLAGS: Record<string, Partial<Token>> = {
  evm: { isEVM: true },
  solana: { isSolana: true },
  sui: { isSui: true },
  bitcoin: { isBitcoin: true },
  octra: {},
};

function buildDefaultTokens(wallet: Wallet): Token[] {
  const tokens: Token[] = [];

  for (const net of Object.values(NETWORK_REGISTRY)) {
    const ownerFn = WALLET_ADDR_BY_VM[net.addressType];
    if (!ownerFn || !ownerFn(wallet)) continue;

    const vmFlags = VM_FLAGS[net.addressType] ?? {};

    if (net.addressType === "octra") {
      tokens.push({
        symbol: "OCT",
        name: "Octra",
        balance: "0",
        isNative: true,
        vm: "octra",
        chainId: 9048201,
        decimals: 6,
      });
      continue;
    }

    if (net.nativeToken) {
      const { symbol, name, decimals, logoUrl } = net.nativeToken;
      const extra: Partial<Token> = {};
      if (net.addressType === "sui") extra.contractAddress = "sui";
      if (net.addressType === "bitcoin") extra.contractAddress = "bitcoin";
      tokens.push({
        symbol,
        name,
        balance: "0",
        isNative: false,
        vm: net.addressType as any,
        ...vmFlags,
        isTestnet: net.isTestnet || undefined,
        chainId: net.chainId ?? undefined,
        logoUrl,
        decimals,
        ...extra,
      });
    }

    for (const erc20 of net.erc20Tokens ?? []) {
      tokens.push({
        symbol: erc20.symbol,
        name: erc20.name,
        balance: "0",
        isNative: false,
        vm: net.addressType as any,
        ...vmFlags,
        isTestnet: net.isTestnet || undefined,
        chainId: net.chainId ?? undefined,
        logoUrl: erc20.logoUrl,
        decimals: erc20.decimals,
        contractAddress: erc20.contractAddress,
      });
    }
  }

  // Native token for each user-added custom EVM chain (Pharos, testnets, …)
  if (wallet.evmAddress) {
    const builtinChainIds = new Set(
      Object.values(NETWORK_REGISTRY)
        .map((n) => n.chainId)
        .filter(Boolean),
    );
    for (const un of getUserNetworksSync()) {
      if (builtinChainIds.has(un.chainIdDecimal)) continue;
      tokens.push({
        symbol: un.nativeCurrency?.symbol || "ETH",
        name: un.nativeCurrency?.name || un.chainName,
        balance: "0",
        isNative: false,
        isEVM: true,
        vm: "evm",
        chainId: un.chainIdDecimal,
        decimals: un.nativeCurrency?.decimals ?? 18,
        logoUrl: un.iconUrls?.[0] ?? "/eth-icon.svg",
        isTestnet:
          /test|sepolia|goerli|mumbai|fuji|chapel/i.test(un.chainName) ||
          undefined,
      });
    }
  }

  return tokens.map((t) => ({ ...t, ownerAddress: wallet.address }));
}

function getNativeSymbol(chainId: number): string {
  if (chainId === 1) return "ETH";
  if (chainId === 56) return "BNB";
  if (chainId === 137) return "POL";
  if (chainId === 8453) return "ETH";
  if (chainId === 42161) return "ETH";
  if (chainId === 999) return "HYPE";
  if (chainId === 143) return "MON";
  if (chainId === 11155111) return "ETH";
  return "ETH";
}

interface UseWalletDataProps {
  wallet: Wallet | null;
  wallets: Wallet[];
  isUnlocked: boolean;
  password: string | null;
  network: string;
  setWallets: (wallets: Wallet[]) => void;
  extendSession: () => void;
}

export function useWalletData({
  wallet,
  wallets,
  isUnlocked,
  password,
  network,
  setWallets,
  extendSession,
}: UseWalletDataProps) {
  interface WalletStateData {
    address: string | null;
    balance: number;
    nonce: number;
    tokens: Token[];
  }

  const [walletState, setWalletState] = useState<WalletStateData>({
    address: null,
    balance: 0,
    nonce: 0,
    tokens: [],
  });

  const [privacyBalance, setPrivacyBalance] = useState<any>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);

  const loadedAddress = walletState.address;
  const balance = walletState.balance;
  const nonce = walletState.nonce;
  const tokens = walletState.tokens;

  const setBalance = useCallback((b: number | ((prev: number) => number)) => {
    setWalletState((prev) => {
      const newVal = typeof b === "function" ? b(prev.balance) : b;
      return { ...prev, balance: newVal };
    });
  }, []);

  const setNonce = useCallback((n: number | ((prev: number) => number)) => {
    setWalletState((prev) => {
      const newVal = typeof n === "function" ? n(prev.nonce) : n;
      return { ...prev, nonce: newVal };
    });
  }, []);

  const setTokens = useCallback((t: Token[] | ((prev: Token[]) => Token[])) => {
    setWalletState((prev) => {
      const newVal = typeof t === "function" ? t(prev.tokens) : t;
      return { ...prev, tokens: newVal };
    });
  }, []);

  const activeAddressRef = useRef(wallet?.address);
  const walletsRef = useRef(wallets);
  const passwordRef = useRef(password);
  const balanceRef = useRef(balance);
  const nonceRef = useRef(nonce);
  const tokensRef = useRef(tokens);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const activeAddress = wallet?.address || "";
  const isOutOfSync = loadedAddress !== activeAddress;

  let displayBalance = balance;
  let displayNonce = nonce;
  let displayTokens = tokens;

  const syncedDisplayRef = useRef<{
    address: string;
    balance: number;
    nonce: number;
    tokens: Token[];
  } | null>(null);

  if (isOutOfSync && activeAddress) {
    if (syncedDisplayRef.current?.address !== activeAddress) {
      const snap = loadSnapshot(activeAddress);
      if (snap) {
        syncedDisplayRef.current = {
          address: activeAddress,
          balance: snap.balance,
          nonce: snap.nonce,
          tokens: snap.tokens.map((t) => ({
            ...t,
            ownerAddress: activeAddress,
          })),
        };
      } else {
        syncedDisplayRef.current = {
          address: activeAddress,
          balance: 0,
          nonce: 0,
          tokens: wallet ? buildDefaultTokens(wallet) : [],
        };
      }
    }
    displayBalance = syncedDisplayRef.current.balance;
    displayNonce = syncedDisplayRef.current.nonce;
    displayTokens = syncedDisplayRef.current.tokens;
  } else {
    syncedDisplayRef.current = null;
  }

  activeAddressRef.current = wallet?.address;
  walletsRef.current = wallets;
  passwordRef.current = password;
  balanceRef.current = displayBalance;
  nonceRef.current = displayNonce;
  tokensRef.current = displayTokens;

  useEffect(() => {
    if (!wallet?.address) {
      setWalletState({
        address: null,
        balance: 0,
        nonce: 0,
        tokens: [],
      });
      setPrivacyBalance(null);
      setIsRefreshing(false);
      setIsLoadingTokens(false);
      return;
    }

    const snap = loadSnapshot(wallet.address);
    if (snap) {
      setWalletState({
        address: wallet.address,
        balance: snap.balance,
        nonce: snap.nonce,
        tokens: snap.tokens.map((t) => ({
          ...t,
          ownerAddress: wallet.address,
        })),
      });
      setPrivacyBalance(null);
      setIsRefreshing(false);
      setIsLoadingTokens(false);
    } else {
      setWalletState({
        address: wallet.address,
        balance: 0,
        nonce: 0,
        tokens: buildDefaultTokens(wallet),
      });
      setPrivacyBalance(null);
      setIsRefreshing(true);
      setIsLoadingTokens(true);
    }
  }, [wallet?.address]);

  const suppressEvmEvents = useRef(false);

  const refreshCount = useRef(0);

  const lastRefreshAt = useRef<Map<string, number>>(new Map());
  const inflightRefresh = useRef<Map<string, Promise<void>>>(new Map());

  const refreshAll = useCallback(
    async (
      mode: "public" | "private" | "both" = "both",
      opts: { force?: boolean; auto?: boolean } = {},
    ) => {
      const address = activeAddressRef.current;
      const currentWallet = walletsRef.current.find(
        (w) => w.address === address,
      );
      if (!address || !isUnlocked || !currentWallet) return;

      const evmAddress = currentWallet.evmAddress;
      const coalesceKey = `${address}:${mode}`;

      const existing = inflightRefresh.current.get(coalesceKey);
      if (existing) return existing;

      if (!opts.force) {
        const last = lastRefreshAt.current.get(coalesceKey) ?? 0;
        const since = Date.now() - last;
        const minSpacing = opts.auto
          ? MIN_REFRESH_SPACING_AUTO
          : MIN_REFRESH_SPACING_MANUAL;
        if (since < minSpacing) {
          logInfo(
            `[useWalletData] Skipping refresh (${Math.round(since / 1000)}s since last, min ${minSpacing / 1000}s)`,
          );
          return;
        }
      }

      if (mode === "both" || mode === "public") {
        setIsRefreshing(true);
        setIsLoadingTokens(true);
      }

      const fetchNative = async () => {
        try {
          const details = await WalletService.getBalance(address, opts.force);
          if (isMounted.current && address === activeAddressRef.current) {
            const finalBalance =
              details.balance && details.balance > 0 ? details.balance : 0;
            setBalance(finalBalance);
            setNonce(details.nonce);
            saveSnapshot(address, {
              balance: finalBalance,
              nonce: details.nonce,
              tokens: tokensRef.current,
            });

            if (typeof chrome !== "undefined" && chrome.storage?.local) {
              const result = await chrome.storage.local.get("balances");
              const currentBalances = (result.balances || {}) as Record<
                string,
                string
              >;
              currentBalances[address] = String(details.balance);
              await chrome.storage.local.set({ balances: currentBalances });
            }

            await SessionService.syncActiveWalletToBackground(address, network);
          }
          return details.balance;
        } catch (e) {
          console.error("Failed to fetch native balance", e);
          return 0;
        } finally {
          if (
            isMounted.current &&
            address === activeAddressRef.current &&
            (mode === "public" || mode === "both")
          ) {
            setIsRefreshing(false);
          }
        }
      };

      const fetchTokens = async (nativeBalance: number) => {
        suppressEvmEvents.current = true;
        try {
          const tokenList = await WalletService.getTokens(address);
          if (
            isMounted.current &&
            address === activeAddressRef.current &&
            currentWallet
          ) {
            const networkMeta = NETWORK_REGISTRY[network];
            const evmNetworkName =
              networkMeta?.isEVM && EVM_NETWORKS[network]
                ? network
                : "ethereum";
            const evmChainId = EVM_NETWORKS[evmNetworkName]?.chainId ?? 1;
            const defaultConfigs = getEvmTokensForNetwork(evmNetworkName);

            const allUserCustomTokens = await getCustomTokens(address).catch(
              () => [],
            );

            const isOscScamToken = (t: {
              symbol: string;
              chainId?: number;
            }) => {
              const isEth = t.chainId === 1;
              const isOsc =
                typeof t.symbol === "string" &&
                (t.symbol.toUpperCase() === "OSC01" ||
                  t.symbol.toUpperCase() === "OCS01" ||
                  t.symbol.toUpperCase() === "OSC" ||
                  t.symbol.toUpperCase() === "OCS" ||
                  t.symbol.toUpperCase() === "OSCT");
              return isEth && isOsc;
            };

            setTokens((prev) => {
              const filteredPrev = prev.filter(
                (t) => t.ownerAddress === address,
              );
              const next = [...filteredPrev];
              let changed = false;
              for (const ct of allUserCustomTokens) {
                if (isOscScamToken(ct)) continue;
                const exists = next.some(
                  (t) =>
                    t.contractAddress?.toLowerCase() ===
                      ct.contractAddress.toLowerCase() &&
                    t.chainId === ct.chainId,
                );
                if (!exists) {
                  const isSol = ct.chainId === 1151111081099710;
                  const isSui = ct.chainId === 9270000000000000;
                  next.push({
                    symbol: ct.symbol,
                    name: ct.name,
                    balance: "0",
                    isNative: false,
                    isEVM: !isSol && !isSui,
                    isSolana: isSol || undefined,
                    isSui: isSui || undefined,
                    vm: isSol ? "solana" : isSui ? "sui" : "evm",
                    chainId: ct.chainId,
                    logoUrl: ct.logoUrl || undefined,
                    decimals: ct.decimals,
                    contractAddress: ct.contractAddress,
                    ownerAddress: address,
                  });
                  changed = true;
                }
              }

              const defaults = buildDefaultTokens(currentWallet);
              for (const dt of defaults) {
                if (isOscScamToken(dt)) continue;
                const exists = next.some(
                  (t) =>
                    (!dt.contractAddress &&
                      !t.contractAddress &&
                      t.symbol === dt.symbol &&
                      t.chainId === dt.chainId) ||
                    (dt.contractAddress &&
                      t.contractAddress &&
                      t.contractAddress.toLowerCase() ===
                        dt.contractAddress.toLowerCase() &&
                      t.chainId === dt.chainId),
                );
                if (!exists) {
                  next.push({ ...dt, ownerAddress: address });
                  changed = true;
                }
              }

              for (const t of tokenList) {
                if (isOscScamToken(t) || t.symbol === "OCT") continue;
                const idx = next.findIndex(
                  (x) =>
                    (!t.contractAddress &&
                      !x.contractAddress &&
                      x.symbol === t.symbol &&
                      x.chainId === t.chainId) ||
                    (t.contractAddress &&
                      x.contractAddress &&
                      x.contractAddress.toLowerCase() ===
                        t.contractAddress.toLowerCase() &&
                      x.chainId === t.chainId),
                );
                if (idx === -1) {
                  next.push({ ...t, ownerAddress: address });
                  changed = true;
                } else if (next[idx].balance !== t.balance) {
                  next[idx] = { ...next[idx], balance: t.balance };
                  changed = true;
                }
              }

              const nextWithAddress = next.map((t) => ({
                ...t,
                ownerAddress: address,
              }));
              if (changed) {
                saveSnapshot(address, {
                  tokens: nextWithAddress,
                  balance: balanceRef.current,
                  nonce: nonceRef.current,
                });
                return nextWithAddress;
              }
              return filteredPrev.length !== prev.length
                ? nextWithAddress
                : prev;
            });

            const updateSingleToken = (
              match: (t: Token) => boolean,
              fields: Partial<Token>,
            ) => {
              if (!isMounted.current || address !== activeAddressRef.current)
                return;
              setTokens((prev) => {
                const filteredPrev = prev.filter(
                  (t) => t.ownerAddress === address,
                );
                const next = [...filteredPrev];
                const idx = next.findIndex(match);
                if (idx >= 0) {
                  const current = next[idx];
                  let changed = false;
                  for (const key of Object.keys(fields) as (keyof Token)[]) {
                    if (current[key] !== fields[key]) {
                      changed = true;
                      break;
                    }
                  }
                  if (changed) {
                    next[idx] = {
                      ...current,
                      ...fields,
                      ownerAddress: address,
                    };
                    const nextWithAddress = next.map((t) => ({
                      ...t,
                      ownerAddress: address,
                    }));
                    saveSnapshot(address, {
                      tokens: nextWithAddress,
                      balance: balanceRef.current,
                      nonce: nonceRef.current,
                    });
                    return nextWithAddress;
                  }
                }
                return filteredPrev.length !== prev.length
                  ? next.map((t) => ({ ...t, ownerAddress: address }))
                  : prev;
              });
            };

            const addDiscoveredTokens = (newTokens: Token[]) => {
              if (!isMounted.current || address !== activeAddressRef.current)
                return;
              setTokens((prev) => {
                const filteredPrev = prev.filter(
                  (t) => t.ownerAddress === address,
                );

                const defaults = buildDefaultTokens(currentWallet);
                const isDefault = (t: Token) =>
                  defaults.some(
                    (d) =>
                      (!d.contractAddress &&
                        !t.contractAddress &&
                        d.symbol === t.symbol &&
                        d.chainId === t.chainId) ||
                      (d.contractAddress &&
                        t.contractAddress &&
                        d.contractAddress.toLowerCase() ===
                          t.contractAddress.toLowerCase() &&
                        d.chainId === t.chainId),
                  );

                const isCustom = (t: Token) =>
                  allUserCustomTokens.some(
                    (c) =>
                      c.contractAddress.toLowerCase() ===
                        t.contractAddress?.toLowerCase() &&
                      c.chainId === t.chainId,
                  );

                const next = filteredPrev.filter((t) => {
                  if (isDefault(t) || isCustom(t)) return true;

                  return newTokens.some(
                    (nt) =>
                      nt.contractAddress?.toLowerCase() ===
                        t.contractAddress?.toLowerCase() &&
                      nt.chainId === t.chainId,
                  );
                });

                let changed = next.length !== filteredPrev.length;

                for (const nt of newTokens) {
                  if (isOscScamToken(nt)) continue;
                  const idx = next.findIndex(
                    (t) =>
                      (t.contractAddress &&
                        nt.contractAddress &&
                        t.contractAddress.toLowerCase() ===
                          nt.contractAddress.toLowerCase() &&
                        t.chainId === nt.chainId) ||
                      (!t.contractAddress &&
                        !nt.contractAddress &&
                        t.symbol === nt.symbol &&
                        t.chainId === nt.chainId),
                  );
                  if (idx === -1) {
                    next.push({ ...nt, ownerAddress: address });
                    changed = true;
                  } else if (next[idx].balance !== nt.balance) {
                    next[idx] = {
                      ...next[idx],
                      balance: nt.balance,
                      ownerAddress: address,
                    };
                    changed = true;
                  }
                }

                const nextWithAddress = next.map((t) => ({
                  ...t,
                  ownerAddress: address,
                }));
                if (changed) {
                  saveSnapshot(address, {
                    tokens: nextWithAddress,
                    balance: balanceRef.current,
                    nonce: nonceRef.current,
                  });
                  return nextWithAddress;
                }
                return filteredPrev.length !== prev.length
                  ? nextWithAddress
                  : prev;
              });
            };

            updateSingleToken(
              (t) => t.isNative === true || t.symbol === "OCT",
              {
                balance:
                  nativeBalance && nativeBalance > 0
                    ? String(nativeBalance)
                    : "0",
              },
            );

            const userCustomTokens = allUserCustomTokens.filter(
              (t) => t.chainId === evmChainId,
            );
            const evmErc20Configs = [
              ...defaultConfigs,
              ...userCustomTokens
                .filter(
                  (t) =>
                    !defaultConfigs.some(
                      (d) =>
                        d.contractAddress.toLowerCase() ===
                        t.contractAddress.toLowerCase(),
                    ),
                )
                .map((t) => ({
                  symbol: t.symbol,
                  name: t.name,
                  contractAddress: t.contractAddress,
                  decimals: t.decimals,
                  logoUrl: t.logoUrl,
                })),
            ];

            const activeEvmNativePromise = (async () => {
              if (!evmAddress || address !== activeAddressRef.current) return;
              const ethKey = `${evmChainId}:${evmAddress.toLowerCase()}:native`;
              try {
                const ethVal = await evmBalanceCache.swr(
                  ethKey,
                  async () => {
                    const wei = await withEvmFallbackForNetwork(
                      evmNetworkName,
                      (p) => p.getBalance(evmAddress),
                    );
                    return parseFloat(
                      parseFloat(ethers.formatEther(wei)).toFixed(8),
                    ).toString();
                  },
                  opts.force,
                );

                if (address !== activeAddressRef.current) return;
                updateSingleToken(
                  (t) =>
                    t.isEVM === true &&
                    t.chainId === evmChainId &&
                    !t.contractAddress &&
                    t.symbol === getNativeSymbol(evmChainId),
                  { balance: ethVal },
                );
              } catch (e) {
                if (address !== activeAddressRef.current) return;
                const cached = evmBalanceCache.getAny(ethKey) ?? "0";
                updateSingleToken(
                  (t) =>
                    t.isEVM === true &&
                    t.chainId === evmChainId &&
                    !t.contractAddress &&
                    t.symbol === getNativeSymbol(evmChainId),
                  { balance: cached },
                );
              }
            })();

            // Fetch every ERC-20 balance for the active chain in ONE Multicall3
            // eth_call instead of one RPC call per token. Falls back to cached
            // values if the multicall fails.
            const applyErc20Balance = (cfg: any, val: string) => {
              updateSingleToken(
                (t) =>
                  t.isEVM === true &&
                  t.chainId === evmChainId &&
                  t.contractAddress?.toLowerCase() ===
                    cfg.contractAddress.toLowerCase(),
                { balance: val },
              );
            };
            const activeEvmErc20Promises =
              evmAddress && evmErc20Configs.length > 0
                ? [
                    (async () => {
                      if (address !== activeAddressRef.current) return;
                      try {
                        const { fetchBalancesMulticall } =
                          await import("../services/network/MulticallService");
                        const { getEvmReadProviderForNetwork } =
                          await import("../utils/evmProvider");
                        const provider =
                          getEvmReadProviderForNetwork(evmNetworkName);
                        const res = await fetchBalancesMulticall(
                          provider,
                          evmAddress,
                          evmErc20Configs.map((c) => ({
                            contractAddress: c.contractAddress,
                            decimals: c.decimals,
                          })),
                        );
                        if (address !== activeAddressRef.current) return;
                        for (const cfg of evmErc20Configs) {
                          const raw = res.tokens[cfg.contractAddress.toLowerCase()];
                          if (raw === undefined) continue;
                          const formatted = Number(raw).toFixed(
                            cfg.decimals > 6 ? 4 : 2,
                          );
                          evmBalanceCache.set(
                            `${evmChainId}:${evmAddress.toLowerCase()}:erc20:${cfg.contractAddress}`,
                            formatted,
                          );
                          applyErc20Balance(cfg, formatted);
                        }
                      } catch {
                        // Multicall failed — show last cached values.
                        if (address !== activeAddressRef.current) return;
                        for (const cfg of evmErc20Configs) {
                          const cached =
                            evmBalanceCache.getAny(
                              `${evmChainId}:${evmAddress.toLowerCase()}:erc20:${cfg.contractAddress}`,
                            ) ?? "0";
                          applyErc20Balance(cfg, cached);
                        }
                      }
                    })(),
                  ]
                : [];

            const allSupportedChainIds = [
              1, 56, 137, 8453, 42161, 143, 999, 11155111,
            ];
            const otherChainNativePromises = evmAddress
              ? allSupportedChainIds
                  .filter(
                    (id) => id !== evmChainId && getRpcList(id).length > 0,
                  )
                  .map(async (chainId) => {
                    if (address !== activeAddressRef.current) return;
                    const rpcs = getRpcList(chainId);
                    const cacheKey = `${chainId}:${evmAddress.toLowerCase()}:native`;
                    try {
                      const val = await evmBalanceCache.swr(
                        cacheKey,
                        async () => {
                          let lastErr: unknown;
                          for (const rpcUrl of rpcs) {
                            try {
                              const provider = new ethers.JsonRpcProvider(
                                rpcUrl,
                              );
                              const wei = await provider.getBalance(evmAddress);
                              return parseFloat(
                                parseFloat(ethers.formatEther(wei)).toFixed(8),
                              ).toString();
                            } catch (e) {
                              lastErr = e;
                            }
                          }
                          throw lastErr;
                        },
                        opts.force,
                      );

                      if (address !== activeAddressRef.current) return;
                      updateSingleToken(
                        (t) =>
                          t.isEVM === true &&
                          t.chainId === chainId &&
                          !t.contractAddress,
                        { balance: val },
                      );
                    } catch {
                      if (address !== activeAddressRef.current) return;
                      const cached = evmBalanceCache.getAny(cacheKey) ?? "0";
                      updateSingleToken(
                        (t) =>
                          t.isEVM === true &&
                          t.chainId === chainId &&
                          !t.contractAddress,
                        { balance: cached },
                      );
                    }
                  })
              : [];

            const otherChainTokensByChain = new Map<
              number,
              typeof allUserCustomTokens
            >();
            for (const ct of allUserCustomTokens) {
              if (ct.chainId === evmChainId) continue;
              const arr = otherChainTokensByChain.get(ct.chainId) ?? [];
              arr.push(ct);
              otherChainTokensByChain.set(ct.chainId, arr);
            }
            const otherChainErc20Promises: Promise<void>[] = [];
            if (evmAddress) {
              otherChainTokensByChain.forEach((tokens, chainId) => {
                const rpcs = getRpcList(chainId);
                if (!rpcs.length) return;
                for (const ct of tokens) {
                  if (address !== activeAddressRef.current) return;
                  const cacheKey = `${chainId}:${evmAddress.toLowerCase()}:erc20:${ct.contractAddress}`;
                  const erc20Abi = [
                    "function balanceOf(address owner) view returns (uint256)",
                  ];
                  const p = (async () => {
                    try {
                      const bal = await evmBalanceCache.swr(
                        cacheKey,
                        async () => {
                          let lastErr: unknown;
                          for (const rpcUrl of rpcs) {
                            try {
                              const provider = new ethers.JsonRpcProvider(
                                rpcUrl,
                              );
                              const contract = new ethers.Contract(
                                ct.contractAddress,
                                erc20Abi,
                                provider,
                              );
                              const b = await contract.balanceOf(evmAddress);
                              return Number(
                                ethers.formatUnits(b, ct.decimals),
                              ).toFixed(ct.decimals > 6 ? 4 : 2);
                            } catch (e) {
                              lastErr = e;
                            }
                          }
                          throw lastErr;
                        },
                        opts.force,
                      );

                      if (address !== activeAddressRef.current) return;
                      updateSingleToken(
                        (t) =>
                          t.isEVM === true &&
                          t.chainId === chainId &&
                          t.contractAddress?.toLowerCase() ===
                            ct.contractAddress.toLowerCase(),
                        { balance: bal },
                      );
                    } catch {
                      if (address !== activeAddressRef.current) return;
                      const cached = evmBalanceCache.getAny(cacheKey) ?? "0";
                      updateSingleToken(
                        (t) =>
                          t.isEVM === true &&
                          t.chainId === chainId &&
                          t.contractAddress?.toLowerCase() ===
                            ct.contractAddress.toLowerCase(),
                        { balance: cached },
                      );
                    }
                  })();
                  otherChainErc20Promises.push(p);
                }
              });
            }

            const solanaPromise = (async () => {
              if (
                !currentWallet.solanaAddress ||
                address !== activeAddressRef.current
              )
                return;
              const solAddr = currentWallet.solanaAddress;
              const solKey = `solana:${solAddr.toLowerCase()}:native`;

              const nativeP = (async () => {
                try {
                  const solanaBalanceStr = await evmBalanceCache.swr(
                    solKey,
                    async () => {
                      return await fetchSolanaBalance(solAddr);
                    },
                    opts.force,
                  );
                  if (address === activeAddressRef.current) {
                    updateSingleToken(
                      (t) => t.isSolana === true && !t.contractAddress,
                      { balance: solanaBalanceStr },
                    );
                  }
                } catch {
                  if (address === activeAddressRef.current) {
                    const cached = evmBalanceCache.getAny(solKey) ?? "0";
                    updateSingleToken(
                      (t) => t.isSolana === true && !t.contractAddress,
                      { balance: cached },
                    );
                  }
                }
              })();

              const customSols = tokensRef.current.filter(
                (t) =>
                  t.isSolana === true &&
                  t.contractAddress &&
                  t.contractAddress !== "solana",
              );
              // ALL SPL balances in one getTokenAccountsByOwner call, not one
              // per mint.
              const splAllP = (async () => {
                if (customSols.length === 0) return;
                try {
                  const all = await solanaRpc.getAllTokenBalances(solAddr);
                  const byMint = new Map(all.map((a) => [a.mint, a.balance]));
                  if (address !== activeAddressRef.current) return;
                  for (const token of customSols) {
                    const mint = token.contractAddress!;
                    const bal = byMint.get(mint) ?? "0";
                    evmBalanceCache.set(
                      `solana:${solAddr.toLowerCase()}:spl:${mint}`,
                      bal,
                    );
                    updateSingleToken(
                      (t) => t.isSolana === true && t.contractAddress === mint,
                      { balance: bal },
                    );
                  }
                } catch {
                  if (address !== activeAddressRef.current) return;
                  for (const token of customSols) {
                    const mint = token.contractAddress!;
                    const cached =
                      evmBalanceCache.getAny(
                        `solana:${solAddr.toLowerCase()}:spl:${mint}`,
                      ) ?? "0";
                    updateSingleToken(
                      (t) => t.isSolana === true && t.contractAddress === mint,
                      { balance: cached },
                    );
                  }
                }
              })();

              await Promise.allSettled([nativeP, splAllP]);
            })();

            const suiPromise = (async () => {
              if (
                !currentWallet.suiAddress ||
                address !== activeAddressRef.current
              )
                return;
              const suiAddr = currentWallet.suiAddress;
              const suiKey = `sui:${suiAddr.toLowerCase()}:native`;

              const nativeP = (async () => {
                try {
                  const suiBalanceStr = await evmBalanceCache.swr(
                    suiKey,
                    async () => {
                      return await fetchSuiBalance(suiAddr);
                    },
                    opts.force,
                  );
                  if (address === activeAddressRef.current) {
                    updateSingleToken(
                      (t) => t.isSui === true && t.contractAddress === "sui",
                      { balance: suiBalanceStr },
                    );
                  }
                } catch {
                  if (address === activeAddressRef.current) {
                    const cached = evmBalanceCache.getAny(suiKey) ?? "0";
                    updateSingleToken(
                      (t) => t.isSui === true && t.contractAddress === "sui",
                      { balance: cached },
                    );
                  }
                }
              })();

              const customSuis = tokensRef.current.filter(
                (t) =>
                  t.isSui === true &&
                  t.contractAddress &&
                  t.contractAddress !== "sui",
              );
              // ALL Sui coin balances in one suix_getAllBalances call.
              const coinAllP = (async () => {
                if (customSuis.length === 0) return;
                try {
                  const all = await suiRpc.getAllBalances(suiAddr);
                  const byType = new Map(
                    all.map((a) => [a.coinType, a.balance]),
                  );
                  if (address !== activeAddressRef.current) return;
                  for (const token of customSuis) {
                    const coinType = token.contractAddress!;
                    const dec = token.decimals ?? 9;
                    const raw = byType.get(coinType);
                    const val =
                      raw !== undefined
                        ? (parseFloat(raw) / Math.pow(10, dec)).toFixed(4)
                        : "0";
                    evmBalanceCache.set(
                      `sui:${suiAddr.toLowerCase()}:coin:${coinType}`,
                      val,
                    );
                    updateSingleToken(
                      (t) => t.isSui === true && t.contractAddress === coinType,
                      { balance: val },
                    );
                  }
                } catch {
                  if (address !== activeAddressRef.current) return;
                  for (const token of customSuis) {
                    const coinType = token.contractAddress!;
                    const cached =
                      evmBalanceCache.getAny(
                        `sui:${suiAddr.toLowerCase()}:coin:${coinType}`,
                      ) ?? "0";
                    updateSingleToken(
                      (t) => t.isSui === true && t.contractAddress === coinType,
                      { balance: cached },
                    );
                  }
                }
              })();

              await Promise.allSettled([nativeP, coinAllP]);
            })();

            const bitcoinPromise = (async () => {
              if (
                !currentWallet.bitcoinAddress ||
                address !== activeAddressRef.current
              )
                return;
              const btcKey = `bitcoin:${currentWallet.bitcoinAddress.toLowerCase()}:native`;
              try {
                const btcBalanceStr = await evmBalanceCache.swr(
                  btcKey,
                  async () => {
                    return await fetchBitcoinBalance(
                      currentWallet.bitcoinAddress!,
                    );
                  },
                  opts.force,
                );

                if (address !== activeAddressRef.current) return;
                updateSingleToken((t) => t.isBitcoin === true, {
                  balance: btcBalanceStr,
                });
              } catch (e) {
                if (address !== activeAddressRef.current) return;
                const cached = evmBalanceCache.getAny(btcKey) ?? "0";
                updateSingleToken((t) => t.isBitcoin === true, {
                  balance: cached,
                });
              }
            })();

            const discoveryPromise = (async () => {
              if (!evmAddress || address !== activeAddressRef.current) return;
              try {
                const allDiscovered = await discoverAllChainTokens(
                  evmAddress,
                  opts.force,
                ).catch(() => []);
                if (address !== activeAddressRef.current) return;
                const discoveredTokensMapped: Token[] = allDiscovered.map(
                  (t) => ({
                    symbol: t.symbol,
                    name: t.name,
                    balance: t.balance,
                    isNative: false,
                    isEVM: true,
                    chainId: t.chainId,
                    logoUrl: t.logoUrl ?? undefined,
                    decimals: t.decimals,
                    contractAddress: t.contractAddress,
                  }),
                );
                addDiscoveredTokens(discoveredTokensMapped);
              } catch (e) {
                console.warn("Failed to discover tokens", e);
              }
            })();

            await Promise.allSettled([
              activeEvmNativePromise,
              ...activeEvmErc20Promises,
              ...otherChainNativePromises,
              ...otherChainErc20Promises,
              solanaPromise,
              suiPromise,
              bitcoinPromise,
              discoveryPromise,
            ]);
          }
        } catch (e) {
          console.warn("Failed to fetch tokens", e);
        } finally {
          suppressEvmEvents.current = false;
          if (isMounted.current && address === activeAddressRef.current) {
            setIsLoadingTokens(false);
          }
        }
      };

      const fetchPrivacy = async () => {
        if (!isUnlocked) return;
        try {
          const privacyData = await WalletService.getPrivacyBalance(address);
          if (
            isMounted.current &&
            address === activeAddressRef.current &&
            privacyData
          ) {
            setPrivacyBalance(privacyData);
          }
        } catch (e) {
          console.warn("Failed to fetch privacy balance", e);
        }
      };

      const fetchOtherWallets = async () => {
        try {
          const currentWallets = walletsRef.current;
          const others = currentWallets.filter((w) => w.address !== address);
          if (others.length === 0) return;
          const updatedOthers = await WalletService.refreshBalances(others);

          const freshWallets = walletsRef.current;
          const updatedWallets = freshWallets.map(
            (w) => updatedOthers.find((o) => o.address === w.address) ?? w,
          );

          const hasChanges = updatedOthers.some((updated) => {
            const original = freshWallets.find(
              (w) => w.address === updated.address,
            );
            return (
              original && original.lastKnownBalance !== updated.lastKnownBalance
            );
          });

          if (
            hasChanges &&
            isMounted.current &&
            address === activeAddressRef.current
          ) {
            setWallets(updatedWallets);
            const currentPassword = passwordRef.current;
            if (currentPassword)
              await saveWalletsSecure(updatedWallets, currentPassword);
          }
        } catch (e) {
          console.warn("Failed to refresh other wallets", e);
        }
      };

      const runRefresh = (async () => {
        try {
          const nativeBalance = await fetchNative();
          refreshCount.current += 1;
          const tasks: Promise<any>[] = [
            fetchTokens(nativeBalance),
            fetchPrivacy(),
          ];
          if (opts.force) tasks.push(fetchOtherWallets());
          await Promise.all(tasks);
          lastRefreshAt.current.set(coalesceKey, Date.now());
        } finally {
          inflightRefresh.current.delete(coalesceKey);
        }
      })();
      inflightRefresh.current.set(coalesceKey, runRefresh);
      return runRefresh;
    },
    [isUnlocked, network, setWallets],
  );

  useEffect(() => {
    if (!wallet || !isUnlocked) return;

    const snap = loadSnapshot(wallet.address);
    const snapAge = snap ? Date.now() - snap.ts : Infinity;
    const needsImmediateFetch = !snap || snapAge > MIN_REFRESH_SPACING_AUTO;

    if (needsImmediateFetch && document.visibilityState === "visible") {
      refreshAll("both", { auto: true });
    }

    const jitter = Math.random() * 30_000 - 15_000;
    const intervalTime = AUTO_INTERVAL_MS + jitter;

    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refreshAll("both", { auto: true });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [wallet?.address, isUnlocked, refreshAll]);

  useEffect(() => {
    if (!isUnlocked) return;

    const heartbeat = setInterval(() => {
      extendSession();
      if (wallet?.address) {
        SessionService.syncActiveWalletToBackground(
          wallet.address,
          network,
        ).catch(() => {});
      }
    }, 5000);

    return () => clearInterval(heartbeat);
  }, [isUnlocked, extendSession, wallet?.address, network]);

  useEffect(() => {
    const handleEvmBalanceUpdated = (e: Event) => {
      if (suppressEvmEvents.current) return;

      const ev = e as CustomEvent<{ key: string; value: string }>;
      const { key, value } = ev.detail;

      if (isMounted.current && wallet?.evmAddress && wallet?.address) {
        const lowerEvm = wallet.evmAddress.toLowerCase();
        const address = wallet.address;
        if (key.includes(lowerEvm)) {
          const parts = key.split(":");
          const keyChainId = parseInt(parts[0], 10);
          if (isNaN(keyChainId)) return;

          setTokens((prev) => {
            const filteredPrev = prev.filter((t) => t.ownerAddress === address);
            const newTokens = [...filteredPrev];
            let changed = false;

            const updateToken = (symbol: string, contractAddress?: string) => {
              const idx = newTokens.findIndex(
                (t) =>
                  t.chainId === keyChainId &&
                  (t.symbol === symbol ||
                    (contractAddress &&
                      t.contractAddress?.toLowerCase() ===
                        contractAddress.toLowerCase())),
              );
              if (idx >= 0 && newTokens[idx].balance !== value) {
                newTokens[idx] = {
                  ...newTokens[idx],
                  balance: value,
                  ownerAddress: address,
                };
                changed = true;
              }
            };

            if (key.endsWith(":native")) {
              const nativeSym = getNativeSymbol(keyChainId);
              updateToken(nativeSym);
            } else {
              const erc20Parts = key.split(":erc20:");
              if (erc20Parts.length === 2) {
                const addr = erc20Parts[1];
                updateToken("", addr);
              }
            }

            const nextWithAddress = newTokens.map((t) => ({
              ...t,
              ownerAddress: address,
            }));
            if (changed) {
              saveSnapshot(address, {
                tokens: nextWithAddress,
                balance: balanceRef.current,
                nonce: nonceRef.current,
              });
              return nextWithAddress;
            }
            return filteredPrev.length !== prev.length ? nextWithAddress : prev;
          });
        }
      }
    };

    window.addEventListener("evmBalanceUpdated", handleEvmBalanceUpdated);
    return () =>
      window.removeEventListener("evmBalanceUpdated", handleEvmBalanceUpdated);
  }, [wallet?.address, wallet?.evmAddress]);

  const finalDisplayTokens = useMemo(() => {
    return displayTokens.map((t) =>
      t.isNative === true || t.symbol === "OCT"
        ? { ...t, balance: String(displayBalance) }
        : t,
    );
  }, [displayTokens, displayBalance]);

  return {
    balance: displayBalance,
    nonce: displayNonce,
    tokens: finalDisplayTokens,
    privacyBalance,
    isRefreshing,
    isLoadingTokens,
    refreshAll,
    setBalance,
    setNonce,
    setTokens,
  };
}
