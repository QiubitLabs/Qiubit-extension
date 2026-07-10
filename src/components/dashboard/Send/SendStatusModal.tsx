import { CloseIcon, CheckIcon } from "../../shared/Icons";
import { getNetworkForToken } from "../../../constants/networks/registry";
import { Token } from "../../../types";

interface SendStatusModalProps {
  step: "sending" | "success" | "error" | "taking_too_long";
  txHash: string;
  isEvmTx: boolean;
  txStatus: "pending" | "confirmed" | "failed" | "timeout" | null;
  error: string;
  settings: any;
  amount: string;
  selectedToken: Token | null;
  recipient?: string;
  senderAddr?: string;
  onCloseSending: () => void;
  onCancel: () => void;
  onTryAgain: () => void;
  onDoneSuccess: () => void;
}

function shortAddr(addr: string): string {
  if (!addr) return "";
  if (addr.startsWith("oct")) return addr.slice(0, 8) + "..." + addr.slice(-4);
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function SendStatusModal({
  step,
  txHash,
  isEvmTx,
  txStatus,
  error,
  settings,
  amount,
  selectedToken,
  recipient = "",
  senderAddr: _senderAddr = "",
  onCloseSending: _onCloseSending,
  onCancel,
  onTryAgain,
  onDoneSuccess,
}: SendStatusModalProps) {
  const network = selectedToken ? getNetworkForToken(selectedToken) : null;
  const networkName = network?.displayName || "Octra Network";
  const symbol = selectedToken?.symbol || "";

  return (
    <>
      {/* Sending State */}
      {step === "sending" && (
        <div
          className="complete-card animate-fade-in"
          style={{
            padding: "24px 16px",
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div className="spinner-large-container" />
          <div className="complete-title">Sending Transaction</div>
          <div className="complete-subtitle-amount">
            {amount} {symbol} {recipient ? `to ${shortAddr(recipient)}` : ""}
          </div>

          <div className="progress-steps-list">
            <div className="progress-step-item completed">
              <div
                className="step-icon-wrap"
                style={{
                  borderColor: "var(--accent-emerald)",
                  color: "var(--accent-emerald)",
                  background: "rgba(16, 185, 129, 0.08)",
                }}
              >
                <CheckIcon size={14} />
              </div>
              <span className="step-text-label">Submit Transaction</span>
            </div>
            <div
              className="step-connector-line"
              style={{ background: "var(--accent-emerald)" }}
            />
            <div className="progress-step-item active">
              <div
                className="step-icon-wrap"
                style={{
                  borderColor: "var(--widget-primary)",
                  color: "var(--widget-primary)",
                  background: "var(--widget-accent-opacity)",
                }}
              >
                <div className="spinner-small" />
              </div>
              <span
                className="step-text-label"
                style={{ color: "var(--text-primary)" }}
              >
                Waiting for Block Confirmation
              </span>
            </div>
            <div className="step-connector-line" />
            <div className="progress-step-item">
              <div className="step-icon-wrap">
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "currentColor",
                  }}
                />
              </div>
              <span className="step-text-label">
                {`Completed on ${networkName}`}
              </span>
            </div>
          </div>

          <div className="progress-notice-card" style={{ marginTop: "12px" }}>
            <div className="notice-text-content">
              Securing transaction on {networkName}...
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {step === "success" && (
        <div
          className="complete-card animate-fade-in"
          style={{
            padding: "24px 16px",
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div className="success-icon-wrap" style={{ marginBottom: "12px" }}>
            <div
              className="success-icon-circle"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--accent-emerald)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "none",
              }}
            >
              <CheckIcon size={24} />
            </div>
          </div>
          <div
            className="complete-title"
            style={{
              fontFamily: "'Outfit', sans-serif",
              fontSize: "16px",
              fontWeight: 800,
              color: "var(--text-primary)",
              marginBottom: "6px",
            }}
          >
            Transaction Complete
          </div>
          <div
            className="success-amount-display"
            style={{
              fontSize: "22px",
              fontWeight: 800,
              color: "var(--accent-emerald)",
              marginBottom: "12px",
            }}
          >
            {amount} {symbol}
          </div>

          {network && (
            <div
              className="success-route-container"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "6px 12px",
                marginBottom: "20px",
              }}
            >
              <div
                className="success-chain-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                {network.iconUrl && (
                  <img
                    src={network.iconUrl}
                    alt={network.displayName}
                    style={{ width: 14, height: 14, borderRadius: "50%" }}
                  />
                )}
                <span>{network.displayName.split(" ")[0]}</span>
              </div>
              <div
                className="success-arrow-label"
                style={{
                  fontSize: "11px",
                  color: "var(--accent-emerald)",
                  fontWeight: 700,
                }}
              >
                to
              </div>
              <div
                className="success-chain-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
              >
                {network.iconUrl && (
                  <img
                    src={network.iconUrl}
                    alt={network.displayName}
                    style={{ width: 14, height: 14, borderRadius: "50%" }}
                  />
                )}
                <span>{network.displayName.split(" ")[0]}</span>
              </div>
            </div>
          )}

          <div
            className="progress-notice-card"
            style={{ marginBottom: "24px", width: "100%" }}
          >
            <div
              className="notice-text-content"
              style={{
                fontSize: "11.5px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              <div
                style={{
                  marginBottom: "6px",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                }}
              >
                Sent to {shortAddr(recipient)}
              </div>
              <div>
                Your transaction succeeded! Assets have been transferred
                successfully.
              </div>

              {txHash && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    alignItems: "center",
                    marginTop: "12px",
                    borderTop: "1px solid var(--border-subtle)",
                    paddingTop: "12px",
                  }}
                >
                  <a
                    href={
                      isEvmTx
                        ? network?.blockExplorerUrl
                          ? `${network.blockExplorerUrl}/tx/${txHash}`
                          : `https://etherscan.io/tx/${txHash}`
                        : settings?.network !== "testnet"
                          ? `https://octrascan.io/tx.html?hash=${txHash}`
                          : `https://testnet.octrascan.io/tx.html?hash=${txHash}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="explorer-link"
                    style={{
                      fontSize: "12px",
                      color: "var(--widget-primary)",
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    View on Block Explorer
                  </a>
                  <button
                    className="addr-chip-btn"
                    style={{
                      padding: "3px 8px",
                      fontSize: "10px",
                      marginTop: "4px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                    }}
                    onClick={async () => {
                      try {
                        if (
                          navigator.clipboard &&
                          navigator.clipboard.writeText
                        ) {
                          await navigator.clipboard.writeText(txHash);
                        } else {
                          const textarea = document.createElement("textarea");
                          textarea.value = txHash;
                          textarea.style.position = "fixed";
                          textarea.style.left = "-9999px";
                          document.body.appendChild(textarea);
                          textarea.select();
                          document.execCommand("copy");
                          document.body.removeChild(textarea);
                        }
                        const btn = document.activeElement;
                        if (btn) {
                          btn.textContent = "Copied Hash";
                          setTimeout(() => {
                            btn.textContent = "Copy Tx Hash";
                          }, 1500);
                        }
                      } catch (err) {
                        console.error("Copy failed:", err);
                      }
                    }}
                  >
                    <span>Copy Tx Hash</span>
                  </button>
                </div>
              )}

              {txStatus && (
                <div
                  style={{
                    marginTop: "8px",
                    borderTop: "1px solid var(--border-subtle)",
                    paddingTop: "8px",
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {txStatus === "pending" ? (
                    <span style={{ fontStyle: "italic" }}>
                      Transaction Pending Confirmation...
                    </span>
                  ) : txStatus === "confirmed" ? (
                    <span
                      style={{
                        color: "var(--accent-emerald)",
                        fontWeight: 600,
                      }}
                    >
                      Confirmed on Chain
                    </span>
                  ) : (
                    <span>Processing on network...</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            className="done-action-btn"
            onClick={onDoneSuccess}
            style={{
              width: "100%",
              maxWidth: "200px",
              padding: "10px 0",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* Error State */}
      {step === "error" && (
        <div
          className="complete-card animate-fade-in"
          style={{
            padding: "24px 16px",
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div className="success-icon-wrap" style={{ marginBottom: "12px" }}>
            <div
              className="success-icon-circle"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--accent-red, #ef4444)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "none",
              }}
            >
              <CloseIcon size={24} />
            </div>
          </div>
          <div
            className="complete-title"
            style={{
              color: "var(--accent-red, #ef4444)",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "16px",
              fontWeight: 800,
              marginBottom: "6px",
            }}
          >
            Transaction Failed
          </div>

          <div
            className="progress-notice-card"
            style={{
              marginBottom: "24px",
              borderColor: "rgba(239, 68, 68, 0.2)",
              background: "rgba(239, 68, 68, 0.04)",
            }}
          >
            <div
              className="notice-text-content"
              style={{
                color: "var(--accent-red, #f87171)",
                wordBreak: "break-word",
                fontSize: "11.5px",
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              width: "100%",
              maxWidth: "240px",
            }}
          >
            <button
              className="done-action-btn"
              style={{
                flex: 1,
                padding: "10px 0",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              className="done-action-btn"
              style={{
                flex: 1,
                borderColor: "var(--widget-primary)",
                color: "var(--widget-primary)",
                background: "rgba(92, 103, 255, 0.05)",
                padding: "10px 0",
                borderRadius: "var(--radius-md)",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
              onClick={onTryAgain}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Taking Too Long State */}
      {step === "taking_too_long" && (
        <div
          className="complete-card animate-fade-in"
          style={{
            padding: "24px 16px",
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div className="success-icon-wrap" style={{ marginBottom: "12px" }}>
            <div
              className="success-icon-circle"
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--warning)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "none",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
          </div>
          <div
            className="complete-title"
            style={{
              color: "var(--warning)",
              fontFamily: "'Outfit', sans-serif",
              fontSize: "16px",
              fontWeight: 800,
              marginBottom: "6px",
            }}
          >
            Taking longer than usual...
          </div>

          <div
            className="progress-notice-card"
            style={{ marginBottom: "24px" }}
          >
            <div
              className="notice-text-content"
              style={{
                textAlign: "left",
                fontSize: "11.5px",
                color: "var(--text-secondary)",
                lineHeight: 1.4,
              }}
            >
              The network is slow to respond, but your transaction might still
              be processing securely in the background.
              <div
                style={{
                  marginTop: "8px",
                  background: "var(--bg-secondary)",
                  padding: "8px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: "4px",
                    color: "var(--text-primary)",
                  }}
                >
                  Recommended Action:
                </div>
                <ul style={{ listStyleType: "disc", paddingLeft: "16px" }}>
                  <li>Do not resend immediately.</li>
                  <li>Check the History tab for 'Pending' items.</li>
                </ul>
              </div>
            </div>
          </div>

          <button
            className="done-action-btn"
            onClick={onCancel}
            style={{
              width: "100%",
              maxWidth: "200px",
              padding: "10px 0",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </>
  );
}
