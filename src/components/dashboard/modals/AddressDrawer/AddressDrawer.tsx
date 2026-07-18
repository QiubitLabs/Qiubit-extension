import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import "./AddressDrawer.css";
import {
  CloseIcon,
  CheckIcon,
  CopyIcon,
  QrCodeIcon,
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

function truncateAddr(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

interface NetworkCardProps {
  label: string;
  address: string;
  logoUrl: string;
  hasCopied: boolean;
  onCopy: () => void;
  onShowQR: () => void;
}

function NetworkCard({
  label,
  address,
  logoUrl,
  hasCopied,
  onCopy,
  onShowQR,
}: NetworkCardProps) {
  return (
    <div className="addr-network-card">
      <div className="addr-network-left">
        <img
          src={logoUrl}
          alt={label}
          className="addr-network-logo"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="addr-network-text">
          <span className="addr-network-name">{label}</span>
          <span className="addr-network-addr font-mono">
            {truncateAddr(address)}
          </span>
        </div>
      </div>
      <div className="addr-network-actions">
        <button
          className="addr-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          title="Copy Address"
        >
          {hasCopied ? (
            <CheckIcon size={15} className="text-success" />
          ) : (
            <CopyIcon size={15} />
          )}
        </button>
        <button
          className="addr-action-btn"
          onClick={(e) => {
            e.stopPropagation();
            onShowQR();
          }}
          title="Show QR Code"
        >
          <QrCodeIcon size={15} />
        </button>
      </div>
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

  // Network list definition
  const networks: {
    label: string;
    address: string;
    logoUrl: string;
    type: "octra" | "evm" | "solana" | "sui" | "bitcoin" | "bsc" | "monad" | "hyperliquid";
    hasCopied: boolean;
  }[] = [];

  if (evmAddress) {
    networks.push({ label: "Ethereum / EVM", address: evmAddress, logoUrl: "/eth-icon.svg", type: "evm", hasCopied: hasCopiedEvm });
  }
  networks.push({ label: "Octra Network", address: octraAddress, logoUrl: "/octra-icon.svg", type: "octra", hasCopied: hasCopiedOctra });
  if (solanaAddress) {
    networks.push({ label: "Solana Network", address: solanaAddress, logoUrl: "/chains/solana/sol.png", type: "solana", hasCopied: hasCopiedSolana });
  }
  if (bitcoinAddress) {
    networks.push({ label: "Bitcoin Network", address: bitcoinAddress, logoUrl: "/chains/bitcoin/btc.png", type: "bitcoin", hasCopied: hasCopiedBitcoin });
  }
  if (suiAddress) {
    networks.push({ label: "Sui Network", address: suiAddress, logoUrl: "/chains/sui/sui.png", type: "sui", hasCopied: hasCopiedSui });
  }
  if (evmAddress) {
    networks.push({ label: "Binance Smart Chain", address: evmAddress, logoUrl: "/chains/bsc/logo.png", type: "bsc", hasCopied: hasCopiedBsc });
    networks.push({ label: "Monad Network", address: evmAddress, logoUrl: "/chains/monad/logo.jpg", type: "monad", hasCopied: hasCopiedMonad });
    networks.push({ label: "Hyperliquid EVM", address: evmAddress, logoUrl: "/chains/hyperliquid/logo.jpg", type: "hyperliquid", hasCopied: hasCopiedHyperliquid });
  }

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
              className="drawer-body no-scrollbar"
              style={{ minHeight: "200px", paddingBottom: "16px" }}
            >
              <div className="addr-network-list">
                {networks.map((net) => (
                  <NetworkCard
                    key={net.type}
                    label={net.label}
                    address={net.address}
                    logoUrl={net.logoUrl}
                    hasCopied={net.hasCopied}
                    onCopy={() => handleCopy(net.address, net.type)}
                    onShowQR={() => handleShowQR(net.address, net.label)}
                  />
                ))}
              </div>
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
