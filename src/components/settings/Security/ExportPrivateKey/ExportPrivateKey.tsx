import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
  CopyIcon,
  LockIcon,
  ChevronDownIcon,
} from "../../../shared/Icons";
import { verifyPasswordSecure as verifyPassword } from "../../../../utils/storage";
import {
  solanaSecretKeyBase58,
  bitcoinWIF,
} from "../../../../utils/crypto/exportFormats";
import { Wallet } from "../../../../types";
import "../Security.css";

interface ExportPrivateKeyProps {
  wallet: Wallet;
  onBack: () => void;
}

function hasEvmKey(wallet: Wallet): boolean {
  return !!(wallet.privateKeyHex && wallet.evmAddress);
}

/** Import-ready format, or empty string if conversion fails. */
function safeFormat(fn: () => string): string {
  try {
    return fn();
  } catch {
    return "";
  }
}

interface PrivateKeySectionProps {
  label: string;
  privateKey: string;
  logoUrl: string;
  formatLabel: string;
}

function PrivateKeySection({
  label,
  privateKey,
  logoUrl,
  formatLabel,
}: PrivateKeySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRevealed(false);
    }
  }, [isOpen]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const censoredKey = "•".repeat(Math.min(privateKey.length, 36));

  return (
    <div
      className="address-section-collapsible"
      style={{ marginBottom: "12px" }}
    >
      {/* Header / Network Bar */}
      <div
        className={`network-header-bar ${isOpen ? "active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: isOpen ? "12px 12px 0 0" : "12px",
          padding: "14px 16px",
          cursor: "pointer",
          transition: "all 0.2s ease-in-out",
          borderBottom: isOpen ? "none" : "1px solid var(--border-default)",
        }}
      >
        <div
          className="network-info"
          style={{ display: "flex", alignItems: "center", gap: "10px" }}
        >
          <img
            src={logoUrl}
            alt={label}
            style={{ width: "20px", height: "20px", borderRadius: "50%" }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span
            className="network-name-text"
            style={{
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            {label}
          </span>
        </div>
        <ChevronDownIcon
          size={16}
          style={{
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            color: "var(--text-tertiary)",
          }}
        />
      </div>

      {/* Dropdown private key block */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="address-dropdown-inner"
              style={{
                padding: "14px 16px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-default)",
                borderTop: "none",
                borderRadius: "0 0 12px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                alignItems: "stretch",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {formatLabel}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    cursor: "pointer",
                    background: "var(--bg-card)",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    minHeight: "44px",
                    wordBreak: "break-all",
                    userSelect: revealed ? "all" : "none",
                  }}
                  onClick={() => setRevealed((prev) => !prev)}
                  title={
                    revealed
                      ? "Click to hide private key"
                      : "Click to reveal private key"
                  }
                >
                  <span
                    className="font-mono"
                    style={{
                      fontSize: "0.8125rem",
                      color: revealed
                        ? "var(--text-primary)"
                        : "var(--text-tertiary)",
                      lineHeight: "1.4",
                      flex: 1,
                      letterSpacing: revealed ? "normal" : "2px",
                    }}
                  >
                    {revealed ? privateKey : censoredKey}
                  </span>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="action-btn-mini"
                    onClick={handleCopy}
                    title="Copy Private Key"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-tertiary)",
                      padding: "8px",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.2s",
                    }}
                  >
                    {copied ? (
                      <CheckIcon
                        size={14}
                        style={{ color: "var(--color-success, #10b981)" }}
                      />
                    ) : (
                      <CopyIcon size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ExportPrivateKey({ wallet, onBack }: ExportPrivateKeyProps) {
  const [showInputPassword, setShowInputPassword] = useState(false);
  const [inputPassword, setInputPassword] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

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

  return (
    <div className="animate-fade-in">
      <header className="wallet-header">
        <div className="flex items-center gap-md">
          <button className="header-icon-btn" onClick={onBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-lg font-semibold">Export Private Key</span>
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
                Enter your wallet password to view your private key
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
              className="btn btn-primary btn-lg btn-full"
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
              gap: "4px",
              paddingBottom: "16px",
            }}
          >
            {/* Security Warning - Professional */}
            <div className="security-notice" style={{ marginBottom: "16px" }}>
              <p>
                Never share your private key. Anyone with this key has full
                control of your wallet.
              </p>
            </div>

            {/* Octra Network */}
            <PrivateKeySection
              label="Octra Network"
              privateKey={wallet.privateKeyB64}
              logoUrl="/qiubit-icon.svg"
              formatLabel="Octra - Base64"
            />

            {/* EVM compatible chains */}
            {hasEvmKey(wallet) && (
              <>
                <PrivateKeySection
                  label="Ethereum / EVM"
                  privateKey={
                    wallet.privateKeyHex.startsWith("0x")
                      ? wallet.privateKeyHex
                      : "0x" + wallet.privateKeyHex
                  }
                  logoUrl="/eth-icon.svg"
                  formatLabel="Ethereum - Hex"
                />
                <PrivateKeySection
                  label="Binance Smart Chain"
                  privateKey={
                    wallet.privateKeyHex.startsWith("0x")
                      ? wallet.privateKeyHex
                      : "0x" + wallet.privateKeyHex
                  }
                  logoUrl="/chains/bsc/logo.png"
                  formatLabel="BSC - Hex"
                />
                <PrivateKeySection
                  label="Monad Network"
                  privateKey={
                    wallet.privateKeyHex.startsWith("0x")
                      ? wallet.privateKeyHex
                      : "0x" + wallet.privateKeyHex
                  }
                  logoUrl="/chains/monad/logo.jpg"
                  formatLabel="Monad - Hex"
                />
                <PrivateKeySection
                  label="Hyperliquid EVM"
                  privateKey={
                    wallet.privateKeyHex.startsWith("0x")
                      ? wallet.privateKeyHex
                      : "0x" + wallet.privateKeyHex
                  }
                  logoUrl="/chains/hyperliquid/logo.jpg"
                  formatLabel="Hyperliquid - Hex"
                />
              </>
            )}

            {/* Solana — base58 secret key is what Phantom/Solflare import */}
            {wallet.solanaPrivateKeyHex &&
              (() => {
                const b58 = safeFormat(() =>
                  solanaSecretKeyBase58(wallet.solanaPrivateKeyHex!),
                );
                return (
                  <>
                    {b58 && (
                      <PrivateKeySection
                        label="Solana Network"
                        privateKey={b58}
                        logoUrl="/chains/solana/sol.png"
                        formatLabel="Solana - Base58 (Phantom)"
                      />
                    )}
                    <PrivateKeySection
                      label="Solana Network"
                      privateKey={wallet.solanaPrivateKeyHex.replace(/^0x/i, "")}
                      logoUrl="/chains/solana/sol.png"
                      formatLabel="Solana - Hex seed (Ed25519)"
                    />
                  </>
                );
              })()}

            {/* Sui */}
            {wallet.suiPrivateKeyHex && (
              <PrivateKeySection
                label="Sui Network"
                privateKey={wallet.suiPrivateKeyHex.replace(/^0x/i, "")}
                logoUrl="/chains/sui/sui.png"
                formatLabel="Sui - Hex (Ed25519)"
              />
            )}

            {/* Bitcoin — WIF is the standard import format for BTC wallets */}
            {wallet.bitcoinPrivateKeyHex &&
              (() => {
                const wif = safeFormat(() =>
                  bitcoinWIF(wallet.bitcoinPrivateKeyHex!),
                );
                return (
                  <>
                    {wif && (
                      <PrivateKeySection
                        label="Bitcoin Network"
                        privateKey={wif}
                        logoUrl="/chains/bitcoin/btc.png"
                        formatLabel="Bitcoin - WIF (compressed)"
                      />
                    )}
                    <PrivateKeySection
                      label="Bitcoin Network"
                      privateKey={wallet.bitcoinPrivateKeyHex.replace(
                        /^0x/i,
                        "",
                      )}
                      logoUrl="/chains/bitcoin/btc.png"
                      formatLabel="Bitcoin - Hex (secp256k1)"
                    />
                  </>
                );
              })()}
          </div>
        )}
      </div>
    </div>
  );
}
