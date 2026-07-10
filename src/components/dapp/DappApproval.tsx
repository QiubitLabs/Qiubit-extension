/**
 * Dapp Approval Component
 * Displays a popup for approving dApp connections and transactions.
 */

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { QiubitLogo, AlertIcon, CheckIcon, CloseIcon } from "../shared/Icons";
import { ConfirmModal } from "../shared";
import { ConnectApproval } from "./ConnectApproval";
import { MessageApproval } from "./MessageApproval";
import { TransactionApproval } from "./TransactionApproval";
import { NetworkApproval } from "./NetworkApproval";
import "./AddNetworkModal.css";
import "./DappApproval.css";
import { keyringService } from "../../services/core/KeyringService";
import { decodeTx, formatDecodedTx } from "../../services/network/TxDecoder";
import {
  buildSwapSummary,
  type SwapSummary,
} from "../../services/network/SwapInfoService";
import {
  resolveNetwork,
  resolveNetworkByChainId,
} from "../../services/network/NetworkResolver";
import { useWallet } from "../../context/WalletContext";
import { Wallet } from "../../types";
import { loadSnapshot } from "../../utils/walletSnapshot";
import {
  getCachedPrices,
  getTokenPrice,
} from "../../services/network/PriceService";
import { fetchGasOptions, gweiToWei } from "../../utils/evmProvider";

interface RequestData {
  origin: string;
  icon?: string;
  // EVM/Octra actions plus solana*/sui* sign actions
  action: string;
  params?: any;
  [key: string]: any;
}

interface DappApprovalProps {
  request?: RequestData;
  onApprove?: (request: RequestData) => Promise<void>;
  onReject?: (request: RequestData) => Promise<void>;
  approvalId?: string;
  sessionKey?: string | null;
}

