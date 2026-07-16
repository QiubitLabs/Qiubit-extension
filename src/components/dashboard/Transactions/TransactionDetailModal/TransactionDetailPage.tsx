import { useState } from "react";
import {
  CopyIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  CheckIcon,
  ShieldIcon,
  UnshieldIcon,
  PrivateTransferIcon,
  ClaimIcon,
  ChevronLeftIcon,
  SwapIcon,
} from "../../../../components/shared/Icons";
import {
  formatAmount,
  formatHistoryAmount,
  truncateAddress,
} from "../../../../utils/crypto";
import { formatDate } from "../../../../utils/date";
import { Transaction } from "../../../../types";
import { resolveNetwork } from "../../../../services/network/NetworkResolver";
import {
  getExplorerTxUrl,
  getExplorerAddressUrl,
  type ExplorerNetwork,
} from "../../../../utils/explorer";
import { TokenIcon } from "../../../../components/shared/TokenIcon";
import "./TransactionDetailModal.css";

interface TransactionDetailPageProps {
  tx: Transaction;
  network: string;
  onBack: () => void;
  /** Active wallet's EVM address — enables Speed Up / Cancel on pending EVM txs */
  evmAddress?: string;
}

export function TransactionDetailPage({
  tx,
  network,
  onBack,
  evmAddress,
}: TransactionDetailPageProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [txAction, setTxAction] = useState<{
    busy: "speedup" | "cancel" | null;
    newHash: string;
    error: string;
  }>({ busy: null, newHash: "", error: "" });

  const runTxAction = async (kind: "speedup" | "cancel") => {
    if (!tx.hash || !tx.networkId || !evmAddress || txAction.busy) return;
    setTxAction({ busy: kind, newHash: "", error: "" });
    try {
      const { speedUpEvmTx, cancelEvmTx } = await import(
        "../../../../services/network/EvmTxActions"
      );
      const action = kind === "speedup" ? speedUpEvmTx : cancelEvmTx;
      const newHash = await action({
        hash: tx.hash,
        networkId: tx.networkId,
        fromAddress: evmAddress,
      });
      setTxAction({ busy: null, newHash, error: "" });
    } catch (e: any) {
      setTxAction({
        busy: null,
        newHash: "",
        error: e?.message || "Replacement failed",
      });
    }
  };

  const isIncoming =
    tx.type === "in" || tx.type === "claim" || tx.type === "unshield";

  const isPending = tx.status === "pending";
  const isFailed = tx.status === "failed" || tx.status === "timeout";

  let Icon = isIncoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  let iconClass = isIncoming ? "incoming" : "outgoing";

  let title = isPending ? "Pending" : isFailed ? "Failed" : "Successful";

  switch (tx.type) {
    case "shield":
      Icon = ShieldIcon;
      iconClass = "shield";
      title = isPending
        ? "Shield Pending"
        : isFailed
          ? "Shield Failed"
          : "Shield Successful";
      break;
    case "unshield":
      Icon = UnshieldIcon;
      iconClass = "unshield";
      title = isPending
        ? "Unshield Pending"
        : isFailed
          ? "Unshield Failed"
          : "Unshield Successful";
      break;
    case "private":
      Icon = PrivateTransferIcon;
      iconClass = "private";
      title = isPending
        ? "Private Transfer Pending"
        : isFailed
          ? "Private Transfer Failed"
          : "Private Sent";
      break;
    case "claim":
      Icon = ClaimIcon;
      iconClass = "claim";
      title = isPending
        ? "Claim Pending"
        : isFailed
          ? "Claim Failed"
          : "Claimed";
      break;
    case "swap":
      Icon = SwapIcon;
      iconClass = "swap";
      title = isPending
        ? "Swap Pending"
        : isFailed
          ? "Swap Failed"
          : "Swap Successful";
      break;
  }

  // resolveNetwork also covers user-added custom networks, unlike a raw
  // NETWORK_REGISTRY lookup.
  const networkConfig = tx.networkId ? resolveNetwork(tx.networkId) : null;
  const isEvmTx = networkConfig
    ? networkConfig.isEVM
    : (tx.address?.startsWith("0x") ?? false) &&
      (tx.hash?.startsWith("0x") ?? false);
  const addressType =
    networkConfig?.addressType ?? (isEvmTx ? "evm" : "octra");

  // Only show a counterparty address when it's a real address. Swaps carry no
  // meaningful counterparty, and older records may hold a network id (short
  // strings like "solana") in the address field.
  const hasValidAddress =
    !!tx.address &&
    (addressType === "evm" || addressType === "octra"
      ? tx.address.startsWith("0x") || tx.address.startsWith("oct")
      : tx.address.length >= 20);
  const showAddressRow = tx.type !== "swap" && hasValidAddress;

  const networkName =
    networkConfig?.displayName ??
    (isEvmTx
      ? "Ethereum Mainnet"
      : `Octra ${network === "testnet" ? "Testnet" : "Mainnet"}`);
  const feeSymbol =
    networkConfig?.nativeToken?.symbol ?? (isEvmTx ? "ETH" : "OCT");
  const feeLabel =
    addressType === "evm"
      ? "Gas Fee"
      : addressType === "octra"
        ? "Network Fee"
        : "Transaction Fee";

  // With no network config the legacy heuristic decides between EVM and Octra.
  const explorerCfg: ExplorerNetwork | null =
    networkConfig ?? (isEvmTx ? { addressType: "evm" } : null);
  const explorerUrl = getExplorerTxUrl(explorerCfg, tx.hash ?? "", network);
  const addressExplorerUrl = getExplorerAddressUrl(
    explorerCfg,
    tx.address,
    network,
  );

  const handleCopyAddress = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleCopyHash = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const isNativeToken =
    !tx.contractAddress ||
    tx.contractAddress === "0x0000000000000000000000000000000000000000" ||
    tx.token === networkConfig?.nativeToken?.symbol;
  const erc20Token = networkConfig?.erc20Tokens?.find(
    (t) =>
      t.symbol === tx.token ||
      t.contractAddress?.toLowerCase() === tx.contractAddress?.toLowerCase(),
  );
  const resolvedLogoUrl =
    tx.logoUrl ||
    (isNativeToken ? networkConfig?.nativeToken?.logoUrl : erc20Token?.logoUrl);

  const amountVal =
    typeof tx.amount === "string" ? parseFloat(tx.amount) : tx.amount || 0;
  const formattedAmount = formatHistoryAmount(amountVal);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-md mb-xl">
        <button className="header-icon-btn" onClick={onBack}>
          <ChevronLeftIcon size={20} />
        </button>
        <h2 className="text-lg font-semibold">Transaction Details</h2>
      </div>

      {/* Amount & Status */}
      <div className="tx-status-hero">
        {tx.type === "swap" && tx.fromTokenSymbol && tx.toTokenSymbol ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
            }}
          >
            <div className="tx-hero-badge-container">
              <TokenIcon symbol={tx.fromTokenSymbol} size={50} chainId={tx.chainId} />
            </div>
            <span
              style={{
                color: "var(--text-tertiary)",
                fontSize: "20px",
                fontWeight: 600,
              }}
            >
              →
            </span>
            <div className="tx-hero-badge-container">
              <TokenIcon symbol={tx.toTokenSymbol} size={50} />
            </div>
          </div>
        ) : (
          <div className="tx-hero-badge-container">
            <TokenIcon
              symbol={tx.token || "OCT"}
              logoUrl={resolvedLogoUrl}
              size={60}
              contractAddress={tx.contractAddress}
              chainId={tx.chainId}
            />
            <div className={`tx-action-overlay ${iconClass}`}>
              <Icon size={12} />
            </div>
          </div>
        )}

        {tx.type === "swap" && tx.fromTokenSymbol && tx.toTokenSymbol ? (
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "18px",
                fontWeight: 700,
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>
                -{formatHistoryAmount(Number(tx.fromAmount || tx.amount))}{" "}
                {tx.fromTokenSymbol}
              </span>
              <span style={{ color: "var(--text-tertiary)" }}>→</span>
              <span className="text-success">
                +{formatHistoryAmount(Number(tx.toAmount))} {tx.toTokenSymbol}
              </span>
            </div>
          </div>
        ) : (
          <h1
            className={`tx-large-amount ${iconClass}`}
            style={{ marginTop: "12px", marginBottom: "4px" }}
          >
            {isIncoming ? "+" : "-"}
            {formattedAmount} {tx.token || "OCT"}
          </h1>
        )}

        <div
          className={`tx-status-badge ${isPending ? "pending" : isFailed ? "failed" : "confirmed"}`}
          style={{ marginTop: "12px" }}
        >
          {isPending ? "Pending Confirmation" : isFailed ? "Failed" : "Confirmed"}
        </div>

        {/* Replace-by-fee actions for stuck EVM transactions */}
        {isPending && isEvmTx && evmAddress && !txAction.newHash && (
          <div className="tx-rbf-actions">
            <button
              className="tx-rbf-btn speedup"
              disabled={!!txAction.busy}
              onClick={() => runTxAction("speedup")}
            >
              {txAction.busy === "speedup" ? "Speeding up…" : "Speed Up"}
            </button>
            <button
              className="tx-rbf-btn cancel"
              disabled={!!txAction.busy}
              onClick={() => runTxAction("cancel")}
            >
              {txAction.busy === "cancel" ? "Cancelling…" : "Cancel Tx"}
            </button>
          </div>
        )}
        {txAction.newHash && (
          <p className="tx-rbf-result">
            Replacement submitted: {txAction.newHash.slice(0, 10)}…
            {txAction.newHash.slice(-8)}
          </p>
        )}
        {txAction.error && <p className="tx-rbf-error">{txAction.error}</p>}
      </div>

      {/* Details List */}
      <div className="tx-details-list">
        <div className="tx-detail-row">
          <span className="tx-detail-label">Status</span>
          <span
            className={`tx-detail-value ${isPending ? "text-warning" : isFailed ? "text-danger" : "text-success"}`}
          >
            {title}
          </span>
        </div>

        {tx.type === "swap" && tx.fromTokenSymbol && (
          <>
            <div className="tx-detail-row">
              <span className="tx-detail-label">Asset Spent</span>
              <span className="tx-detail-value">
                {formatHistoryAmount(Number(tx.fromAmount || tx.amount))}{" "}
                {tx.fromTokenSymbol}
              </span>
            </div>
            <div className="tx-detail-row">
              <span className="tx-detail-label">Asset Received</span>
              <span
                className="tx-detail-value text-success"
                style={{ fontWeight: 600 }}
              >
                {formatHistoryAmount(Number(tx.toAmount))} {tx.toTokenSymbol}
              </span>
            </div>
          </>
        )}

        <div className="tx-detail-row">
          <span className="tx-detail-label">Date</span>
          <span className="tx-detail-value">
            {formatDate(tx.timestamp, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>

        {showAddressRow && (
          <div className="tx-detail-row">
            <span className="tx-detail-label">
              {isIncoming ? "From" : "To"}
            </span>
            <div className="tx-detail-value-group">
              <a
                href={addressExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-detail-value mono clickable hover-underline"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {truncateAddress(tx.address, 6, 6)}
              </a>
              <button
                className="tx-mini-copy"
                onClick={() => handleCopyAddress(tx.address)}
              >
                {copiedAddress ? (
                  <CheckIcon size={12} />
                ) : (
                  <CopyIcon size={12} />
                )}
              </button>
            </div>
          </div>
        )}

        {tx.token && tx.token !== feeSymbol && addressType !== "octra" && (
          <div className="tx-detail-row">
            <span className="tx-detail-label">Token</span>
            <span className="tx-detail-value">{tx.token}</span>
          </div>
        )}

        <div className="tx-detail-row">
          <span className="tx-detail-label">{feeLabel}</span>
          <span className="tx-detail-value">
            {addressType === "octra"
              ? `${tx.ou ? formatAmount(parseInt(tx.ou.toString()) / 1000000) : formatAmount(tx.fee || 0)} OCT`
              : `${tx.fee || 0} ${feeSymbol}`}
          </span>
        </div>

        {tx.epoch && (
          <div className="tx-detail-row">
            <span className="tx-detail-label">Epoch</span>
            <span className="tx-detail-value">#{tx.epoch}</span>
          </div>
        )}

        <div className="tx-detail-row">
          <span className="tx-detail-label">Network</span>
          <span className="tx-detail-value">{networkName}</span>
        </div>
      </div>

      {/* Hash & Explorer */}
      <div className="tx-hash-section">
        <div className="tx-hash-header">
          <span className="tx-hash-label">Transaction Hash</span>
          <button
            className="tx-mini-copy"
            onClick={() => handleCopyHash(tx.hash || "")}
          >
            {copiedHash ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
          </button>
        </div>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="tx-hash-value mono clickable"
        >
          {tx.hash}
        </a>
      </div>
    </div>
  );
}
