import { Wallet } from "../../types";
import { resolveNetworkByChainId } from "../../services/network/NetworkResolver";
import type { SwapSummary } from "../../services/network/SwapInfoService";
import { formatUsd } from "../../services/network/PriceService";
import { AlertIcon } from "../shared/Icons";

interface RequestData {
  origin: string;
  icon?: string;
  action: string;
  params?: any;
  [key: string]: any;
}

interface TransactionApprovalProps {
  request: RequestData;
  wallets: Wallet[];
  selectedOctraAddr: string;
  getDisplayAddress: (addr: string) => string;
  fromChip: () => React.ReactNode;
  feeEstimates: { low: number; medium: number; high: number } | null;
  feeSpeed: "slow" | "normal" | "fast" | "custom";
  customFeeGwei: string;
  evmGasOpts: any;
  nativePriceUsd: number | null;
  swapSummary: SwapSummary | null;
  simResult: { ok: boolean; available: boolean; message: string } | null;
  assetChanges: Array<{
    direction: "in" | "out" | "approve";
    symbol: string;
    amount: string;
    isNative: boolean;
    assetType: string;
    tokenId?: string;
    logo?: string;
  }>;
  approvalRisk: {
    unlimited: boolean;
    spender: string;
    token: string;
    isSetApprovalForAll: boolean;
  } | null;
  isSimulating: boolean;
  isLoadingFee: boolean;
  decodedMethod: string | null;
  onFeeRowClick: () => void;
  gweiToWei: (gwei: string) => bigint;
}

