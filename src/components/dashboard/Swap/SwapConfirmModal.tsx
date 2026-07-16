import { useState } from "react";
import { createPortal } from "react-dom";
import { formatAmount } from "../../../utils/crypto";
import {
  ChevronLeftIcon,
  CheckIcon,
  ChevronDownIcon,
} from "../../shared/Icons";
import { TokenIcon } from "../../shared/TokenIcon";
import { NetworkFeeSheet } from "../../shared/NetworkFeeSheet/NetworkFeeSheet";

interface SwapConfirmModalProps {
  fromToken: any;
  toToken: any;
  fromChain: any;
  toChain: any;
  fromAmount: string;
  toAmount: string;
  wallet: any;
  fee: number;
  ethPriceUsd: number | null;
  feeSpeed: "slow" | "normal" | "fast" | "custom";
  setFeeSpeed: (speed: "slow" | "normal" | "fast" | "custom") => void;
  customFeeGwei: string;
  setCustomFeeGwei: (gwei: string) => void;
  feeEstimates: { low: number; medium: number; high: number };
  evmGasOpts: any;
  showFeePopup: boolean;
  setShowFeePopup: (show: boolean) => void;
  handleConfirmSwap: () => void;
  onBack: () => void;
  title?: string;
  txData?: string; // Optional LI.FI swap transaction request base64 string
}

function shortAddr(addr: string): string {
  if (!addr) return "";
  if (addr.startsWith("oct")) return addr.slice(0, 8) + "..." + addr.slice(-4);
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function AddressRow({ label, addr }: { label: string; addr: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ marginBottom: "12px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="detail-label">{label}</span>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="addr-chip-btn"
        >
          <span>{shortAddr(addr)}</span>
          <ChevronDownIcon
            size={12}
            style={{
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.18s",
              color: "var(--text-secondary)",
              flexShrink: 0,
            }}
          />
        </button>
      </div>
      {expanded && (
        <div className="expanded-address-container active">{addr}</div>
      )}
    </div>
  );
}

function ChainRow({ label, chain }: { label: string; chain: any }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
      }}
    >
      <span className="detail-label">{label}</span>
      <div className="chain-badge">
        {chain?.logoUrl && (
          <img
            src={chain.logoUrl}
            alt=""
            className="chain-logo"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <span className="chain-name">{chain?.name}</span>
      </div>
    </div>
  );
}