function truncate(addr: string, front = 6, back = 4): string {
  if (!addr || addr.length <= front + back + 3) return addr;
  return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

function formatUsd(usd: number): string {
  if (usd === 0) return "";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

interface WalletPickerProps {
  wallets: Wallet[];
  selectedOctraAddr: string;
  isEvmAction: boolean;
  getDisplayAddress: (addr: string) => string;
  onSelect: (octraAddr: string) => void;
  onClose: () => void;
}

function computeWalletUsd(address: string): number {
  const priceMap = getCachedPrices();
  const snap = loadSnapshot(address);
  if (!snap?.tokens?.length) return 0;
  return snap.tokens.reduce((sum, t) => {
    const bal =
      typeof t.balance === "string" ? parseFloat(t.balance) : t.balance || 0;
    const price =
      priceMap.get(t.symbol)?.price ??
      priceMap.get(t.symbol.toUpperCase())?.price ??
      0;
    return sum + (isNaN(bal) ? 0 : bal * price);
  }, 0);
}

function WalletPicker({
  wallets,
  selectedOctraAddr,
  isEvmAction,
  getDisplayAddress,
  onSelect,
  onClose,
}: WalletPickerProps) {
  return (
    <div className="da-picker-overlay" onClick={onClose}>
      <div className="da-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="da-picker-header">
          <span>Select wallet</span>
          <button className="da-picker-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="da-picker-list">
          {wallets.map((w, i) => {
            const evmAddr =
              w.evmAddress ?? keyringService.getEvmAddress(w.address) ?? "";
            const hasEvm = !!evmAddr;
            const displayAddr = getDisplayAddress(w.address);
            const isActive = w.address === selectedOctraAddr;
            const usdTotal = computeWalletUsd(w.address);
            const disabled = isEvmAction && !hasEvm;
            return (
              <button
                key={w.address}
                className={`da-picker-item ${isActive ? "active" : ""} ${disabled ? "disabled" : ""}`}
                onClick={() => {
                  if (!disabled) {
                    onSelect(w.address);
                    onClose();
                  }
                }}
                disabled={disabled}
              >
                <div className="da-picker-avatar">
                  {(w.name ?? `Wallet ${i + 1}`).slice(0, 1).toUpperCase()}
                </div>
                <div className="da-picker-info">
                  <span className="da-picker-name">
                    {w.name ?? `Wallet ${i + 1}`}
                  </span>
                  <span className="da-picker-addr">
                    {disabled
                      ? "No EVM address"
                      : truncate(displayAddr || w.address, 8, 6)}
                  </span>
                </div>
                <div className="da-picker-bal">
                  <span className="da-picker-usd">
                    {usdTotal > 0 ? formatUsd(usdTotal) : "$0.00"}
                  </span>
                </div>
                {isActive && <CheckIcon size={15} className="da-picker-tick" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DappApproval({
  request: propRequest,
  onApprove,
  onReject,
}: DappApprovalProps) {
  const { wallets, activeWalletIndex, setActiveWallet } = useWallet();

  const [request, setRequest] = useState<RequestData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [decodedMethod, setDecodedMethod] = useState<string | null>(null);
  const [swapSummary, setSwapSummary] = useState<SwapSummary | null>(null);
  const [simResult, setSimResult] = useState<{
    ok: boolean;
    available: boolean;
    message: string;
  } | null>(null);
  const [assetChanges, setAssetChanges] = useState<any[]>([]);
  const [approvalRisk, setApprovalRisk] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [selectedOctraAddr, setSelectedOctraAddr] = useState<string>("");
  const userPickedRef = useRef(false);

  const [feeEstimates, setFeeEstimates] = useState<{
    low: number;
    medium: number;
    high: number;
  } | null>(null);
  const [feeSpeed, setFeeSpeed] = useState<
    "slow" | "normal" | "fast" | "custom"
  >("normal");
  const [customFeeGwei, setCustomFeeGwei] = useState("10");
  const [showFeePopup, setShowFeePopup] = useState(false);
  const [evmGasOpts, setEvmGasOpts] = useState<any | null>(null);
  const [nativePriceUsd, setNativePriceUsd] = useState<number | null>(null);
  const [isLoadingFee, setIsLoadingFee] = useState(false);

  // Native token of the chain the EVM transaction targets (e.g. POL on Polygon)
  const txNet =
    request?.action === "ethSendTransaction"
      ? resolveNetworkByChainId(request?.params?.chainId || 1)
      : null;
  const txNativeSymbol = txNet?.nativeToken?.symbol ?? "ETH";

  const sessionNetSetting = request?.params?.networkSetting;
  const requestChain = request?.params?.chain;
  const currentNetwork = sessionNetSetting
    ? resolveNetwork(sessionNetSetting)
    : null;
  const NON_EVM_CHAINS = ["sui", "solana", "bitcoin", "octra"];
  const isEvmAction = !!(
    request?.action &&
    (request.action.startsWith("eth") ||
      (request.action === "connect" &&
        !NON_EVM_CHAINS.includes(requestChain) &&
        (currentNetwork
          ? currentNetwork.addressType === "evm"
          : sessionNetSetting !== "octra")))
  );
  const isOctraAction = !!(
    request?.action &&
    [
      "signMessage",
      "signTransaction",
      "sendTransaction",
      "contractCall",
      "contractView",
      "getEncryptedBalance",
    ].includes(request.action)
  );

  const getDisplayAddress = (octraAddr: string) => {
    if (!octraAddr) return "";
    const w = wallets.find((w) => w.address === octraAddr);
    if (!w) return octraAddr;

    const chain =
      request?.params?.chain ||
      (request?.action &&
        (request.action.startsWith("solana")
          ? "solana"
          : request.action.startsWith("sui")
            ? "sui"
            : request.action.startsWith("bitcoin")
              ? "bitcoin"
              : ""));

    if (chain === "sui") {
      return w.suiAddress || octraAddr;
    }
    if (chain === "solana") {
      return w.solanaAddress || octraAddr;
    }
    if (chain === "bitcoin") {
      return w.bitcoinAddress || octraAddr;
    }
    if (isEvmAction) {
      return (
        w.evmAddress || keyringService.getEvmAddress(octraAddr) || octraAddr
      );
    }
    return octraAddr;
  };

  const handleWalletSelect = async (octraAddr: string) => {
    userPickedRef.current = true;
    setSelectedOctraAddr(octraAddr);
    const idx = wallets.findIndex((w) => w.address === octraAddr);
    if (idx !== -1) {
      try {
        await setActiveWallet(idx);
      } catch (err) {
        console.error("Failed to set active wallet during selection:", err);
      }
    }
  };

  useEffect(() => {
    if (propRequest) setRequest(propRequest);
  }, [propRequest]);

  useEffect(() => {
    if (userPickedRef.current || wallets.length === 0) return;
    const activeAddr = keyringService.getActiveAddress();
    const candidate =
      activeAddr && wallets.some((w) => w.address === activeAddr)
        ? activeAddr
        : (wallets[activeWalletIndex]?.address ?? wallets[0].address);
    setSelectedOctraAddr(candidate);
  }, [wallets, activeWalletIndex]);

  useEffect(() => {
    if (!propRequest || propRequest.action !== "ethSendTransaction") return;
    const { txParams, chainId } = propRequest.params || {};
    if (!txParams?.data || txParams.data === "0x" || !txParams.to) return;
    decodeTx(txParams.data, txParams.to, chainId || 1).then((decoded) => {
      if (!decoded) return;
      setDecodedMethod(formatDecodedTx(decoded));
      buildSwapSummary(decoded, txParams.data, chainId || 1)
        .then((summary) => summary && setSwapSummary(summary))
        .catch(() => {});
    });
  }, [propRequest]);

  // Pre-flight simulation: warn the user if the EVM tx is likely to revert.
  useEffect(() => {
    if (
      !propRequest ||
      propRequest.action !== "ethSendTransaction" ||
      !selectedOctraAddr
    )
      return;
    const { txParams, chainId } = propRequest.params || {};
    if (!txParams?.to) return;
    const fromAddr = getDisplayAddress(selectedOctraAddr);
    if (!fromAddr || !fromAddr.startsWith("0x")) return;

    let active = true;
    setSimResult(null);
    setAssetChanges([]);
    setApprovalRisk(null);
    setIsSimulating(true);
    (async () => {
      try {
        const { SimulationService } =
          await import("../../services/network/SimulationService");
        const netConfig = resolveNetworkByChainId(chainId || 1);
        const res = await SimulationService.simulateEvmTransaction({
          networkId: netConfig?.id || "ethereum",
          chainId: chainId || 1,
          fromAddress: fromAddr,
          to: txParams.to,
          data: txParams.data,
          value: txParams.value,
        });
        if (active) {
          setSimResult({
            ok: !res.reverted,
            available: res.available,
            message: res.message,
          });
          setAssetChanges(res.changes || []);
          setApprovalRisk(res.approvalRisk || null);
        }
      } catch {
        if (active) setSimResult(null);
      } finally {
        if (active) setIsSimulating(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [propRequest, selectedOctraAddr]);

  useEffect(() => {
    if (
      !request ||
      request.action !== "ethSendTransaction" ||
      !selectedOctraAddr
    )
      return;
    const { txParams, chainId } = request.params || {};
    const fromAddr = getDisplayAddress(selectedOctraAddr);
    if (!fromAddr) return;

    let active = true;
    setIsLoadingFee(true);

    const run = async () => {
      try {
        const netConfig = resolveNetworkByChainId(chainId || 1);
        const networkName = netConfig?.id;

        const txForEstimation: ethers.TransactionRequest = {
          from: fromAddr,
          to: txParams.to || undefined,
          value: txParams.value || undefined,
          data: txParams.data || undefined,
        };

        let gasLimitFallback = 65_000n;
        if (txParams.gas) {
          try {
            gasLimitFallback = BigInt(txParams.gas);
          } catch {}
        }

        const [opts, priceData] = await Promise.all([
          fetchGasOptions(txForEstimation, gasLimitFallback, networkName),
          getTokenPrice(netConfig?.nativeToken?.symbol ?? "ETH").catch(
            () => null,
          ),
        ]);

        if (!active) return;

        setEvmGasOpts(opts);
        setNativePriceUsd(priceData?.price ?? null);

        const normGwei = (Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2);
        setCustomFeeGwei(normGwei);

        const toEth = (tier: any) =>
          parseFloat(
            (Number(tier.maxFeePerGas * opts.gasLimit) / 1e18).toFixed(8),
          );

        setFeeEstimates({
          low: toEth(opts.slow),
          medium: toEth(opts.normal),
          high: toEth(opts.fast),
        });
      } catch (err) {
        console.warn("EVM Fee estimate failed in DappApproval", err);
        if (active) {
          setFeeEstimates({ low: 0.0005, medium: 0.001, high: 0.0015 });
        }
      } finally {
        if (active) setIsLoadingFee(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [request, selectedOctraAddr]);

  const handleApprove = async () => {
    if (!request) return;
    setIsLoading(true);
    setError("");

    try {
      if (request.action === "ethSendTransaction") {
        const { txParams, chainId } = request.params;
        // Broadcasting uses a private RPC (Alchemy/Infura), not a public node.
        const { getEvmRpcUrlForChain } =
          await import("../../utils/evmProvider");
        const rpcUrl = getEvmRpcUrlForChain(chainId || 1);
        const activeOctraAddr = selectedOctraAddr;
        if (!activeOctraAddr) throw new Error("No wallet selected");

        const txRequest: any = {
          to: txParams.to,
          value: txParams.value || undefined,
          data: txParams.data,
          chainId: chainId || 1,
        };

        if (evmGasOpts) {
          txRequest.gasLimit = evmGasOpts.gasLimit;
        } else if (txParams.gas) {
          txRequest.gasLimit = txParams.gas;
        }

        if (evmGasOpts && feeEstimates) {
          if (feeSpeed === "custom") {
            const customWei = gweiToWei(customFeeGwei || "0");
            txRequest.maxFeePerGas = customWei;
            txRequest.maxPriorityFeePerGas =
              customWei > 1_000_000_000n ? 1_000_000_000n : customWei;
          } else {
            const tier = evmGasOpts[feeSpeed];
            if (tier) {
              txRequest.maxFeePerGas = tier.maxFeePerGas;
              txRequest.maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
            }
          }
        }

        const txResponse = await keyringService.signAndSendEvm(
          activeOctraAddr,
          txRequest,
          rpcUrl,
        );
        if (onApprove)
          await onApprove({ ...request, _evmResult: txResponse.hash });
        window.close();
        return;
      }

      if (request.action === "ethPersonalSign") {
        const { message } = request.params;
        if (!selectedOctraAddr) throw new Error("No wallet selected");
        const sig = await keyringService.signEvmMessage(
          selectedOctraAddr,
          message,
        );
        if (onApprove) await onApprove({ ...request, _evmResult: sig });
        window.close();
        return;
      }

      if (request.action === "ethSignTypedData") {
        const { typedData } = request.params;
        if (!selectedOctraAddr) throw new Error("No wallet selected");
        const sig = await keyringService.signEvmTypedData(
          selectedOctraAddr,
          typedData,
        );
        if (onApprove) await onApprove({ ...request, _evmResult: sig });
        window.close();
        return;
      }

      // Solana signing (message / transaction / batch / send)
      if (request.action.startsWith("solana")) {
        const w = wallets.find((x) => x.address === selectedOctraAddr);
        const pk = (w as any)?.solanaPrivateKeyHex;
        if (!pk) throw new Error("Solana key not found in wallet.");
        const svc = await import("../../services/network/SolanaSignService");
        let result: any;
        if (request.action === "solanaSignMessage") {
          result = {
            signature: svc.solanaSignMessage(request.params.message, pk),
            publicKey: w?.solanaAddress,
          };
        } else if (request.action === "solanaSignTransaction") {
          result = await svc.solanaSignTransaction(
            request.params.transaction,
            pk,
          );
        } else if (request.action === "solanaSignAllTransactions") {
          const txs = request.params.transactions || [];
          result = await Promise.all(
            txs.map((t: any) => svc.solanaSignTransaction(t, pk)),
          );
        } else if (request.action === "solanaSendTransaction") {
          result = await svc.solanaSendTransaction(
            request.params.transaction,
            pk,
          );
        }
        if (onApprove) await onApprove({ ...request, _evmResult: result });
        window.close();
        return;
      }

      // Sui signing (message / transaction / sign-and-execute)
      if (request.action.startsWith("sui")) {
        const w = wallets.find((x) => x.address === selectedOctraAddr);
        const pk = (w as any)?.suiPrivateKeyHex;
        if (!pk) throw new Error("Sui key not found in wallet.");
        const svc = await import("../../services/network/SuiSignService");
        let result: any;
        if (request.action === "suiSignMessage") {
          result = svc.suiSignPersonalMessage(
            request.params.message ?? request.params.txBlock,
            pk,
          );
        } else if (request.action === "suiSignAndExecuteTransaction") {
          // Sign AND broadcast/execute on-chain.
          result = await svc.suiSignAndExecute(
            request.params.transaction ?? request.params.txBlock,
            pk,
          );
        } else {
          // suiSignTransaction — sign only, return bytes + signature.
          result = svc.suiSignTransaction(
            request.params.transaction ?? request.params.txBlock,
            pk,
          );
        }
        if (onApprove) await onApprove({ ...request, _evmResult: result });
        window.close();
        return;
      }

      const selectedWallet = wallets.find(
        (w) => w.address === selectedOctraAddr,
      );
      const actualEvmAddress =
        selectedWallet?.evmAddress ||
        (selectedOctraAddr
          ? keyringService.getEvmAddress(selectedOctraAddr)
          : null) ||
        null;
      const connectResult = {
        ...request,
        _selectedOctraAddress: selectedOctraAddr,
        _selectedEvmAddress: actualEvmAddress,
      };
      if (onApprove) await onApprove(connectResult);
      window.close();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const clean = msg
        .replace(/\(.*\)/gs, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      setError(clean || "Transaction failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    try {
      if (onReject) await onReject(request);
    } finally {
      window.close();
    }
  };

  if (!request) {
    return (
      <div className="da-loading">
        <span className="da-spinner" />
      </div>
    );
  }

  let typedDataChainId: number | null = null;
  if (request.action === "ethSignTypedData" && request.params?.typedData) {
    try {
      const parsed =
        typeof request.params.typedData === "string"
          ? JSON.parse(request.params.typedData)
          : request.params.typedData;
      if (parsed?.domain?.chainId) {
        typedDataChainId = Number(parsed.domain.chainId);
      }
    } catch (e) {
      console.warn("Failed to parse typedData chainId", e);
    }
  }

  const txChainId =
    request.params?.chainId ||
    request.params?.txParams?.chainId ||
    typedDataChainId;
  const txNetwork = txChainId
    ? resolveNetworkByChainId(Number(txChainId))
    : null;
  const netSetting = request.params?.networkSetting || sessionNetSetting;
  const settingNetwork = netSetting ? resolveNetwork(netSetting) : null;
  const chainColors: Record<string, string> = {
    sui: "#6FB9FF",
    solana: "#14F195",
    bitcoin: "#F7931A",
    octra: "#00D4FF",
  };
  const headerNetLabel = isOctraAction
    ? "Octra Net"
    : (txNetwork?.displayName ??
      settingNetwork?.displayName ??
      (requestChain === "sui"
        ? "Sui"
        : requestChain === "solana"
          ? "Solana"
          : requestChain === "bitcoin"
            ? "Bitcoin"
            : netSetting === "sepolia"
              ? "Sepolia"
              : netSetting === "ethereum"
                ? "Ethereum"
                : netSetting === "octra"
                  ? "Octra"
                  : txChainId
                    ? `Chain ${txChainId}`
                    : "Ethereum"));
  const headerNetColor = isOctraAction
    ? "#00D4FF"
    : (txNetwork?.badgeColor ??
      settingNetwork?.badgeColor ??
      (requestChain && chainColors[requestChain]
        ? chainColors[requestChain]
        : netSetting === "sepolia"
          ? "#8B5CF6"
          : netSetting === "octra"
            ? "#00D4FF"
            : "#627EEA"));

  const fromChip = () => {
    const activeWallet = wallets.find((w) => w.address === selectedOctraAddr);
    const displayAddr = getDisplayAddress(selectedOctraAddr);
    const label = activeWallet?.name ?? truncate(displayAddr, 8, 6);
    return (
      <button
        className="da-from-chip"
        onClick={() => wallets.length > 1 && setShowPicker(true)}
        title={displayAddr}
        style={{ cursor: wallets.length > 1 ? "pointer" : "default" }}
      >
        <span className="da-from-dot" />
        <span className="da-from-label">{label}</span>
        <span className="da-from-addr">{truncate(displayAddr, 6, 4)}</span>
        {wallets.length > 1 && <span className="da-from-chevron">›</span>}
      </button>
    );
  };

  const renderBody = () => {
    switch (request.action) {
      case "connect":
        return (
          <ConnectApproval
            request={request}
            wallets={wallets}
            selectedOctraAddr={selectedOctraAddr}
            getDisplayAddress={getDisplayAddress}
            onWalletSelectClick={() => setShowPicker(true)}
          />
        );

      case "ethPersonalSign":
      case "signMessage":
      case "ethSignTypedData":
        return (
          <MessageApproval
            request={request}
            wallets={wallets}
            selectedOctraAddr={selectedOctraAddr}
            getDisplayAddress={getDisplayAddress}
            fromChip={fromChip}
          />
        );

      case "ethSendTransaction":
      case "sendTransaction":
      case "signTransaction":
        return (
          <TransactionApproval
            request={request}
            wallets={wallets}
            selectedOctraAddr={selectedOctraAddr}
            getDisplayAddress={getDisplayAddress}
            fromChip={fromChip}
            feeEstimates={feeEstimates}
            feeSpeed={feeSpeed}
            customFeeGwei={customFeeGwei}
            evmGasOpts={evmGasOpts}
            nativePriceUsd={nativePriceUsd}
            swapSummary={swapSummary}
            simResult={simResult}
            assetChanges={assetChanges}
            approvalRisk={approvalRisk}
            isSimulating={isSimulating}
            isLoadingFee={isLoadingFee}
            decodedMethod={decodedMethod}
            onFeeRowClick={() => setShowFeePopup(true)}
            gweiToWei={gweiToWei}
          />
        );

      case "addNetwork":
      case "switchNetwork":
        return (
          <NetworkApproval
            request={request}
            isLoading={isLoading}
            handleApprove={handleApprove}
            setShowRejectModal={setShowRejectModal}
          />
        );

      case "solanaSignMessage":
      case "suiSignMessage":
        return renderChainSign("message");

      case "solanaSignTransaction":
      case "solanaSignAllTransactions":
      case "solanaSendTransaction":
      case "suiSignTransaction":
      case "suiSignAndExecuteTransaction":
        return renderChainSign("transaction");

      default:
        return (
          <div className="da-body-content">
            <div className="da-tx-title">Unknown Request</div>
            <div className="da-site-origin small">{request.action}</div>
          </div>
        );
    }
  };

  // Minimalist approval body for Solana / Sui sign requests.
  const renderChainSign = (kind: "message" | "transaction") => {
    if (!request) return null;
    const chain = request.action.startsWith("sui") ? "Sui" : "Solana";
    const isBatch = request.action === "solanaSignAllTransactions";
    const willSend =
      request.action === "solanaSendTransaction" ||
      request.action === "suiSignAndExecuteTransaction";

    let messagePreview = "";
    if (kind === "message") {
      try {
        const m = request.params?.message ?? request.params?.txBlock;
        const bytes = Array.isArray(m)
          ? new Uint8Array(m)
          : typeof m === "string"
            ? new Uint8Array(
                atob(m)
                  .split("")
                  .map((c) => c.charCodeAt(0)),
              )
            : new Uint8Array(Object.values(m || {}));
        messagePreview = new TextDecoder().decode(bytes);
      } catch {
        messagePreview = "";
      }
    }

    const title =
      kind === "message"
        ? "Sign Message"
        : willSend
          ? "Approve & Send"
          : "Approve Transaction";

    return (
      <div className="da-body-content da-tx-layout">
        <div className="da-tx-title">{title}</div>
        <div className="da-site-origin small">{request.origin}</div>

        <div className="da-card">
          <div className="da-row">
            <span className="da-row-label">Network</span>
            <span className="da-row-val">{chain}</span>
          </div>
          <div className="da-row">
            <span className="da-row-label">Account</span>
            {fromChip()}
          </div>
          {kind === "transaction" && (
            <div className="da-row">
              <span className="da-row-label">Request</span>
              <span className="da-row-val">
                {isBatch
                  ? `${request.params?.transactions?.length ?? 0} transactions`
                  : willSend
                    ? "Sign & broadcast"
                    : "Sign transaction"}
              </span>
            </div>
          )}
        </div>

        {kind === "message" && (
          <div className="da-card">
            <div className="da-msg-label">Message</div>
            <div className="da-msg-body">
              {messagePreview || "(binary message)"}
            </div>
          </div>
        )}

        <div className="da-notice warning">
          <AlertIcon size={14} />
          <span>
            Only sign if you trust {request.origin}. Signatures can authorize
            actions on your behalf.
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="da-wrap">
      {/* Wallet picker overlay */}
      {showPicker && (
        <WalletPicker
          wallets={wallets}
          selectedOctraAddr={selectedOctraAddr}
          isEvmAction={isEvmAction}
          getDisplayAddress={getDisplayAddress}
          onSelect={handleWalletSelect}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Fee Selection Mini Popup */}
      {showFeePopup && feeEstimates && (
        <div
          className="fee-popup-overlay"
          onClick={() => setShowFeePopup(false)}
        >
          <div className="fee-popup" onClick={(e) => e.stopPropagation()}>
            <div className="fee-popup-header">
              <span className="fee-popup-title">Network Fee</span>
              <button
                className="fee-popup-close"
                onClick={() => setShowFeePopup(false)}
              ><CloseIcon size={16} /></button>
            </div>
            <div className="fee-popup-options">
              {(
                [
                  {
                    key: "slow",
                    label: "Slow",
                    desc: "Lower priority",
                    amount: feeEstimates.low,
                  },
                  {
                    key: "normal",
                    label: "Normal",
                    desc: "Recommended",
                    amount: feeEstimates.medium,
                  },
                  {
                    key: "fast",
                    label: "Fast",
                    desc: "Higher priority",
                    amount: feeEstimates.high,
                  },
                ] as const
              ).map(({ key, label, desc, amount }) => {
                const usd = nativePriceUsd ? amount * nativePriceUsd : null;
                let gweiStr = "";
                if (
                  evmGasOpts &&
                  (key === "slow" || key === "normal" || key === "fast")
                ) {
                  const gweiVal = Number(evmGasOpts[key].maxFeePerGas) / 1e9;
                  gweiStr = `${gweiVal.toFixed(2)} Gwei`;
                }
                return (
                  <button
                    key={key}
                    className={`fee-popup-option ${feeSpeed === key ? "active" : ""}`}
                    onClick={() => {
                      setFeeSpeed(key);
                      setShowFeePopup(false);
                    }}
                  >
                    <div className="fee-popup-option-info">
                      <span className="fee-popup-option-label">{label}</span>
                      <span className="fee-popup-option-desc">{desc}</span>
                    </div>
                    <div className="fee-popup-option-value">
                      <div
                        style={{
                          textAlign: "right",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                        }}
                      >
                        <div>
                          {amount.toFixed(6)} {txNativeSymbol}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                            marginTop: "2px",
                          }}
                        >
                          {gweiStr ? `${gweiStr} ` : ""}
                          {usd !== null && `(≈ $${usd.toFixed(2)})`}
                        </div>
                      </div>
                      {feeSpeed === key && (
                        <CheckIcon size={15} className="fee-popup-tick" />
                      )}
                    </div>
                  </button>
                );
              })}

              <div
                className={`fee-popup-option ${feeSpeed === "custom" ? "active" : ""}`}
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  cursor: "default",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    marginBottom: feeSpeed === "custom" ? "8px" : "0",
                  }}
                  onClick={() => setFeeSpeed("custom")}
                >
                  <div className="fee-popup-option-info">
                    <span className="fee-popup-option-label">Custom</span>
                    <span className="fee-popup-option-desc">
                      Set your own gas price
                    </span>
                  </div>
                  <div className="fee-popup-option-value">
                    {feeSpeed === "custom" && (
                      <CheckIcon size={15} className="fee-popup-tick" />
                    )}
                  </div>
                </div>
                {feeSpeed === "custom" &&
                  (() => {
                    const customWei = evmGasOpts
                      ? gweiToWei(customFeeGwei || "0")
                      : 0n;
                    const customEth = evmGasOpts
                      ? Number(customWei * evmGasOpts.gasLimit) / 1e18
                      : 0;
                    const customUsd =
                      customEth && nativePriceUsd
                        ? customEth * nativePriceUsd
                        : 0;
                    return (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          marginTop: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "center",
                            background: "var(--bg-primary)",
                            padding: "8px",
                            borderRadius: "8px",
                          }}
                        >
                          <input
                            type="number"
                            value={customFeeGwei}
                            onChange={(e) => setCustomFeeGwei(e.target.value)}
                            style={{
                              flex: 1,
                              background: "transparent",
                              border: "none",
                              color: "var(--text-primary)",
                              outline: "none",
                              fontSize: "14px",
                            }}
                            placeholder="Gas Price in Gwei"
                          />
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            Gwei
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            textAlign: "right",
                          }}
                        >
                          {customEth.toFixed(6)} {txNativeSymbol}{" "}
                          {customUsd > 0 ? `(≈ $${customUsd.toFixed(2)})` : ""}
                        </div>
                      </div>
                    );
                  })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="da-header">
        <QiubitLogo size={20} />
        <span className="da-header-name">Qiubit</span>
        <span
          className="da-net-chip"
          style={{ color: headerNetColor, background: headerNetColor + "1a" }}
        >
          {headerNetLabel}
        </span>
      </div>

      {/* Body */}
      <div className="da-body">{renderBody()}</div>

      {/* Inline error */}
      {error && (
        <div className="da-error">
          <AlertIcon size={12} />
          <span>{error}</span>
        </div>
      )}

      {/* Footer — hidden for addNetwork */}
      {request.action !== "addNetwork" && (
        <div className="da-footer">
          <button
            className="da-btn-reject"
            onClick={() => setShowRejectModal(true)}
            disabled={isLoading}
          >
            Reject
          </button>
          <button
            className="da-btn-approve"
            onClick={handleApprove}
            disabled={isLoading}
          >
            {isLoading ? <span className="da-spinner" /> : "Approve"}
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={showRejectModal}
        onConfirm={handleReject}
        onCancel={() => setShowRejectModal(false)}
        title="Reject Request?"
        message={`Reject this request from ${request.origin}?`}
        confirmText="Reject"
        cancelText="Cancel"
      />
    </div>
  );
}

export default DappApproval;
