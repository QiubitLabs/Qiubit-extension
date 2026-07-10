import { useState, useEffect, useMemo, useRef } from "react";
import { ethers } from "ethers";
import { NETWORK_REGISTRY } from "../../../constants/networks/registry";
import { keyringService } from "../../../services/core/KeyringService";
import { ChevronDownIcon } from "../../shared/Icons";
import { TokenIcon } from "../../shared/TokenIcon/TokenIcon";
import { Token, Wallet } from "../../../types";
import { formatAmount } from "../../../utils/crypto";
import {
  getMultipleTokenPrices,
  seedTokenPrice,
  formatUsd,
} from "../../../services/network/PriceService";
import {
  addCustomToken,
  fetchTokenMetadata,
} from "../../../services/features/CustomTokenService";
import { saveEvmTxHistory, saveTxHistorySecure } from "../../../utils/storage";
import {
  fetchGasOptions,
  gweiToWei,
  getWorkingTransactionRpc,
} from "../../../utils/evmProvider";
import { getRpcClient } from "../../../services/network/RpcService";
import { SwapConfirmModal } from "./SwapConfirmModal";
import { SwapStatusOverlay } from "./SwapStatusOverlay";
import { TokenSelectorModal } from "./TokenSelectorModal";
import { DEFAULT_TOKENS } from "../../../constants/tokenLists";

const EVM_SWAP_CHAINS = Object.values(NETWORK_REGISTRY)
  .filter((n) => !n.isTestnet && n.chainId !== null && n.id !== "octra")
  .map((n) => ({
    chainId: n.chainId!,
    id: n.id,
    name: n.displayName,
    symbol: n.nativeToken?.symbol ?? "ETH",
    logoUrl: n.iconUrl,
  }));

const ETH_CHAIN =
  EVM_SWAP_CHAINS.find((c) => c.chainId === 1) ?? EVM_SWAP_CHAINS[0];
const BASE_CHAIN = EVM_SWAP_CHAINS.find((c) => c.chainId === 8453) ?? ETH_CHAIN;

const HORIZONTAL_NETWORKS: {
  id: string;
  name: string;
  logoUrl: string;
  chainId?: number;
}[] = [
  { id: "all", name: "All", logoUrl: "" },
  ...Object.values(NETWORK_REGISTRY)
    .filter((n) => !n.isTestnet)
    .map((n) => ({
      id: n.id,
      name: n.shortName || n.displayName,
      logoUrl: n.iconUrl,
      chainId: n.id === "octra" ? 9048201 : (n.chainId ?? undefined),
    })),
];

export interface SwapTabProps {
  wallet: Wallet;
  allTokens: Token[];
  address: string;
  octBalance: number;
  onRefresh: () => void;
  onBridgeTabOpen?: () => void;
  swapStep?: "form" | "submitting" | "waiting" | "success" | "failed";
  setSwapStep?: (
    step: "form" | "submitting" | "waiting" | "success" | "failed",
  ) => void;
  showConfirmModal?: boolean;
  setShowConfirmModal?: (show: boolean) => void;
  onTokenSelectionChange?: (fromToken: any, toToken: any) => void;
}