function truncate(addr: string, front = 6, back = 4): string {
  if (!addr || addr.length <= front + back + 3) return addr;
  return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

/** "swapTokensSingleV3NativeToERC20(bytes32,…)" → "Swap Tokens Single V3 Native To ERC20" */
function humanizeMethod(decoded: string): string {
  const name = decoded.split("(")[0].trim();
  const spaced = name
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatAmount(value: string, maxDecimals = 6): string {
  const num = parseFloat(value);
  if (!isFinite(num)) return value;
  return num.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

export function TransactionApproval({
  request,
  wallets: _wallets,
  selectedOctraAddr: _selectedOctraAddr,
  getDisplayAddress: _getDisplayAddress,
  fromChip,
  feeEstimates,
  feeSpeed,
  customFeeGwei,
  evmGasOpts,
  nativePriceUsd,
  swapSummary,
  simResult,
  assetChanges,
  approvalRisk,
  isSimulating,
  isLoadingFee,
  decodedMethod,
  onFeeRowClick,
  gweiToWei,
}: TransactionApprovalProps) {
  const isEvmTx = request.action === "ethSendTransaction";

  if (isEvmTx) {
    const { txParams, chainId } = request.params || {};
    const net = resolveNetworkByChainId(chainId || 1);
    const isContract = !!(txParams?.data && txParams.data !== "0x");
    const explorerBase = net?.blockExplorerUrl;
    const nativeSymbol = net?.nativeToken?.symbol ?? "ETH";

    const ethValue = txParams?.value
      ? (Number(BigInt(txParams.value)) / 1e18).toFixed(6)
      : "0.000000";

    let currentFee = 0.0015;
    if (feeEstimates) {
      if (feeSpeed === "slow") currentFee = feeEstimates.low;
      else if (feeSpeed === "fast") currentFee = feeEstimates.high;
      else if (feeSpeed === "custom" && evmGasOpts) {
        const customWei = gweiToWei(customFeeGwei || "0");
        currentFee = Number(customWei * evmGasOpts.gasLimit) / 1e18;
      } else {
        currentFee = feeEstimates.medium;
      }
    }

    const valueNum = parseFloat(ethValue);
    const valueUsd = nativePriceUsd ? valueNum * nativePriceUsd : 0;
    const feeUsd = nativePriceUsd ? currentFee * nativePriceUsd : 0;

    return (
      <div className="da-body-content da-tx-layout">
        <div className="da-tx-title">Confirm Transaction</div>
        <div className="da-site-origin small">{request.origin}</div>

        {/* Pre-flight simulation banner */}
        {isSimulating && (
          <div className="da-sim-banner pending">
            <span className="da-sim-dot" />
            Simulating transaction…
          </div>
        )}
        {!isSimulating && simResult && simResult.available && (
          <div className={`da-sim-banner ${simResult.ok ? "ok" : "fail"}`}>
            <AlertIcon size={14} />
            <span>
              {simResult.ok
                ? "Simulation passed — no revert detected."
                : `This transaction is likely to fail: ${simResult.message}`}
            </span>
          </div>
        )}
        {!isSimulating && simResult && !simResult.available && (
          <div className="da-sim-banner neutral">
            <span>Simulation unavailable — check details carefully.</span>
          </div>
        )}

        {/* Unlimited approval warning (from calldata, always reliable) */}
        {approvalRisk && approvalRisk.unlimited && (
          <div className="da-sim-banner fail">
            <AlertIcon size={14} />
            <span>
              {approvalRisk.isSetApprovalForAll
                ? "This grants access to ALL your NFTs in this collection."
                : "This grants an UNLIMITED spending approval."}{" "}
              Spender {truncate(approvalRisk.spender, 6, 4)}.
            </span>
          </div>
        )}

        {/* Skeleton for balance changes while the simulation runs */}
        {isSimulating && isContract && (
          <div className="da-card da-balance-card">
            <div className="da-balance-title">Balance changes</div>
            {[0, 1].map((i) => (
              <div className="da-row" key={i}>
                <span className="da-skeleton da-skeleton-label" />
                <span className="da-skeleton da-skeleton-val" />
              </div>
            ))}
          </div>
        )}

        {/* Balance changes (Rabby-style), from alchemy_simulateAssetChanges */}
        {!isSimulating && assetChanges && assetChanges.length > 0 && (
          <div className="da-card da-balance-card">
            <div className="da-balance-title">Balance changes</div>
            {assetChanges.map((c, i) => {
              const sign = c.direction === "in" ? "+" : "−";
              const isNft =
                c.assetType === "ERC721" || c.assetType === "ERC1155";
              return (
                <div className="da-row" key={i}>
                  <span className="da-row-label">
                    {c.direction === "approve"
                      ? "Approve"
                      : c.direction === "in"
                        ? "You receive"
                        : "You send"}
                  </span>
                  <span className="da-bal-val-group">
                    {c.logo ? (
                      <img
                        className="da-bal-logo"
                        src={c.logo}
                        alt=""
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                    ) : (
                      <span className="da-bal-logo da-bal-logo-fallback">
                        {c.symbol?.slice(0, 1).toUpperCase() || "?"}
                      </span>
                    )}
                    <span
                      className={`da-row-val font-semibold da-bal-${c.direction}`}
                    >
                      {c.direction === "approve"
                        ? c.symbol
                        : isNft
                          ? `${sign} ${c.symbol}${c.tokenId ? " #" + c.tokenId : ""}`
                          : `${sign} ${formatAmount(c.amount)} ${c.symbol}`}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {swapSummary ? (
          <>
            {/* Minimalist swap hero: token → token with chains */}
            <div className="da-swap-hero">
              <div className="da-swap-leg">
                <span className="da-swap-cap">You pay</span>
                <span className="da-swap-amt">
                  {formatAmount(swapSummary.fromAmount)} {swapSummary.fromSymbol}
                </span>
                <span className="da-swap-meta">
                  {swapSummary.fromChainName ?? net?.displayName ?? ""}
                  {swapSummary.fromUsd != null
                    ? ` · ${formatUsd(swapSummary.fromUsd)}`
                    : ""}
                </span>
              </div>
              <div className="da-swap-sep">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </div>
              <div className="da-swap-leg">
                <span className="da-swap-cap">
                  You receive{swapSummary.minReceived ? " (min)" : ""}
                </span>
                <span className="da-swap-amt accent">
                  {swapSummary.minReceived
                    ? `${formatAmount(swapSummary.minReceived)} `
                    : ""}
                  {swapSummary.toSymbol}
                </span>
                <span className="da-swap-meta">
                  {swapSummary.toChainName ??
                    swapSummary.fromChainName ??
                    net?.displayName ??
                    ""}
                  {swapSummary.toUsd != null
                    ? ` · ${formatUsd(swapSummary.toUsd)}`
                    : ""}
                </span>
              </div>
            </div>

            {/* Compact details: contracts, router, receiver, fee */}
            <div className="da-card">
              <div className="da-row">
                <span className="da-row-label">From account</span>
                {fromChip()}
              </div>
              {swapSummary.receiver && (
                <div className="da-row">
                  <span className="da-row-label">Recipient</span>
                  {explorerBase ? (
                    <a
                      className="da-row-val mono da-link"
                      href={`${explorerBase}/address/${swapSummary.receiver}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={swapSummary.receiver}
                    >
                      {truncate(swapSummary.receiver, 8, 6)}
                    </a>
                  ) : (
                    <span className="da-row-val mono">
                      {truncate(swapSummary.receiver, 8, 6)}
                    </span>
                  )}
                </div>
              )}
              <div className="da-row">
                <span className="da-row-label">Token in</span>
                {swapSummary.fromIsNative ? (
                  <span className="da-row-val">
                    {swapSummary.fromSymbol} · native
                  </span>
                ) : explorerBase ? (
                  <a
                    className="da-row-val mono da-link"
                    href={`${explorerBase}/token/${swapSummary.fromToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={swapSummary.fromToken}
                  >
                    {truncate(swapSummary.fromToken, 8, 6)}
                  </a>
                ) : (
                  <span
                    className="da-row-val mono"
                    title={swapSummary.fromToken}
                  >
                    {truncate(swapSummary.fromToken, 8, 6)}
                  </span>
                )}
              </div>
              <div className="da-row">
                <span className="da-row-label">Token out</span>
                {swapSummary.toIsNative ? (
                  <span className="da-row-val">
                    {swapSummary.toSymbol} · native
                  </span>
                ) : explorerBase ? (
                  <a
                    className="da-row-val mono da-link"
                    href={`${explorerBase}/token/${swapSummary.toToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={swapSummary.toToken}
                  >
                    {truncate(swapSummary.toToken, 8, 6)}
                  </a>
                ) : (
                  <span className="da-row-val mono" title={swapSummary.toToken}>
                    {truncate(swapSummary.toToken, 8, 6)}
                  </span>
                )}
              </div>
              {txParams?.to && (
                <div className="da-row">
                  <span className="da-row-label">Router</span>
                  {explorerBase ? (
                    <a
                      className="da-row-val mono da-link"
                      href={`${explorerBase}/address/${txParams.to}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={txParams.to}
                    >
                      {truncate(txParams.to, 8, 6)}
                    </a>
                  ) : (
                    <span className="da-row-val mono" title={txParams.to}>
                      {truncate(txParams.to, 8, 6)}
                    </span>
                  )}
                </div>
              )}
              <div
                className="da-row clickable-fee-row"
                onClick={() => feeEstimates && onFeeRowClick()}
                style={{ cursor: feeEstimates ? "pointer" : "default" }}
              >
                <span className="da-row-label select-fee-label">
                  Network fee <span className="da-edit-badge">Edit</span>
                </span>
                <div className="da-row-val-group">
                  <span className="da-row-val font-semibold">
                    {isLoadingFee
                      ? "Estimating…"
                      : `${currentFee.toFixed(6)} ${nativeSymbol}`}
                  </span>
                  {!isLoadingFee && nativePriceUsd && (
                    <div className="da-row-subval">≈ {formatUsd(feeUsd)}</div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="da-card">
            <div className="da-row">
              <span className="da-row-label">From account</span>
              {fromChip()}
            </div>
            {txParams?.to && (
              <div className="da-row">
                <span className="da-row-label">
                  {isContract ? "Contract" : "To"}
                </span>
                {explorerBase ? (
                  <a
                    className="da-row-val mono da-link"
                    href={`${explorerBase}/address/${txParams.to}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={txParams.to}
                  >
                    {truncate(txParams.to, 8, 6)}
                  </a>
                ) : (
                  <span className="da-row-val mono">
                    {truncate(txParams.to, 8, 6)}
                  </span>
                )}
              </div>
            )}
            {valueNum > 0 && (
              <div className="da-row">
                <span className="da-row-label">Value</span>
                <div className="da-row-val-group">
                  <span className="da-row-val font-semibold">
                    {ethValue} {nativeSymbol}
                  </span>
                  {nativePriceUsd && valueUsd > 0 && (
                    <div className="da-row-subval">≈ {formatUsd(valueUsd)}</div>
                  )}
                </div>
              </div>
            )}
            {decodedMethod && (
              <div className="da-row">
                <span className="da-row-label">Action</span>
                <span
                  className="da-row-val decoded-method-val"
                  title={decodedMethod}
                >
                  {humanizeMethod(decodedMethod)}
                </span>
              </div>
            )}
            {isContract && !decodedMethod && txParams?.data && (
              <div className="da-row">
                <span className="da-row-label">Data</span>
                <span className="da-row-val mono small">
                  {txParams.data.slice(0, 14)}…
                </span>
              </div>
            )}
            <div
              className="da-row clickable-fee-row"
              onClick={() => feeEstimates && onFeeRowClick()}
              style={{ cursor: feeEstimates ? "pointer" : "default" }}
            >
              <span className="da-row-label select-fee-label">
                Network fee <span className="da-edit-badge">Edit</span>
              </span>
              <div className="da-row-val-group">
                <span
                  className="da-row-val font-semibold"
                  style={{
                    color:
                      feeSpeed === "custom" ? "#00D4FF" : "var(--text-primary)",
                  }}
                >
                  {isLoadingFee
                    ? "Estimating…"
                    : `${currentFee.toFixed(6)} ${nativeSymbol}`}
                </span>
                {!isLoadingFee && nativePriceUsd && (
                  <div className="da-row-subval">≈ {formatUsd(feeUsd)}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Warning notice */}
        <div className="da-notice warning">
          <AlertIcon size={14} />
          <span>
            Verify transaction details carefully. This action cannot be undone
            once broadcast to the blockchain.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="da-body-content da-tx-layout">
      <div className="da-tx-title">
        {request.action === "sendTransaction"
          ? "Send Transaction"
          : "Sign Transaction"}
      </div>
      <div className="da-site-origin small">{request.origin}</div>

      <div className="da-card">
        <div className="da-row">
          <span className="da-row-label">From Account</span>
          {fromChip()}
        </div>
        <div className="da-row">
          <span className="da-row-label">Amount</span>
          <span className="da-row-val font-bold text-lg">
            {request.params?.value || "0"} OCT
          </span>
        </div>
      </div>

      <div className="da-notice warning">
        <AlertIcon size={14} />
        <span>
          Ensure you trust the origin site before signing or broadcasting this
          Octra transaction.
        </span>
      </div>
    </div>
  );
}

export default TransactionApproval;
