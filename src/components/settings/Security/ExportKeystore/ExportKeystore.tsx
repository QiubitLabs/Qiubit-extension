import { useState } from "react";
import {
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  CheckIcon,
  LockIcon,
  AlertIcon,
  ImportIcon,
} from "../../../shared/Icons";
import { verifyPasswordSecure as verifyPassword } from "../../../../utils/storage";
import { exportWalletSecure as exportWallet } from "../../../../utils/storage/vault";
import { Wallet } from "../../../../types";
import "../Security.css";

interface ExportKeystoreProps {
  wallet: Wallet;
  onBack: () => void;
}

export function ExportKeystore({ wallet, onBack }: ExportKeystoreProps) {
  const [showInputPassword, setShowInputPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showJsonContent, setShowJsonContent] = useState(false);

  const handleVerifyPassword = async () => {
    if (!inputPassword.trim()) {
      setError("Please enter your password");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const isValid = await verifyPassword(inputPassword);
      if (isValid) {
        setIsVerified(true);
      } else {
        setError("Incorrect password");
      }
    } catch (err: any) {
      setError("Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDownload = () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const filename = `qiubit_wallet_${wallet.address.slice(-8)}_${timestamp}.json`;
    exportWallet(wallet, filename);
  };

  const getKeystoreString = () => {
    const data = {
      name: wallet.name || "Qiubit Wallet",
      totalBalanceUsd: wallet.lastKnownBalance ?? 0,
      mnemonic: wallet.mnemonic,
      suiAddress: wallet.suiAddress,
      suiPrivateKey: wallet.suiPrivateKeyHex,
      solanaAddress: wallet.solanaAddress,
      solanaPrivateKey: wallet.solanaPrivateKeyHex,
      octraAddress: wallet.address,
      octraPrivateKey: wallet.privateKeyHex,
      evmAddress: wallet.evmAddress,
      evmPrivateKey: wallet.privateKeyHex,
      bitcoinAddress: wallet.bitcoinAddress,
      bitcoinPrivateKey: wallet.bitcoinPrivateKeyHex,
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getKeystoreString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  return (
    <div className="animate-fade-in">
      <header className="wallet-header">
        <div className="flex items-center gap-md">
          <button className="header-icon-btn" onClick={onBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-lg font-semibold">Export Keystore</span>
        </div>
      </header>

      <div className="wallet-content">
        {!isVerified ? (
          <>
            <div className="text-center mb-xl">
              <div
                className="lock-icon-container"
                style={{
                  margin: "0 auto var(--space-lg)",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <div className="lock-icon-circle">
                  <LockIcon size={28} />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-sm">Verify Password</h3>
              <p className="text-secondary text-sm">
                Enter your wallet password to export your keystore file
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-with-icon">
                <input
                  type={showInputPassword ? "text" : "password"}
                  className={`input input-lg ${error ? "input-error" : ""}`}
                  value={inputPassword}
                  onChange={(e) => {
                    setInputPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter your password"
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword()}
                  autoFocus
                />
                <button
                  type="button"
                  className="input-icon-btn"
                  onClick={() => setShowInputPassword(!showInputPassword)}
                  tabIndex={-1}
                >
                  {showInputPassword ? (
                    <EyeOffIcon size={18} />
                  ) : (
                    <EyeIcon size={18} />
                  )}
                </button>
              </div>
              {error && (
                <p className="form-error text-error text-sm mt-sm">{error}</p>
              )}
            </div>

            <button
              className="btn btn-primary btn-lg btn-full verify-btn-no-shrink"
              onClick={handleVerifyPassword}
              disabled={isVerifying || !inputPassword.trim()}
            >
              {isVerifying ? <span className="loading-spinner" /> : "Verify"}
            </button>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              paddingBottom: "16px",
            }}
          >
            {/* Security Warning */}
            <div className="security-notice">
              <AlertIcon className="security-notice-icon" size={16} style={{ flexShrink: 0 }} />
              <p className="security-notice-text">
                Never share your Keystore file or content. Anyone who obtains this JSON can access all private keys and completely control your assets.
              </p>
            </div>

            <div
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-default)",
                borderRadius: "12px",
                padding: "20px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px"
              }}
            >
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#3b82f6",
                  marginBottom: "4px"
                }}
              >
                <ImportIcon size={24} />
              </div>
              <h4 style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-primary)", margin: 0 }}>
                Download Keystore Backup
              </h4>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: 0, lineHeight: "1.5" }}>
                Save this JSON backup file to a safe offline storage to secure your multi-chain private keys.
              </p>
              <button
                className="btn btn-primary btn-lg btn-full verify-btn-no-shrink"
                onClick={handleDownload}
                style={{ marginTop: "8px" }}
              >
                Download JSON File
              </button>
            </div>

            {/* Collapsible JSON Viewer */}
            <div style={{ marginTop: "8px" }}>
              <button
                onClick={() => setShowJsonContent(!showJsonContent)}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px"
                }}
              >
                <span>{showJsonContent ? "Hide JSON Content" : "Show JSON Content"}</span>
              </button>

              {showJsonContent && (
                <div style={{ marginTop: "12px", position: "relative" }}>
                  <textarea
                    readOnly
                    value={getKeystoreString()}
                    rows={8}
                    style={{
                      width: "100%",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "12px",
                      padding: "12px",
                      color: "var(--text-primary)",
                      fontSize: "12px",
                      resize: "none",
                      fontFamily: "var(--font-mono)",
                      outline: "none"
                    }}
                  />
                  <button
                    onClick={handleCopy}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "12px",
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "8px",
                      width: "32px",
                      height: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: "var(--text-secondary)"
                    }}
                    title="Copy to Clipboard"
                  >
                    {copied ? <CheckIcon size={16} style={{ color: "#10b981" }} /> : <CopyIcon size={16} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default ExportKeystore;