export function SwapConfirmModal({
  fromToken,
  toToken,
  fromChain,
  toChain,
  fromAmount,
  toAmount,
  wallet,
  fee,
  ethPriceUsd,
  feeSpeed,
  setFeeSpeed,
  customFeeGwei,
  setCustomFeeGwei,
  feeEstimates,
  evmGasOpts,
  showFeePopup,
  setShowFeePopup,
  handleConfirmSwap,
  onBack,
  title = "Confirm Swap",
  txData: _txData,
}: SwapConfirmModalProps) {
  const fromSymbol = fromToken?.symbol || "";
  const toSymbol = toToken?.symbol || "";
  let senderAddr = wallet?.evmAddress || wallet?.address || "";
  if (fromChain?.id?.startsWith("solana")) {
    senderAddr = wallet?.solanaAddress || "";
  } else if (fromChain?.id?.startsWith("sui")) {
    senderAddr = wallet?.suiAddress || "";
  } else if (fromChain?.id?.startsWith("bitcoin")) {
    senderAddr = wallet?.bitcoinAddress || "";
  }

  let destAddr = wallet?.evmAddress || wallet?.address || "";
  if (toChain?.id?.startsWith("solana")) {
    destAddr = wallet?.solanaAddress || "";
  } else if (toChain?.id?.startsWith("sui")) {
    destAddr = wallet?.suiAddress || "";
  } else if (toChain?.id?.startsWith("bitcoin")) {
    destAddr = wallet?.bitcoinAddress || "";
  }

  const hasFromContract =
    fromToken?.contractAddress &&
    fromToken.contractAddress !==
      "0x0000000000000000000000000000000000000000" &&
    fromToken.contractAddress !== "bitcoin" &&
    fromToken.contractAddress !== "sui";
  const hasToContract =
    toToken?.contractAddress &&
    toToken.contractAddress !== "0x0000000000000000000000000000000000000000" &&
    toToken.contractAddress !== "bitcoin" &&
    toToken.contractAddress !== "sui";

  return createPortal(
    <div
      className="full-page-overlay animate-fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        overflowY: "auto",
        background: "var(--bg-primary)",
      }}
    >
      {/* Header */}
      <div
        className="view-header"
        style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}
      >
        <button onClick={onBack} className="back-btn">
          <ChevronLeftIcon size={20} />
        </button>
        <span className="view-title">{title}</span>
      </div>

      {/* Token Flow Card */}
      <div
        className="flow-card-unified"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "16px",
          padding: "16px",
          marginBottom: "16px",
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {/* Pay Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            paddingBottom: "16px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
          }}
        >
          <div
            className="token-logo-wrap"
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "var(--bg-card)",
              border: "1.5px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <TokenIcon
              symbol={fromSymbol}
              logoUrl={fromToken?.logoUrl}
              size={44}
            />
          </div>
          <div
            className="token-flow-info"
            style={{ display: "flex", flexDirection: "column", flex: 1 }}
          >
            <span
              className="flow-label"
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                letterSpacing: "0.8px",
                marginBottom: "4px",
              }}
            >
              Pay
            </span>
            <span
              className="flow-amount-text"
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              {fromAmount}{" "}
              <span
                className="flow-symbol-text"
                style={{
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                }}
              >
                {fromSymbol}
              </span>
            </span>
          </div>
        </div>

        {/* Overlapping cut-out Divider Arrow */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            height: "0",
            position: "relative",
            zIndex: 10,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-15px",
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "50%",
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 8"
              fill="none"
              style={{ color: "var(--text-secondary)" }}
            >
              <path
                d="M1 1L6 7L11 1"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Receive Row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            paddingTop: "16px",
          }}
        >
          <div
            className="token-logo-wrap"
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "var(--bg-card)",
              border: "1.5px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <TokenIcon symbol={toSymbol} logoUrl={toToken?.logoUrl} size={44} />
          </div>
          <div
            className="token-flow-info"
            style={{ display: "flex", flexDirection: "column", flex: 1 }}
          >
            <span
              className="flow-label"
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                color: "var(--success)",
                letterSpacing: "0.8px",
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              Receive
              <span
                className="estimate-badge"
                style={{
                  fontSize: "8px",
                  background: "var(--success-bg)",
                  color: "var(--success)",
                  border: "1px solid rgba(0, 200, 83, 0.2)",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Estimate
              </span>
            </span>
            <span
              className="flow-amount-text"
              style={{
                fontSize: "22px",
                fontWeight: 800,
                color: "var(--success)",
                lineHeight: 1.2,
              }}
            >
              {toAmount}{" "}
              <span
                className="flow-symbol-text"
                style={{
                  fontSize: "15px",
                  fontWeight: 500,
                  color: "rgba(0, 200, 83, 0.7)",
                }}
              >
                {toSymbol}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Details Card */}
      <div className="details-card" style={{ marginBottom: "16px" }}>
        {senderAddr && <AddressRow label="From" addr={senderAddr} />}
        {destAddr && destAddr !== senderAddr && (
          <AddressRow label="To" addr={destAddr} />
        )}

        <ChainRow label="From chain" chain={fromChain} />
        <ChainRow label="To chain" chain={toChain} />

        {hasFromContract && (
          <AddressRow label="Token contract" addr={fromToken.contractAddress} />
        )}

        {hasToContract && (
          <AddressRow label="Dest contract" addr={toToken.contractAddress} />
        )}



        {/* Network Fee */}
        <div
          onClick={() => setShowFeePopup(true)}
          className="detail-row border-top"
          style={{ cursor: "pointer" }}
        >
          <span className="detail-label">
            Network fee
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              style={{ color: "var(--text-secondary)", marginLeft: "4px" }}
            >
              <path
                d="M11 19H13V17H11V19ZM12 2C10.0222 2 8.08879 2.58649 6.4443 3.6853C4.79981 4.78412 3.51809 6.3459 2.76121 8.17317C2.00433 10.0004 1.8063 12.0111 2.19215 13.9509C2.578 15.8907 3.53041 17.6725 4.92894 19.0711C6.32746 20.4696 8.10929 21.422 10.0491 21.8079C11.9889 22.1937 13.9996 21.9957 15.8268 21.2388C17.6541 20.4819 19.2159 19.2002 20.3147 17.5557C21.4135 15.9112 22 13.9778 22 12C22 9.34784 20.9464 6.8043 19.0711 4.92893C17.1957 3.05357 14.6522 2 12 2ZM12 20C10.4178 20 8.87104 19.5308 7.55544 18.6518C6.23985 17.7727 5.21447 16.5233 4.60897 15.0615C4.00347 13.5997 3.84504 11.9911 4.15372 10.4393C4.4624 8.88743 5.22433 7.46196 6.34315 6.34315C7.46197 5.22433 8.88744 4.4624 10.4393 4.15372C11.9911 3.84504 13.5997 4.00346 15.0615 4.60896C16.5233 5.21447 17.7727 6.23984 18.6518 7.55544C19.5308 8.87103 20 10.4177 20 12C20 14.1217 19.1572 16.1566 17.6569 17.6569C16.1566 19.1571 14.1217 20 12 20Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div className="network-fee-block">
            <span className="network-fee-val">
              {fee ? `${formatAmount(fee, 6)} ${fromChain?.symbol}` : "--"}
            </span>
            {fee && ethPriceUsd && (
              <div className="network-fee-fiat">
                ≈ ${(fee * ethPriceUsd).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Button */}
      <button className="action-button-main" onClick={handleConfirmSwap}>
        <CheckIcon size={18} />
        <span>Confirm Swap</span>
      </button>

      <NetworkFeeSheet
        show={showFeePopup}
        onClose={() => setShowFeePopup(false)}
        feeSpeed={feeSpeed}
        setFeeSpeed={setFeeSpeed}
        feeEstimates={feeEstimates}
        evmGasOpts={evmGasOpts ?? null}
        customFeeGwei={customFeeGwei}
        setCustomFeeGwei={setCustomFeeGwei}
        gasSymbol={fromChain?.symbol ?? ""}
        ethPriceUsd={ethPriceUsd}
      />
    </div>,
    document.body,
  );
}