export function SwapTab({
  wallet,
  allTokens,
  address,
  octBalance,
  onRefresh,
  onBridgeTabOpen,
  swapStep: propSwapStep,
  setSwapStep: propSetSwapStep,
  showConfirmModal: propShowConfirmModal,
  setShowConfirmModal: propSetShowConfirmModal,
  onTokenSelectionChange,
}: SwapTabProps) {
  const [activeTab, setActiveTab] = useState<"swap" | "bridge">("swap");

  const [fromChain, setFromChain] = useState(ETH_CHAIN); // Ethereum
  const [toChain, setToChain] = useState(BASE_CHAIN); // Base

  const [fromToken, setFromToken] = useState<any>({
    ...DEFAULT_TOKENS[1][0],
    chainId: 1,
  }); // ETH
  const [toToken, setToToken] = useState<any>({
    ...DEFAULT_TOKENS[8453][0],
    chainId: 8453,
  }); // ETH on Base

  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");

  useEffect(() => {
    if (onTokenSelectionChange) {
      onTokenSelectionChange(fromToken, toToken);
    }
  }, [fromToken, toToken, onTokenSelectionChange]);

  const [slippage, setSlippage] = useState<"0.1" | "0.5" | "1.0">("0.5");

  const [showTokenSelector, setShowTokenSelector] = useState<
    "from" | "to" | null
  >(null);

  const [quote, setQuote] = useState<any>(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const [localSwapStep, setLocalSwapStep] = useState<
    "form" | "submitting" | "waiting" | "success" | "failed"
  >("form");
  const swapStep = propSwapStep !== undefined ? propSwapStep : localSwapStep;
  const setSwapStep =
    propSetSwapStep !== undefined ? propSetSwapStep : setLocalSwapStep;
  const [execStatus, setExecStatus] = useState("");
  const [execError, setExecError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [lifiStatus, setLifiStatus] = useState<string>("");

  const [localShowConfirm, setLocalShowConfirm] = useState(false);
  const showConfirmModal =
    propShowConfirmModal !== undefined
      ? propShowConfirmModal
      : localShowConfirm;
  const setShowConfirmModal =
    propSetShowConfirmModal !== undefined
      ? propSetShowConfirmModal
      : setLocalShowConfirm;
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const [swapFeeSpeed, setSwapFeeSpeed] = useState<
    "slow" | "normal" | "fast" | "custom"
  >("normal");
  const [customSwapFeeGwei, setCustomSwapFeeGwei] = useState("30");
  const [showSwapFeePopup, setShowSwapFeePopup] = useState(false);
  const [swapGasOpts, setSwapGasOpts] = useState<any>(null);
  const [swapFeeEstimates, setSwapFeeEstimates] = useState({
    low: 0.001,
    medium: 0.005,
    high: 0.01,
  });

  const [activeChainFilter, setActiveChainFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [tokenPrices, setTokenPrices] = useState<
    Map<string, { price: number; change24h: number }>
  >(new Map());

  const modalNetworks = useMemo(() => {
    if (activeTab === "swap") {
      return HORIZONTAL_NETWORKS.filter((n) => n.id !== "octra");
    }
    return HORIZONTAL_NETWORKS;
  }, [activeTab]);

  const [customToken, setCustomToken] = useState<any>(null);
  const [isResolvingToken, setIsResolvingToken] = useState(false);
  const resolveRef = useRef<number>(0);

  const quoteRequestId = useRef(0);

  const isOctraBridgeActive = useMemo(() => {
    return fromChain.id === "octra" || toChain.id === "octra";
  }, [fromChain, toChain]);

  useEffect(() => {
    if (isOctraBridgeActive) {
      setFromChain(ETH_CHAIN);
      setToChain(BASE_CHAIN);
      setFromToken({ ...DEFAULT_TOKENS[1][0], chainId: 1 });
      setToToken({ ...DEFAULT_TOKENS[8453][0], chainId: 8453 });
      onBridgeTabOpen?.();
    }
  }, [isOctraBridgeActive]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!ethers.isAddress(query)) {
      setCustomToken(null);
      setIsResolvingToken(false);
      return;
    }

    const netDef = HORIZONTAL_NETWORKS.find(
      (n) => n.id === activeChainFilter && n.id !== "all",
    );
    const chainId =
      netDef?.chainId ??
      (showTokenSelector === "to" ? toChain.chainId : fromChain.chainId);
    if (!chainId || chainId === 9048201) {
      setCustomToken(null);
      return;
    }

    const callId = ++resolveRef.current;
    setIsResolvingToken(true);
    setCustomToken(null);

    const lifiKey = (import.meta.env.VITE_LIFI_API_KEY as string) || "";
    const headers: HeadersInit = lifiKey ? { "x-lifi-api-key": lifiKey } : {};

    fetch(`https://li.quest/v1/token?chain=${chainId}&token=${query}`, {
      headers,
    })
      .then(async (r) => {
        if (callId !== resolveRef.current) return;
        if (!r.ok) throw new Error("lifi_not_found");
        const d = await r.json();
        if (!d?.symbol || !d?.address) throw new Error("lifi_empty");
        setCustomToken({
          symbol: d.symbol,
          name: d.name || d.symbol,
          decimals: d.decimals ?? 18,
          contractAddress: ethers.getAddress(d.address),
          logoUrl: d.logoURI || null,
          chainId,
          balance: "0",
          priceUSD: d.priceUSD ? parseFloat(d.priceUSD) : null,
          _imported: true,
        });
      })
      .catch(async () => {
        if (callId !== resolveRef.current) return;
        try {
          const meta = await fetchTokenMetadata(query, chainId);
          if (callId === resolveRef.current) {
            setCustomToken({
              ...meta,
              balance: "0",
              priceUSD: null,
              _imported: true,
            });
          }
        } catch {
          if (callId === resolveRef.current) setCustomToken(null);
        }
      })
      .finally(() => {
        if (callId === resolveRef.current) setIsResolvingToken(false);
      });
  }, [
    searchQuery,
    activeChainFilter,
    showTokenSelector,
    fromChain.chainId,
    toChain.chainId,
  ]);

  useEffect(() => {
    const symbols = new Set<string>();
    if (fromToken?.symbol) symbols.add(fromToken.symbol.toUpperCase());
    if (toToken?.symbol) symbols.add(toToken.symbol.toUpperCase());
    if (fromChain?.symbol) symbols.add(fromChain.symbol.toUpperCase());
    if (toChain?.symbol) symbols.add(toChain.symbol.toUpperCase());
    const uniqueSymbols = Array.from(symbols);
    if (uniqueSymbols.length === 0) return;
    getMultipleTokenPrices(uniqueSymbols).then((prices) => {
      setTokenPrices((prev) => {
        const newPrices = new Map(prev);
        prices.forEach((val, key) => newPrices.set(key, val));
        return newPrices;
      });
    });
  }, [fromToken?.symbol, toToken?.symbol, fromChain?.id, toChain?.id]);

  const userBalance = useMemo(() => {
    if (fromChain.id === "octra") {
      return octBalance || 0;
    }
    if (!allTokens) return 0;
    const matching = allTokens.find(
      (t) =>
        t.chainId === fromChain.chainId &&
        t.symbol.toUpperCase() === fromToken.symbol.toUpperCase(),
    );
    if (!matching) return 0;
    return typeof matching.balance === "string"
      ? parseFloat(matching.balance)
      : matching.balance || 0;
  }, [allTokens, fromChain, fromToken, octBalance]);

  const toTokenBalance = useMemo(() => {
    if (toChain.id === "octra") {
      return octBalance || 0;
    }
    if (!allTokens) return 0;
    const matching = allTokens.find(
      (t) =>
        t.chainId === toChain.chainId &&
        t.symbol.toUpperCase() === toToken.symbol.toUpperCase(),
    );
    if (!matching) return 0;
    return typeof matching.balance === "string"
      ? parseFloat(matching.balance)
      : matching.balance || 0;
  }, [allTokens, toChain, toToken, octBalance]);

  const fromUsdValue = useMemo(() => {
    if (quote?.estimate?.fromAmountUSD)
      return parseFloat(quote.estimate.fromAmountUSD);
    if (!fromAmount || isNaN(parseFloat(fromAmount))) return null;
    const priceInfo = tokenPrices.get(fromToken.symbol.toUpperCase());
    if (!priceInfo) return null;
    return parseFloat(fromAmount) * priceInfo.price;
  }, [fromAmount, fromToken, tokenPrices, quote]);

  const toUsdValue = useMemo(() => {
    if (quote?.estimate?.toAmountUSD)
      return parseFloat(quote.estimate.toAmountUSD);
    if (!toAmount || isNaN(parseFloat(toAmount))) return null;
    const priceInfo = tokenPrices.get(toToken.symbol.toUpperCase());
    if (!priceInfo) return null;
    return parseFloat(toAmount) * priceInfo.price;
  }, [toAmount, toToken, tokenPrices, quote]);

  const priceImpactText = useMemo(() => {
    if (!quote || !quote.estimate) return "";
    const impact = quote.estimate.priceImpact;
    if (!impact) return "";
    const num = parseFloat(impact);
    if (isNaN(num)) return "";
    const percent = num * 100;
    return ` (-${percent.toFixed(2)}%)`;
  }, [quote]);

  useEffect(() => {
    if (activeTab !== "swap") return;
    if (fromChain.id !== toChain.id) {
      setToChain(fromChain);
      const defaults = DEFAULT_TOKENS[fromChain.chainId] || [];
      const nextTok =
        defaults.find((d) => d.symbol !== fromToken.symbol) || defaults[0];
      if (nextTok) setToToken({ ...nextTok, chainId: fromChain.chainId });
    } else if (
      fromToken.contractAddress === toToken.contractAddress &&
      fromToken.chainId === toToken.chainId
    ) {
      const defaults = DEFAULT_TOKENS[fromChain.chainId] || [];
      const nextTok =
        defaults.find((d) => d.contractAddress !== fromToken.contractAddress) ||
        defaults[1] ||
        defaults[0];
      if (nextTok && nextTok.contractAddress !== fromToken.contractAddress) {
        setToToken({ ...nextTok, chainId: fromChain.chainId });
      }
    }
  }, [
    activeTab,
    fromChain,
    fromToken,
    toToken.contractAddress,
    toToken.chainId,
  ]);

  const handleTabChange = (tab: "swap" | "bridge") => {
    setActiveTab(tab);
    setFromAmount("");
    setToAmount("");
    setQuote(null);
    setQuoteError("");
    setSwapStep("form");

    if (tab === "swap") {
      if (activeChainFilter === "octra") {
        setActiveChainFilter("all");
      }
    } else {
      if (fromChain.chainId === toChain.chainId) {
        const defaultToChain = fromChain.chainId === 1 ? BASE_CHAIN : ETH_CHAIN;
        setToChain(defaultToChain);
        const toNative = DEFAULT_TOKENS[defaultToChain.chainId]?.[0];
        if (toNative)
          setToToken({ ...toNative, chainId: defaultToChain.chainId });
      }
    }
  };

  const handleMaxInput = () => {
    if (userBalance > 0) {
      const isNative =
        fromChain.id === "octra" ||
        (fromToken &&
          (fromToken.contractAddress ===
            "0x0000000000000000000000000000000000000000" ||
            fromToken.address ===
              "0x0000000000000000000000000000000000000000" ||
            fromToken.isNative === true ||
            !fromToken.contractAddress)) ||
        fromChain.id === "solana" ||
        fromChain.id === "sui" ||
        fromChain.id === "bitcoin";

      if (!isNative) {
        setFromAmount(parseFloat(userBalance.toFixed(6)).toString());
        return;
      }

      if (fromChain.id === "octra") {
        try {
          const rpcClient = getRpcClient();
          rpcClient
            .getFeeEstimate(userBalance)
            .then((fees) => {
              const estFee = fees.medium || 0.01;
              const maxAmt = Math.max(0, userBalance - estFee);
              setFromAmount(parseFloat(maxAmt.toFixed(6)).toString());
            })
            .catch(() => {
              const maxAmt = Math.max(0, userBalance - 0.01);
              setFromAmount(parseFloat(maxAmt.toFixed(6)).toString());
            });
        } catch (e) {
          const maxAmt = Math.max(0, userBalance - 0.01);
          setFromAmount(parseFloat(maxAmt.toFixed(6)).toString());
        }
      } else if (
        fromChain.id !== "solana" &&
        fromChain.id !== "sui" &&
        fromChain.id !== "bitcoin"
      ) {
        const fallbackLimit = fromChain.id === "ethereum" ? 250_000n : 200_000n;
        fetchGasOptions({}, fallbackLimit, fromChain.id)
          .then((opts) => {
            const feeTier = opts.normal;
            const dynamicFeeEth =
              Number(feeTier.maxFeePerGas * opts.gasLimit) / 1e18;
            const maxAmt = Math.max(0, userBalance - dynamicFeeEth);
            setFromAmount(parseFloat(maxAmt.toFixed(6)).toString());
          })
          .catch((err) => {
            console.error("Failed to simulate EVM max gas:", err);
            let staticFallback = 0.0005;
            if (fromChain.id === "ethereum") staticFallback = 0.003;
            else if (fromChain.id === "bsc") staticFallback = 0.0015;
            else if (fromChain.id === "polygon") staticFallback = 0.5;
            const maxAmt = Math.max(0, userBalance - staticFallback);
            setFromAmount(parseFloat(maxAmt.toFixed(6)).toString());
          });
      } else {
        let deduction = 0.0001; // SOL default
        if (fromChain.id === "sui") deduction = 0.01;
        else if (fromChain.id === "bitcoin") deduction = 0.00005;
        const maxAmt = Math.max(0, userBalance - deduction);
        setFromAmount(parseFloat(maxAmt.toFixed(6)).toString());
      }
    }
  };

  const handleSwapDirection = () => {
    const tempChain = fromChain;
    const tempToken = fromToken;

    setFromChain(toChain);
    setToChain(tempChain);
    setFromToken(toToken);
    setToToken(tempToken);

    setFromAmount("");
    setToAmount("");
    setQuote(null);
    setQuoteError("");
  };

  const selectTokenAndChain = (token: any, target: "from" | "to") => {
    const isOCT =
      token.symbol?.toUpperCase() === "OCT" && token.chainId === 9048201;
    if (isOCT) {
      setShowTokenSelector(null);
      onBridgeTabOpen?.();
      return;
    }

    if (
      token._imported &&
      wallet.address &&
      token.contractAddress !== "0x0000000000000000000000000000000000000000"
    ) {
      const checksummed = ethers.getAddress(token.contractAddress);
      if (token.priceUSD && token.priceUSD > 0) {
        seedTokenPrice(token.symbol, checksummed, token.priceUSD);
      }
      addCustomToken(wallet.address, {
        contractAddress: checksummed,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals ?? 18,
        logoUrl: token.logoUrl ?? "",
        chainId: token.chainId,
        addedAt: Date.now(),
      })
        .then(() => onRefresh())
        .catch(console.error);
    }

    const targetChain =
      EVM_SWAP_CHAINS.find((c) => c.chainId === token.chainId) ?? ETH_CHAIN;

    if (target === "from") {
      setFromChain(targetChain);
      setFromToken(token);
    } else {
      setToChain(targetChain);
      setToToken(token);
    }

    setShowTokenSelector(null);
    setQuote(null);
    setQuoteError("");
    setFromAmount("");
    setToAmount("");
  };

  const getLiFiQuote = async () => {
    if (
      fromChain.chainId === toChain.chainId &&
      fromToken.contractAddress === toToken.contractAddress
    ) {
      ++quoteRequestId.current;
      setQuote(null);
      setToAmount("");
      setQuoteError(
        "Same token selected — please choose a different token to swap.",
      );
      return;
    }

    let fromAddr = wallet.evmAddress;
    if (fromChain.id === "solana") {
      fromAddr = wallet.solanaAddress;
    } else if (fromChain.id === "sui") {
      fromAddr = wallet.suiAddress;
    } else if (fromChain.id === "bitcoin") {
      fromAddr = wallet.bitcoinAddress;
    }

    let toAddr = wallet.evmAddress;
    if (toChain.id === "solana") {
      toAddr = wallet.solanaAddress;
    } else if (toChain.id === "sui") {
      toAddr = wallet.suiAddress;
    } else if (toChain.id === "bitcoin") {
      toAddr = wallet.bitcoinAddress;
    }

    if (!fromAmount || parseFloat(fromAmount) <= 0 || !fromAddr || !toAddr) {
      ++quoteRequestId.current;
      setQuote(null);
      setToAmount("");
      setQuoteError("");
      return;
    }

    const requestId = ++quoteRequestId.current;
    setIsFetchingQuote(true);
    setQuoteError("");
    try {
      let sanitizedAmount = fromAmount.replace(/,/g, ".");
      const parts = sanitizedAmount.split(".");
      if (parts[1] && parts[1].length > fromToken.decimals) {
        sanitizedAmount = `${parts[0]}.${parts[1].substring(0, fromToken.decimals)}`;
      }
      const rawAmt = ethers
        .parseUnits(sanitizedAmount, fromToken.decimals)
        .toString();
      const params = new URLSearchParams({
        fromChain: String(fromChain.chainId),
        toChain: String(toChain.chainId),
        fromToken: fromToken.contractAddress,
        toToken: toToken.contractAddress,
        fromAmount: rawAmt,
        fromAddress: fromAddr,
        toAddress: toAddr,
        slippage: String(parseFloat(slippage) / 100),
      });
      const lifiIntegrator =
        (import.meta.env.VITE_LIFI_INTEGRATOR_ID as string) || "";
      const lifiFeeBps = parseInt(
        (import.meta.env.VITE_LIFI_FEE_BPS as string) || "0",
        10,
      );
      if (lifiIntegrator) params.set("integrator", lifiIntegrator);
      if (lifiIntegrator && lifiFeeBps > 0)
        params.set("fee", (lifiFeeBps / 10000).toFixed(4));

      const lifiApiKey = (import.meta.env.VITE_LIFI_API_KEY as string) || "";
      const headers: HeadersInit = lifiApiKey
        ? { "x-lifi-api-key": lifiApiKey }
        : {};
      const resp = await fetch(`https://li.quest/v1/quote?${params}`, {
        headers,
      });
      const data = await resp.json();

      if (requestId !== quoteRequestId.current) return;

      if (!resp.ok || data.code || data.message) {
        throw new Error(data.message || "No route found for this pair.");
      }

      const resolvedToDecimals: number =
        data.action?.toToken?.decimals ??
        data.estimate?.toToken?.decimals ??
        toToken.decimals;

      setQuote(data);
      setToAmount(
        Number(
          ethers.formatUnits(data.estimate.toAmount, resolvedToDecimals),
        ).toFixed(6),
      );
    } catch (e: any) {
      if (requestId !== quoteRequestId.current) return;
      setQuoteError(e.message || "Failed to fetch quote.");
      setQuote(null);
      setToAmount("");
    } finally {
      if (requestId === quoteRequestId.current) {
        setIsFetchingQuote(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(getLiFiQuote, 600);
    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken, fromChain, toChain, slippage, activeTab]);

  // LiFi already simulated the route and returns gas cost in the quote.
  // Sum gasCosts (native smallest unit) → human native amount. Most accurate
  // and needs no extra RPC call.
  const lifiGasNative = (q: any): number | null => {
    const costs = q?.estimate?.gasCosts;
    if (!Array.isArray(costs) || costs.length === 0) return null;
    try {
      let total = 0n;
      let decimals = 18;
      for (const c of costs) {
        if (c?.amount) total += BigInt(c.amount);
        if (c?.token?.decimals) decimals = c.token.decimals;
      }
      if (total === 0n) return null;
      return Number(total) / Math.pow(10, decimals);
    } catch {
      return null;
    }
  };

  const handleSwapClick = async () => {
    let fromAddr = wallet.evmAddress;
    if (fromChain.id === "solana") {
      fromAddr = wallet.solanaAddress;
    } else if (fromChain.id === "sui") {
      fromAddr = wallet.suiAddress;
    } else if (fromChain.id === "bitcoin") {
      fromAddr = wallet.bitcoinAddress;
    }
    if (!quote || !fromAddr) return;

    setQuoteError("");

    if (
      fromChain.id === "solana" ||
      fromChain.id === "sui" ||
      fromChain.id === "bitcoin"
    ) {
      setIsEstimatingGas(false);
      setSwapGasOpts(null);
      // Real gas from the LiFi quote (lamports/MIST/sat with proper decimals);
      // last-resort tiny fallback only if the route omits gas costs.
      const nonEvmGas = lifiGasNative(quote);
      setSwapFeeEstimates(
        nonEvmGas != null
          ? { low: nonEvmGas, medium: nonEvmGas, high: nonEvmGas }
          : { low: 0.000005, medium: 0.00001, high: 0.00005 },
      );
      setShowConfirmModal(true);
      return;
    }

    const lifiGas = lifiGasNative(quote);

    // LiFi already simulated the route and returned gas costs + tx gas params,
    // so no RPC gas estimate is needed. This is the common path — zero extra
    // RPC calls at confirm. The send uses LiFi's own transactionRequest gas.
    if (lifiGas != null) {
      setSwapGasOpts(null);
      setSwapFeeEstimates({ low: lifiGas, medium: lifiGas, high: lifiGas });
      setShowConfirmModal(true);
      return;
    }

    // Only when LiFi omits gas do we fall back to an RPC estimate.
    setIsEstimatingGas(true);
    try {
      const txReq = quote.transactionRequest;
      const txForEstimation = {
        to: txReq.to,
        data: txReq.data,
        value: txReq.value ? BigInt(txReq.value) : 0n,
        from: wallet.evmAddress,
      };

      const opts = await fetchGasOptions(
        txForEstimation,
        txReq.gasLimit ? BigInt(txReq.gasLimit) : 400_000n,
        fromChain.id,
      );

      setSwapGasOpts(opts);
      setCustomSwapFeeGwei((Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2));

      const toEth = (tier: typeof opts.slow) =>
        parseFloat(
          (Number(tier.maxFeePerGas * opts.gasLimit) / 1e18).toFixed(8),
        );

      setSwapFeeEstimates({
        low: toEth(opts.slow),
        medium: toEth(opts.normal),
        high: toEth(opts.fast),
      });

      setShowConfirmModal(true);
    } catch (e: any) {
      console.warn("Gas estimate RPC failed:", e?.message);
      setSwapGasOpts(null);
      setSwapFeeEstimates({ low: 0.001, medium: 0.005, high: 0.01 });
      setShowConfirmModal(true);
    } finally {
      setIsEstimatingGas(false);
    }
  };

  // Turn raw provider/ethers errors into a short human message for the UI.
  const friendlySwapError = (e: any): string => {
    const raw = String(e?.reason || e?.shortMessage || e?.message || e || "");
    const low = raw.toLowerCase();
    if (low.includes("user rejected") || low.includes("user denied"))
      return "You rejected the transaction.";
    if (low.includes("insufficient funds"))
      return "Insufficient balance to cover the amount plus gas.";
    if (
      /401|403|429|api key|tenant|server_error|could not detect|timeout|network|rate.?limit/.test(
        low,
      )
    )
      return "Network is busy or the RPC is unavailable. Please try again.";
    if (low.includes("slippage") || low.includes("min return"))
      return "Price moved too much (slippage). Try again or raise slippage.";
    // Fallback: strip the ethers "(request=… version=…)" noise.
    const clean = raw.replace(/\(.*\)/gs, "").replace(/\s+/g, " ").trim();
    return clean.slice(0, 140) || "Swap execution failed.";
  };

  const executeSwap = async () => {
    let fromAddr = wallet.evmAddress;
    if (fromChain.id === "solana") {
      fromAddr = wallet.solanaAddress;
    } else if (fromChain.id === "sui") {
      fromAddr = wallet.suiAddress;
    } else if (fromChain.id === "bitcoin") {
      fromAddr = wallet.bitcoinAddress;
    }
    if (!quote || !fromAddr) return;

    setShowConfirmModal(false);
    setSwapStep("submitting");
    setExecStatus("Preparing transaction...");
    setExecError("");
    setTxHash("");

    try {
      if (fromChain.id === "sui" || fromChain.id === "bitcoin") {
        throw new Error(
          `Cross-chain swaps starting from ${fromChain.name} are currently supported in receive mode. Please swap from an EVM network or Solana to receive ${fromChain.name} assets.`,
        );
      }

      if (fromChain.id === "solana") {
        setExecStatus("Submitting swap to Solana network...");
        const txData = quote.transactionRequest?.data;
        if (!txData)
          throw new Error("No transaction request returned from LI.FI.");

        const { VersionedTransaction, Connection, Keypair } =
          await import("@solana/web3.js");
        const { getSolanaEndpoints } =
          await import("../../../services/network/SolanaRpcService");

        const solanaPrivateKeyHex = wallet.solanaPrivateKeyHex;
        if (!solanaPrivateKeyHex)
          throw new Error("Solana private key not found in wallet.");

        const seedBytes = new Uint8Array(
          Buffer.from(solanaPrivateKeyHex, "hex"),
        );
        const keypair = Keypair.fromSeed(seedBytes);

        const rawTxBytes = new Uint8Array(Buffer.from(txData, "base64"));
        const transaction = VersionedTransaction.deserialize(rawTxBytes);

        transaction.sign([keypair]);

        setExecStatus("Broadcasting transaction to Solana...");
        const rawTx = transaction.serialize();
        // Broadcast with RPC fallback (mainnet-beta is rate-limited).
        let signature = "";
        let solErr: unknown;
        for (const url of getSolanaEndpoints()) {
          try {
            signature = await new Connection(
              url,
              "confirmed",
            ).sendRawTransaction(rawTx, {
              skipPreflight: false,
              preflightCommitment: "confirmed",
            });
            break;
          } catch (e) {
            solErr = e;
          }
        }
        if (!signature)
          throw solErr ?? new Error("Failed to broadcast Solana swap.");

        setTxHash(signature);
        setSwapStep("waiting");
        setExecStatus(
          "Solana transaction submitted! Tracking cross-chain execution...",
        );

        let completed = false;
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 6000));
          try {
            const _lifiKey =
              (import.meta.env.VITE_LIFI_API_KEY as string) || "";
            const statusResp = await fetch(
              `https://li.quest/v1/status?txHash=${signature}&fromChain=${fromChain.chainId}&toChain=${toChain.chainId}`,
              _lifiKey ? { headers: { "x-lifi-api-key": _lifiKey } } : {},
            );
            const statusData = await statusResp.json();
            const stat = statusData.status;
            setLifiStatus(stat);

            if (stat === "DONE") {
              setSwapStep("success");
              completed = true;
              onRefresh();
              break;
            } else if (stat === "FAILED") {
              throw new Error("Bridge execution failed on destination chain.");
            }
          } catch {}
        }

        if (!completed) {
          setExecStatus(
            "Transaction executing safely on Solana. Please verify inside Solscan.",
          );
          setSwapStep("success");
        }
        return;
      }

      const evmNetworkKey = fromChain.id;
      // Private RPC first (Alchemy/Infura), with a probed public fallback so a
      // private endpoint that doesn't serve this chain doesn't break the swap.
      const rpcUrl =
        (await getWorkingTransactionRpc(fromChain.chainId)) ||
        NETWORK_REGISTRY[evmNetworkKey]?.rpcUrl;
      if (!rpcUrl)
        throw new Error(`RPC endpoint missing for ${fromChain.name}`);

      if (
        fromToken.contractAddress !==
          "0x0000000000000000000000000000000000000000" &&
        quote.estimate.approvalAddress
      ) {
        const spender = quote.estimate.approvalAddress;
        setExecStatus("Checking token spend allowance...");

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const erc20 = new ethers.Contract(
          fromToken.contractAddress,
          [
            "function allowance(address owner, address spender) view returns (uint256)",
          ],
          provider,
        );

        const currentAllowance = await erc20.allowance(
          wallet.evmAddress,
          spender,
        );
        let sanitizedAmount = fromAmount.replace(/,/g, ".");
        const parts = sanitizedAmount.split(".");
        if (parts[1] && parts[1].length > fromToken.decimals) {
          sanitizedAmount = `${parts[0]}.${parts[1].substring(0, fromToken.decimals)}`;
        }
        const rawAmount = ethers.parseUnits(
          sanitizedAmount,
          fromToken.decimals,
        );

        if (currentAllowance < rawAmount) {
          setExecStatus("Approving token spend limit...");
          const erc20Iface = new ethers.Interface([
            "function approve(address spender, uint256 amount) returns (bool)",
          ]);
          const data = erc20Iface.encodeFunctionData("approve", [
            spender,
            ethers.MaxUint256,
          ]);

          const approveTx = await keyringService.signAndSendEvm(
            address,
            {
              to: fromToken.contractAddress,
              data,
            },
            rpcUrl,
          );

          setExecStatus("Waiting for limit approval confirmation...");
          await approveTx.wait();
        }
      }

      setExecStatus("Submitting swap to network...");
      const txReq = quote.transactionRequest;

      const gasLimitOverride = swapGasOpts?.gasLimit
        ? BigInt(swapGasOpts.gasLimit)
        : txReq.gasLimit
          ? BigInt(txReq.gasLimit)
          : undefined;

      const txOverride: any = {
        to: txReq.to,
        data: txReq.data,
        value: txReq.value,
        gasLimit: gasLimitOverride,
      };

      if (swapGasOpts) {
        if (swapFeeSpeed === "custom") {
          txOverride.maxFeePerGas = BigInt(gweiToWei(customSwapFeeGwei));
          txOverride.maxPriorityFeePerGas =
            txOverride.maxFeePerGas > 1_000_000_000n
              ? 1_000_000_000n
              : txOverride.maxFeePerGas;
        } else {
          const tier = swapGasOpts[swapFeeSpeed];
          if (tier) {
            txOverride.maxFeePerGas = tier.maxFeePerGas;
            txOverride.maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
          }
        }
      } else if (txReq.gasPrice) {
        // No local gas opts — use LiFi's own gas price so ethers doesn't make
        // an extra getFeeData RPC call at broadcast.
        txOverride.gasPrice = BigInt(txReq.gasPrice);
      }

      const tx = await keyringService.signAndSendEvm(
        address,
        txOverride,
        rpcUrl,
      );

      setTxHash(tx.hash);
      setSwapStep("waiting");
      setExecStatus("Transaction submitted! Tracking execution...");

      let completed = false;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 6000));
        try {
          const _lifiKey = (import.meta.env.VITE_LIFI_API_KEY as string) || "";
          const statusResp = await fetch(
            `https://li.quest/v1/status?txHash=${tx.hash}&fromChain=${fromChain.chainId}&toChain=${toChain.chainId}`,
            _lifiKey ? { headers: { "x-lifi-api-key": _lifiKey } } : {},
          );
          const statusData = await statusResp.json();

          const stat = statusData.status;
          setLifiStatus(stat);

          if (stat === "DONE") {
            setSwapStep("success");
            completed = true;
            onRefresh();
            if (wallet?.evmAddress) {
              const netId =
                Object.values(NETWORK_REGISTRY).find(
                  (n) => n.chainId === fromChain.chainId,
                )?.id ?? "ethereum";
              const toNetId = Object.values(NETWORK_REGISTRY).find(
                (n) => n.chainId === toChain.chainId,
              )?.id;
              const swapTx = {
                hash: tx.hash,
                type: "swap" as const,
                amount: parseFloat(fromAmount || "0"),
                address: wallet.evmAddress,
                timestamp: Date.now(),
                status: "confirmed" as const,
                token: fromToken?.symbol,
                contractAddress: fromToken?.contractAddress ?? undefined,
                fee: 0,
                networkId: netId,
                fromTokenSymbol: fromToken?.symbol,
                fromAmount: parseFloat(fromAmount || "0"),
                toTokenSymbol: toToken?.symbol,
                toAmount: parseFloat(toAmount || "0"),
              };
              saveEvmTxHistory(netId, wallet.evmAddress, [swapTx]).catch(
                () => {},
              );
              if (toNetId && toNetId !== netId) {
                saveEvmTxHistory(toNetId, wallet.evmAddress, [swapTx]).catch(
                  () => {},
                );
              }
              if (wallet.address) {
                saveTxHistorySecure(
                  [{ ...swapTx, description: "Swap" }],
                  "mainnet",
                  wallet.address,
                ).catch(() => {});
              }
            }
            break;
          } else if (stat === "FAILED") {
            throw new Error("Bridge execution failed on destination chain.");
          }
        } catch (statusErr) {}
      }

      if (!completed) {
        setExecStatus(
          "Transaction executing safely on-chain. Please verify inside explorer.",
        );
        setSwapStep("success");
        if (wallet?.evmAddress) {
          const netId =
            Object.values(NETWORK_REGISTRY).find(
              (n) => n.chainId === fromChain.chainId,
            )?.id ?? "ethereum";
          const toNetId = Object.values(NETWORK_REGISTRY).find(
            (n) => n.chainId === toChain.chainId,
          )?.id;
          const swapTx = {
            hash: tx.hash,
            type: "swap" as const,
            amount: parseFloat(fromAmount || "0"),
            address: wallet.evmAddress,
            timestamp: Date.now(),
            status: "confirmed" as const,
            token: fromToken?.symbol,
            contractAddress: fromToken?.contractAddress ?? undefined,
            fee: 0,
            networkId: netId,
            fromTokenSymbol: fromToken?.symbol,
            fromAmount: parseFloat(fromAmount || "0"),
            toTokenSymbol: toToken?.symbol,
            toAmount: parseFloat(toAmount || "0"),
          };
          saveEvmTxHistory(netId, wallet.evmAddress, [swapTx]).catch(() => {});
          if (toNetId && toNetId !== netId) {
            saveEvmTxHistory(toNetId, wallet.evmAddress, [swapTx]).catch(
              () => {},
            );
          }
          if (wallet.address) {
            saveTxHistorySecure(
              [{ ...swapTx, description: "Swap" }],
              "mainnet",
              wallet.address,
            ).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      setExecError(friendlySwapError(e));
      setSwapStep("failed");
    }
  };

  const isInputDisabled = swapStep !== "form";

  return (
    <>
      {swapStep === "form" &&
        (showConfirmModal ? (
          <SwapConfirmModal
            fromToken={fromToken}
            toToken={toToken}
            fromChain={fromChain}
            toChain={toChain}
            fromAmount={fromAmount}
            toAmount={toAmount}
            wallet={wallet}
            fee={
              swapFeeSpeed === "custom"
                ? swapGasOpts
                  ? Number(
                      gweiToWei(customSwapFeeGwei) * swapGasOpts.gasLimit,
                    ) / 1e18
                  : swapFeeEstimates.medium
                : swapFeeSpeed === "slow"
                  ? swapFeeEstimates.low
                  : swapFeeSpeed === "fast"
                    ? swapFeeEstimates.high
                    : swapFeeEstimates.medium
            }
            ethPriceUsd={
              tokenPrices.get(fromChain.symbol.toUpperCase())?.price || null
            }
            feeSpeed={swapFeeSpeed}
            setFeeSpeed={setSwapFeeSpeed}
            customFeeGwei={customSwapFeeGwei}
            setCustomFeeGwei={setCustomSwapFeeGwei}
            feeEstimates={swapFeeEstimates}
            evmGasOpts={swapGasOpts}
            showFeePopup={showSwapFeePopup}
            setShowFeePopup={setShowSwapFeePopup}
            handleConfirmSwap={executeSwap}
            onBack={() => setShowConfirmModal(false)}
            title="Confirm Swap"
            txData={quote?.transactionRequest?.data}
          />
        ) : (
          <>
            {/* Integrated card segmented tab header */}
            <div className="widget-tab-container">
              <button
                className={`widget-tab-btn ${activeTab === "swap" ? "active" : ""}`}
                onClick={() => handleTabChange("swap")}
              >
                Swap
              </button>
              <button
                className={`widget-tab-btn ${activeTab === "bridge" ? "active" : ""}`}
                onClick={() => handleTabChange("bridge")}
              >
                Bridge
              </button>
            </div>

            <div className="swap-widget-card">
              {/* Source Block (Aligned to the provided screenshot layout) */}
              <div className="widget-section">
                <div className="section-header">
                  <div className="section-label-group">
                    <span>From</span>
                    <img
                      src={fromChain.logoUrl}
                      alt=""
                      className="inline-chain-icon"
                    />
                    <span className="chain-name-text">{fromChain.name}</span>
                  </div>
                  <div
                    className="section-balance-group"
                    onClick={handleMaxInput}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="wallet-svg-icon"
                    >
                      <rect
                        x="2"
                        y="5"
                        width="20"
                        height="14"
                        rx="2"
                        ry="2"
                      ></rect>
                      <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span className="balance-num">
                      {formatAmount(userBalance, 6)}
                    </span>
                    <span className="maks-button">Max</span>
                  </div>
                </div>
                <div className="token-input-row">
                  <div
                    className="token-dropdown-trigger borderless-trigger"
                    onClick={() => {
                      setActiveChainFilter("all");
                      setSearchQuery("");
                      setShowTokenSelector("from");
                    }}
                  >
                    <TokenIcon
                      symbol={fromToken.symbol}
                      logoUrl={fromToken.logoUrl}
                      size={24}
                    />
                    <span className="token-symbol-text">
                      {fromToken.symbol}
                    </span>
                    <ChevronDownIcon size={12} />
                  </div>
                  <div className="amount-input-container">
                    <input
                      type="number"
                      className="swap-input-large"
                      placeholder="0"
                      value={fromAmount}
                      onChange={(e) => setFromAmount(e.target.value)}
                      disabled={isInputDisabled}
                    />
                    <div className="amount-fiat-val">
                      {formatUsd(fromUsdValue)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mid-Swap Overlay circle action */}
              <div className="mid-swap-divider">
                <div className="divider-line" />
                <button
                  className="swap-action-trigger"
                  onClick={handleSwapDirection}
                  disabled={isInputDisabled}
                >
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
                    <path d="M7 20V4M7 4L3 8M7 4L11 8" />
                    <path d="M17 4v16M17 20l4-4M17 20l-4-4" />
                  </svg>
                </button>
                <div className="divider-line" />
              </div>

              {/* Destination Block */}
              <div className="widget-section">
                <div className="section-header">
                  <div className="section-label-group">
                    <span>To</span>
                    <img
                      src={toChain.logoUrl}
                      alt=""
                      className="inline-chain-icon"
                    />
                    <span className="chain-name-text">{toChain.name}</span>
                  </div>
                  <div className="section-balance-group">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="wallet-svg-icon"
                    >
                      <rect
                        x="2"
                        y="5"
                        width="20"
                        height="14"
                        rx="2"
                        ry="2"
                      ></rect>
                      <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span className="balance-num">
                      {formatAmount(toTokenBalance, 6)}
                    </span>
                  </div>
                </div>
                <div className="token-input-row">
                  <div
                    className="token-dropdown-trigger borderless-trigger"
                    onClick={() => {
                      setActiveChainFilter("all");
                      setSearchQuery("");
                      setShowTokenSelector("to");
                    }}
                  >
                    <TokenIcon
                      symbol={toToken.symbol}
                      logoUrl={toToken.logoUrl}
                      size={24}
                    />
                    <span className="token-symbol-text">{toToken.symbol}</span>
                    <ChevronDownIcon size={12} />
                  </div>
                  <div className="amount-input-container">
                    <input
                      type="number"
                      className="swap-input-large"
                      placeholder="0"
                      value={toAmount}
                      readOnly
                    />
                    <div className="amount-fiat-val">
                      {formatUsd(toUsdValue)}
                      {toUsdValue !== null && priceImpactText && (
                        <span className="price-impact-tag">
                          {priceImpactText}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Standard Slippage tolerance adjustment */}
            {!isOctraBridgeActive && (
              <div className="swap-info-grid">
                <div className="info-row">
                  <span className="info-label">Slippage Tolerance</span>
                  <div className="slippage-btn-group">
                    {(["0.1", "0.5", "1.0"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSlippage(s)}
                        className={`slippage-btn ${slippage === s ? "active" : ""}`}
                      >
                        {s}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Speed / Fee quotes rendering */}
            {isFetchingQuote && (
              <div className="bridge-notice">
                <div className="spinner-small" />
                <span className="notice-text">Calculating best route...</span>
              </div>
            )}

            {quoteError && (
              <div
                className="bridge-notice"
                style={{
                  background: "rgba(239, 68, 68, 0.04)",
                  borderColor: "rgba(239, 68, 68, 0.12)",
                }}
              >
                <span className="notice-text" style={{ color: "#f87171" }}>
                  {quoteError}
                </span>
              </div>
            )}

            {quote && !isFetchingQuote && (
              <div className="widget-route-card animate-fade-in">
                <div className="info-row" style={{ marginBottom: "6px" }}>
                  <span className="info-label">Routing Tool</span>
                  <span className="info-value text-accent">
                    {quote.toolDetails?.name || "LI.FI Smart Routing"}
                  </span>
                </div>
                <div className="info-row" style={{ marginBottom: "6px" }}>
                  <span className="info-label">Estimated Speed</span>
                  <span className="info-value">
                    {(() => {
                      const secs = quote.estimate?.executionDuration || 120;
                      if (secs < 60) return "Instant";
                      return `~${Math.round(secs / 60)} min`;
                    })()}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Estimated Gas</span>
                  <span className="info-value">
                    {formatUsd(Number(quote.estimate?.feeUsd || 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Main action submit trigger button */}
            <button
              className="btn-swap-execute"
              disabled={
                !fromAmount ||
                parseFloat(fromAmount) <= 0 ||
                parseFloat(fromAmount) > userBalance ||
                isEstimatingGas ||
                isFetchingQuote ||
                !!quoteError ||
                !quote
              }
              onClick={handleSwapClick}
            >
              {isEstimatingGas ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    className="spinner-small"
                    style={{ borderTopColor: "#000" }}
                  />
                  <span>Estimating...</span>
                </div>
              ) : parseFloat(fromAmount) > userBalance ? (
                "Insufficient Balance"
              ) : (
                "Swap Assets"
              )}
            </button>
          </>
        ))}

      {(swapStep === "submitting" ||
        swapStep === "waiting" ||
        swapStep === "success" ||
        swapStep === "failed") && (
        <SwapStatusOverlay
          swapStep={swapStep as any}
          fromAmount={fromAmount}
          toAmount={toAmount}
          fromToken={fromToken}
          toToken={toToken}
          fromChain={fromChain}
          toChain={toChain}
          execStatus={execStatus}
          execError={execError}
          txHash={txHash}
          lifiStatus={lifiStatus}
          onReset={() => setSwapStep("form")}
        />
      )}

      {showTokenSelector && (
        <TokenSelectorModal
          target={showTokenSelector}
          allTokens={allTokens}
          networks={modalNetworks}
          activeChainFilter={activeChainFilter}
          setActiveChainFilter={(id) => {
            if (id === "octra") {
              setShowTokenSelector(null);
              onBridgeTabOpen?.();
              return;
            }
            setActiveChainFilter(id);
          }}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          customToken={customToken}
          isResolvingToken={isResolvingToken}
          tokenPrices={tokenPrices}
          onSelect={selectTokenAndChain}
          onClose={() => setShowTokenSelector(null)}
          fixedChainId={
            activeTab === "swap" && showTokenSelector === "to"
              ? fromChain.chainId
              : undefined
          }
        />
      )}
    </>
  );
}
