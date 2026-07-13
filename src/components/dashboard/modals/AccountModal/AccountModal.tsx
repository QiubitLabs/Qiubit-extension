import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet } from "../../../../types";
import {
  EditIcon,
  KeyIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
} from "../../../shared/Icons";
import { verifyPasswordSecure } from "../../../../utils/storage";
import "./AccountModal.css";

interface AccountModalProps {
  wallet: Wallet;
  activeWalletIndex: number;
  onClose: () => void;
  onRename: (index: number, currentName: string) => void;
}

type Screen = "menu" | "export-pw" | "export-key";

function hasEvmKey(wallet: Wallet): boolean {
  return !!(wallet.privateKeyHex && wallet.evmAddress);
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

export function AccountModal({
  wallet,
  activeWalletIndex,
  onClose,
  onRename,
}: AccountModalProps) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pwError, setPwError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  useEffect(() => {
    return () => {
      setPassword("");
    };
  }, []);

  const handleVerifyPassword = async () => {
    if (!password.trim()) {
      setPwError("Enter your password");
      return;
    }
    setIsVerifying(true);
    setPwError("");
    try {
      const ok = await verifyPasswordSecure(password);
      if (ok) {
        setScreen("export-key");
      } else {
        setPwError("Incorrect password");
      }
    } catch {
      setPwError("Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const displayAddress = wallet.address
    ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`
    : "";

  return (
    <div
      className="account-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
    >
      <div className="account-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="account-handle" />

        {/* Wallet identity header -- always visible */}
        <div className="account-header">
          <div className="account-avatar">
            <img
              src="/iconsub.svg"
              alt="Wallet"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div className="account-meta">
            <div className="account-name">
              {wallet.name || `Wallet ${activeWalletIndex + 1}`}
            </div>
            <div className="account-address">{displayAddress}</div>
          </div>
        </div>

        {/* -- SCREEN: Menu -- */}
        {screen === "menu" && (
          <div className="account-menu">
            <button
              className="account-menu-item"
              onClick={() => {
                onClose();
                onRename(activeWalletIndex, wallet.name || "");
              }}
            >
              <div className="account-menu-icon">
                <EditIcon size={16} />
              </div>
              <div>
                <div className="account-menu-label">Edit Name</div>
                <div className="account-menu-desc">
                  Change wallet display name
                </div>
              </div>
            </button>

            <button
              className="account-menu-item danger"
              onClick={() => setScreen("export-pw")}
            >
              <div className="account-menu-icon">
                <KeyIcon size={16} />
              </div>
              <div>
                <div className="account-menu-label">Export Private Key</div>
                <div className="account-menu-desc">
                  Requires password verification
                </div>
              </div>
            </button>
          </div>
        )}

        {/* -- SCREEN: Password -- */}
        {screen === "export-pw" && (
          <div className="account-export-body">
            <button
              className="account-export-back"
              onClick={() => {
                setScreen("menu");
                setPwError("");
                setPassword("");
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>

            <div className="account-warning">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ flexShrink: 0, marginTop: 1 }}
              >
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
              Never share your private key. Anyone with this key has full
              control of your wallet.
            </div>

            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                type={showPassword ? "text" : "password"}
                className={`input input-lg${pwError ? " input-error" : ""}`}
                style={{ width: "100%", paddingRight: 44 }}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPwError("");
                }}
                placeholder="Enter password"
                onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword()}
                autoFocus
              />
              <button
                type="button"
                className="input-icon-btn"
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-tertiary)",
                }}
                onClick={() => setShowPassword((p) => !p)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOffIcon size={16} />
                ) : (
                  <EyeIcon size={16} />
                )}
              </button>
            </div>
            {pwError && (
              <p
                style={{
                  color: "var(--color-error, #ef4444)",
                  fontSize: 12,
                  marginBottom: 10,
                }}
              >
                {pwError}
              </p>
            )}

            <button
              className="btn btn-primary btn-full"
              onClick={handleVerifyPassword}
              disabled={isVerifying || !password.trim()}
            >
              {isVerifying ? (
                <span className="loading-spinner" />
              ) : (
                "Show Private Key"
              )}
            </button>
          </div>
        )}

        {/* -- SCREEN: Key revealed -- */}
        {screen === "export-key" && (
          <div
            className="account-export-body"
            style={{
              maxHeight: "420px",
              overflowY: "auto",
              paddingBottom: "16px",
            }}
          >
            <button
              className="account-export-back"
              onClick={() => {
                setScreen("export-pw");
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              {/* Octra Network */}
              <PrivateKeySection
                label="Octra Network"
                privateKey={wallet.privateKeyB64}
                logoUrl="/octra-icon.svg"
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

              {/* Solana */}
              {wallet.solanaPrivateKeyHex && (
                <PrivateKeySection
                  label="Solana Network"
                  privateKey={wallet.solanaPrivateKeyHex.replace(/^0x/i, "")}
                  logoUrl="/chains/solana/sol.png"
                  formatLabel="Solana - Hex (Ed25519)"
                />
              )}

              {/* Sui */}
              {wallet.suiPrivateKeyHex && (
                <PrivateKeySection
                  label="Sui Network"
                  privateKey={wallet.suiPrivateKeyHex.replace(/^0x/i, "")}
                  logoUrl="/chains/sui/sui.png"
                  formatLabel="Sui - Hex (Ed25519)"
                />
              )}

              {/* Bitcoin */}
              {wallet.bitcoinPrivateKeyHex && (
                <PrivateKeySection
                  label="Bitcoin Network"
                  privateKey={wallet.bitcoinPrivateKeyHex.replace(/^0x/i, "")}
                  logoUrl="/chains/bitcoin/btc.png"
                  formatLabel="Bitcoin - Hex (secp256k1)"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
