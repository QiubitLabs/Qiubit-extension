import { createPortal } from "react-dom";
import { CheckIcon } from "../../shared/Icons";

const OVERLAY_STYLE = {
  padding: "16px",
  position: "fixed" as const,
  inset: 0,
  zIndex: 3000,
  overflowY: "auto" as const,
  background: "var(--bg-primary)",
};

interface Chain {
  name: string;
  logoUrl: string;
}
interface TokenInfo {
  symbol: string;
}

interface SwapStatusOverlayProps {
  swapStep: "submitting" | "waiting" | "success" | "failed";
  fromAmount: string;
  toAmount: string;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  fromChain: Chain;
  toChain: Chain;
  execStatus: string;
  execError: string;
  txHash: string;
  lifiStatus: string;
  onReset: () => void;
}

export function SwapStatusOverlay({
  swapStep,
  fromAmount,
  toAmount,
  fromToken,
  toToken,
  fromChain,
  toChain,
  execStatus,
  execError,
  txHash,
  lifiStatus,
  onReset,
}: SwapStatusOverlayProps) {
  if (swapStep === "submitting" || swapStep === "waiting") {
    return createPortal(
      <div className="full-page-overlay swap-status-overlay" style={OVERLAY_STYLE}>
        <div className="complete-card">
          <div className="spinner-large-container" />
          <div className="complete-title">Executing Swap</div>
          <div className="complete-subtitle-amount">
            {fromAmount} {fromToken.symbol} to {toAmount || "..."}{" "}
            {toToken.symbol}
          </div>

          <div className="progress-steps-list">
            <div className="progress-step-item completed">
              <div className="step-icon-wrap">
                <CheckIcon size={14} />
              </div>
              <div className="step-text-label">Submit Transaction</div>
            </div>
            <div className="step-connector-line" />
            <div
              className={`progress-step-item ${swapStep === "waiting" ? "active" : ""}`}
            >
              <div className="step-icon-wrap">
                {swapStep === "waiting" ? (
                  <div className="spinner-small" />
                ) : (
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "currentColor",
                    }}
                  />
                )}
              </div>
              <div className="step-text-label">
                {lifiStatus === "PENDING"
                  ? "Bridging Assets"
                  : "Waiting for Source Confirmation"}
              </div>
            </div>
            <div className="step-connector-line" />
            <div className="progress-step-item">
              <div className="step-icon-wrap">
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "currentColor",
                  }}
                />
              </div>
              <div className="step-text-label">Completed on {toChain.name}</div>
            </div>
          </div>

          <div className="progress-notice-card">
            <div className="notice-text-content">
              {execStatus}
              {txHash && (
                <div>
                  <a
                    href={`https://etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="explorer-link"
                  >
                    View on Block Explorer
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  if (swapStep === "success") {
    return createPortal(
      <div className="full-page-overlay swap-status-overlay" style={OVERLAY_STYLE}>
        <div className="complete-card">
          <div className="success-icon-wrap">
            <div className="success-icon-circle pop-in">
              <CheckIcon size={24} />
            </div>
          </div>
          <div className="complete-title">Swap Complete</div>
          <div className="success-amount-display">
            {toAmount} {toToken.symbol}
          </div>

          <div className="success-route-container">
            <div className="success-chain-item">
              <img
                src={fromChain.logoUrl}
                alt=""
                style={{ width: 14, height: 14, borderRadius: "50%" }}
              />
              <span>{fromChain.name.split(" ")[0]}</span>
            </div>
            <div className="success-arrow-label">to</div>
            <div className="success-chain-item">
              <img
                src={toChain.logoUrl}
                alt=""
                style={{ width: 14, height: 14, borderRadius: "50%" }}
              />
              <span>{toChain.name.split(" ")[0]}</span>
            </div>
          </div>

          <div
            className="progress-notice-card"
            style={{ marginBottom: "16px" }}
          >
            <div className="notice-text-content">
              Your transaction succeeded! Assets have been swapped successfully.
            </div>
          </div>

          <button className="done-action-btn" onClick={onReset}>
            Done
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  if (swapStep === "failed") {
    return createPortal(
      <div className="full-page-overlay swap-status-overlay" style={OVERLAY_STYLE}>
        <div className="complete-card">
          <div className="success-icon-wrap">
            <div
              className="success-icon-circle pop-in"
              style={{
                background: "var(--accent-red, #ef4444)",
                boxShadow: "0px 8px 24px rgba(239, 68, 68, 0.1)",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          </div>
          <div
            className="complete-title"
            style={{ color: "var(--accent-red, #ef4444)" }}
          >
            Execution Failed
          </div>

          <div
            className="progress-notice-card"
            style={{
              marginBottom: "16px",
              borderColor: "rgba(239, 68, 68, 0.2)",
              background: "rgba(239, 68, 68, 0.04)",
            }}
          >
            <div
              className="notice-text-content"
              style={{ color: "var(--accent-red, #f87171)" }}
            >
              {execError}
            </div>
          </div>

          <button className="done-action-btn" onClick={onReset}>
            Try Again
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return null;
}
