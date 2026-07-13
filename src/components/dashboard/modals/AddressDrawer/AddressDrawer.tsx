import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./AddressDrawer.css";
import {
  CloseIcon,
  CheckIcon,
  CopyIcon,
  QrCodeIcon,
  ChevronDownIcon,
} from "../../../shared/Icons";
import { useClipboard } from "../../../../hooks/useClipboard";

interface AddressDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  octraAddress: string;
  evmAddress?: string;
  solanaAddress?: string;
  suiAddress?: string;
  bitcoinAddress?: string;
  showToast: (
    message: string,
    type?: "info" | "success" | "warning" | "error",
  ) => void;
}

interface AddressSectionProps {
  label: string;
  address: string;
  logoUrl: string;
  hasCopied: boolean;
  onCopy: (addr: string) => void;
  onShowQR: (addr: string, label: string) => void;
}

function AddressSection({
  label,
  address,
  logoUrl,
  hasCopied,
  onCopy,
  onShowQR,
}: AddressSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

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
          border: "1px solid var(--border-color)",
          borderRadius: isOpen ? "12px 12px 0 0" : "12px",
          padding: "14px 16px",
          cursor: "pointer",
          transition: "all 0.2s ease-in-out",
          borderBottom: isOpen ? "none" : "1px solid var(--border-color)",
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

      {/* Dropdown address block */}
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
                padding: "12px 16px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderTop: "none",
                borderRadius: "0 0 12px 12px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span
                className="address-display-text font-mono"
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  wordBreak: "break-all",
                  lineHeight: "1.4",
                  flex: 1,
                  userSelect: "all",
                }}
              >
                {address}
              </span>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="action-btn-mini"
                  onClick={() => onCopy(address)}
                  title="Copy Address"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    padding: "6px",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                  }}
                >
                  {hasCopied ? (
                    <CheckIcon size={14} className="text-success" />
                  ) : (
                    <CopyIcon size={14} />
                  )}
                </button>
                <button
                  className="action-btn-mini"
                  onClick={() => onShowQR(address, label)}
                  title="Show QR Code"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-tertiary)",
                    padding: "6px",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                  }}
                >
                  <QrCodeIcon size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AddressDrawer({
  isOpen,
  onClose,
  octraAddress,
  evmAddress,
  solanaAddress,
  suiAddress,
  bitcoinAddress,
  showToast,
}: AddressDrawerProps) {
  const [activeQR, setActiveQR] = useState<{
    address: string;
    label: string;
  } | null>(null);

  const { copy: copyOctra, hasCopied: hasCopiedOctra } = useClipboard(2000, {
    onSuccess: () => showToast("Octra address copied", "success"),
  });
  const { copy: copyEvm, hasCopied: hasCopiedEvm } = useClipboard(2000, {
    onSuccess: () => showToast("EVM address copied", "success"),
  });
  const { copy: copyBsc, hasCopied: hasCopiedBsc } = useClipboard(2000, {
    onSuccess: () => showToast("BNB Chain address copied", "success"),
  });
  const { copy: copyMonad, hasCopied: hasCopiedMonad } = useClipboard(2000, {
    onSuccess: () => showToast("Monad address copied", "success"),
  });
  const { copy: copyHyperliquid, hasCopied: hasCopiedHyperliquid } =
    useClipboard(2000, {
      onSuccess: () => showToast("Hyperliquid address copied", "success"),
    });
  const { copy: copySolana, hasCopied: hasCopiedSolana } = useClipboard(2000, {
    onSuccess: () => showToast("Solana address copied", "success"),
  });
  const { copy: copySui, hasCopied: hasCopiedSui } = useClipboard(2000, {
    onSuccess: () => showToast("Sui address copied", "success"),
  });
  const { copy: copyBitcoin, hasCopied: hasCopiedBitcoin } = useClipboard(
    2000,
    {
      onSuccess: () => showToast("Bitcoin address copied", "success"),
    },
  );

  const handleCopy = (
    addr: string,
    type:
      | "octra"
      | "evm"
      | "solana"
      | "sui"
      | "bitcoin"
      | "bsc"
      | "monad"
      | "hyperliquid",
  ) => {
    if (type === "octra") copyOctra(addr);
    else if (type === "evm") copyEvm(addr);
    else if (type === "bsc") copyBsc(addr);
    else if (type === "monad") copyMonad(addr);
    else if (type === "hyperliquid") copyHyperliquid(addr);
    else if (type === "solana") copySolana(addr);
    else if (type === "sui") copySui(addr);
    else if (type === "bitcoin") copyBitcoin(addr);
  };

  const handleShowQR = (addr: string, label: string) => {
    setActiveQR({ address: addr, label });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="address-drawer"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            style={{ position: "relative", overflow: "hidden" }}
          >
            <div className="drawer-handle" />

            <div className="drawer-header">
              <h3 className="drawer-title">Wallet Addresses</h3>
              <button className="drawer-close" onClick={onClose}>
                <CloseIcon size={20} />
              </button>
            </div>

            <div
              className="drawer-body"
              style={{ minHeight: "260px", paddingBottom: "16px" }}
            >
              {/* 1. Ethereum / EVM Address */}
              {evmAddress && (
                <AddressSection
                  label="Ethereum / EVM"
                  address={evmAddress}
                  logoUrl="/eth-icon.svg"
                  hasCopied={hasCopiedEvm}
                  onCopy={(addr) => handleCopy(addr, "evm")}
                  onShowQR={handleShowQR}
                />
              )}

              {/* 2. Octra Address */}
              <AddressSection
                label="Octra Network"
                address={octraAddress}
                logoUrl="/octra-icon.svg"
                hasCopied={hasCopiedOctra}
                onCopy={(addr) => handleCopy(addr, "octra")}
                onShowQR={handleShowQR}
              />

              {/* 3. Solana Address */}
              {solanaAddress && (
                <AddressSection
                  label="Solana Network"
                  address={solanaAddress}
                  logoUrl="/chains/solana/sol.png"
                  hasCopied={hasCopiedSolana}
                  onCopy={(addr) => handleCopy(addr, "solana")}
                  onShowQR={handleShowQR}
                />
              )}

              {/* 4. Bitcoin Address */}
              {bitcoinAddress && (
                <AddressSection
                  label="Bitcoin Network"
                  address={bitcoinAddress}
                  logoUrl="/chains/bitcoin/btc.png"
                  hasCopied={hasCopiedBitcoin}
                  onCopy={(addr) => handleCopy(addr, "bitcoin")}
                  onShowQR={handleShowQR}
                />
              )}

              {/* 5. Sui Address */}
              {suiAddress && (
                <AddressSection
                  label="Sui Network"
                  address={suiAddress}
                  logoUrl="/chains/sui/sui.png"
                  hasCopied={hasCopiedSui}
                  onCopy={(addr) => handleCopy(addr, "sui")}
                  onShowQR={handleShowQR}
                />
              )}

              {/* 6. Binance Smart Chain Address */}
              {evmAddress && (
                <AddressSection
                  label="Binance Smart Chain"
                  address={evmAddress}
                  logoUrl="/chains/bsc/logo.png"
                  hasCopied={hasCopiedBsc}
                  onCopy={(addr) => handleCopy(addr, "bsc")}
                  onShowQR={handleShowQR}
                />
              )}

              {/* 7. Monad Address */}
              {evmAddress && (
                <AddressSection
                  label="Monad Network"
                  address={evmAddress}
                  logoUrl="/chains/monad/logo.jpg"
                  hasCopied={hasCopiedMonad}
                  onCopy={(addr) => handleCopy(addr, "monad")}
                  onShowQR={handleShowQR}
                />
              )}

              {/* 8. Hyperliquid Address */}
              {evmAddress && (
                <AddressSection
                  label="Hyperliquid EVM"
                  address={evmAddress}
                  logoUrl="/chains/hyperliquid/logo.jpg"
                  hasCopied={hasCopiedHyperliquid}
                  onCopy={(addr) => handleCopy(addr, "hyperliquid")}
                  onShowQR={handleShowQR}
                />
              )}
            </div>

            <div className="drawer-footer">
              <button
                className="btn btn-primary w-full py-md rounded-xl"
                onClick={onClose}
              >
                Close
              </button>
            </div>

            {/* In-drawer absolute QR Code Overlay */}
            <AnimatePresence>
              {activeQR && (
                <motion.div
                  className="qr-drawer-overlay"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 220 }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "var(--bg-primary)",
                    zIndex: 1010,
                    display: "flex",
                    flexDirection: "column",
                    padding: "24px 20px",
                    borderTopLeftRadius: "24px",
                    borderTopRightRadius: "24px",
                  }}
                >
                  <div
                    className="qr-overlay-header"
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "20px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      QR Code - {activeQR.label}
                    </span>
                    <button
                      className="drawer-close"
                      onClick={() => setActiveQR(null)}
                      style={{ margin: 0 }}
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>
                  <div
                    className="qr-overlay-body"
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        background: "#ffffff",
                        padding: "12px",
                        borderRadius: "16px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "20px",
                        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
                      }}
                    >
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(activeQR.address)}`}
                        alt="QR Code"
                        style={{
                          width: "150px",
                          height: "150px",
                          display: "block",
                        }}
                      />
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-secondary)",
                        wordBreak: "break-all",
                        padding: "10px 14px",
                        background: "var(--bg-secondary)",
                        borderRadius: "10px",
                        width: "100%",
                        maxWidth: "320px",
                        marginBottom: "24px",
                        border: "1px solid var(--border-color)",
                        textAlign: "center",
                        lineHeight: "1.4",
                        userSelect: "all",
                      }}
                    >
                      {activeQR.address}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        width: "100%",
                        maxWidth: "320px",
                        marginTop: "auto",
                      }}
                    >
                      <button
                        className="btn btn-secondary"
                        style={{
                          flex: 1,
                          padding: "12px 0",
                          borderRadius: "12px",
                          fontSize: "0.875rem",
                        }}
                        onClick={() => {
                          if (activeQR.label.includes("Octra"))
                            handleCopy(activeQR.address, "octra");
                          else if (
                            activeQR.label.includes("Ethereum") ||
                            activeQR.label.includes("EVM")
                          )
                            handleCopy(activeQR.address, "evm");
                          else if (
                            activeQR.label.includes("Binance") ||
                            activeQR.label.includes("BNB") ||
                            activeQR.label.includes("Smart Chain")
                          )
                            handleCopy(activeQR.address, "bsc");
                          else if (activeQR.label.includes("Monad"))
                            handleCopy(activeQR.address, "monad");
                          else if (activeQR.label.includes("Hyperliquid"))
                            handleCopy(activeQR.address, "hyperliquid");
                          else if (activeQR.label.includes("Solana"))
                            handleCopy(activeQR.address, "solana");
                          else if (activeQR.label.includes("Sui"))
                            handleCopy(activeQR.address, "sui");
                          else if (activeQR.label.includes("Bitcoin"))
                            handleCopy(activeQR.address, "bitcoin");
                        }}
                      >
                        Copy Address
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{
                          flex: 1,
                          padding: "12px 0",
                          borderRadius: "12px",
                          fontSize: "0.875rem",
                          background: "var(--accent-color)",
                        }}
                        onClick={() => setActiveQR(null)}
                      >
                        Back
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
