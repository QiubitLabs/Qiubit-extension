import React, { useState } from "react";
import {
  PlusIcon,
  CheckIcon,
  CopyIcon,
  WalletIcon,
  EditIcon,
  QiubitLogo,
} from "../Icons";
import { Wallet, Token } from "../../../types";
import { loadSnapshot } from "../../../utils/walletSnapshot";
import {
  getCachedPrices,
  formatUsd,
} from "../../../services/network/PriceService";
import { filterTokensByNetwork } from "../../../constants/networks/registry";
import { resolveNetwork } from "../../../services/network/NetworkResolver";
import "./WalletSelector.css";
import "./NetworkSwitcher.css";

function computeWalletUsd(
  address: string,
  activeAddress?: string,
  activeTokens?: Token[],
  networkSetting: string = "all",
): number {
  const priceMap = getCachedPrices();

  if (
    activeAddress &&
    address.toLowerCase() === activeAddress.toLowerCase() &&
    activeTokens &&
    activeTokens.length > 0
  ) {
    const filtered = filterTokensByNetwork(activeTokens, networkSetting, true);
    return filtered.reduce((sum, t) => {
      const bal =
        typeof t.balance === "string" ? parseFloat(t.balance) : t.balance || 0;
      const price = t.isTestnet
        ? 0
        : (priceMap.get(t.symbol)?.price ??
          priceMap.get(t.symbol.toUpperCase())?.price ??
          0);
      return sum + (isNaN(bal) ? 0 : bal * price);
    }, 0);
  }

  const snap = loadSnapshot(address);
  if (!snap?.tokens?.length) return 0;
  const filtered = filterTokensByNetwork(snap.tokens, networkSetting, true);
  return filtered.reduce((sum, t) => {
    const bal =
      typeof t.balance === "string" ? parseFloat(t.balance) : t.balance || 0;
    const price = t.isTestnet
      ? 0
      : (priceMap.get(t.symbol)?.price ??
        priceMap.get(t.symbol.toUpperCase())?.price ??
        0);
    return sum + (isNaN(bal) ? 0 : bal * price);
  }, 0);
}

interface WalletSelectorProps {
  wallets: any[];
  activeAddress: string;
  activeWalletTokens?: Token[];
  onSelect: (index: number) => void;
  onAddWallet: () => void;
  onEditWallet?: (index: number) => void;
  onClose?: () => void;
  networkSetting?: string;
}

export function WalletSelector({
  wallets,
  activeAddress,
  activeWalletTokens,
  onSelect,
  onAddWallet,
  onEditWallet,
  networkSetting = "all",
}: WalletSelectorProps) {
  const [copied, setCopied] = useState<number | null>(null);

  // Copy the wallet's address for the ACTIVE network (matches the header copy):
  // Solana network → Solana address, Sui → Sui, EVM/custom-EVM → 0x…, Octra →
  // oct…. On "all" (no specific chain) copy the EVM address, the most commonly
  // shared one, falling back to Octra if this wallet has none.
  const copyAddressForWallet = (w: any): string => {
    if (networkSetting === "all") return w.evmAddress || w.address;
    const cfg = resolveNetwork(networkSetting);
    switch (cfg?.addressType) {
      case "evm":
        return w.evmAddress || w.address;
      case "solana":
        return w.solanaAddress || w.address;
      case "sui":
        return w.suiAddress || w.address;
      case "bitcoin":
        return w.bitcoinAddress || w.address;
      default:
        return w.address;
    }
  };

  const handleCopy = async (
    wallet: any,
    index: number,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(copyAddressForWallet(wallet));
      setCopied(index);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="wallet-selector-content">
      {/* Wallet List */}
      <div className="wallet-list-container">
        {wallets.map((wallet, index) => {
          const isActive = wallet.address === activeAddress;
          return (
            <div
              key={wallet.id || index}
              className={`wallet-card ${isActive ? "active" : ""}`}
              onClick={() => onSelect(index)}
            >
              <div className="wallet-avatar-container">
                <div className="wallet-avatar">
                  <span className="wallet-avatar-number">
                    <WalletIcon size={16} />
                  </span>
                  <div
                    className="wallet-avatar-edit-overlay"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.nativeEvent.stopImmediatePropagation();
                      if (onEditWallet) onEditWallet(index);
                    }}
                    title="Rename Wallet"
                  >
                    <EditIcon size={14} />
                  </div>
                </div>
              </div>

              <div className="wallet-info">
                <div className="wallet-name-row">
                  <span className="wallet-name">
                    {wallet.name || `Wallet ${index + 1}`}
                  </span>
                  {isActive && (
                    <div className="wallet-check-indicator">
                      <CheckIcon size={14} />
                    </div>
                  )}
                </div>
                <div className="wallet-balance">
                  {(() => {
                    const usd = computeWalletUsd(
                      wallet.address,
                      activeAddress,
                      activeWalletTokens,
                      networkSetting,
                    );
                    return usd > 0 ? formatUsd(usd) : "$0.00";
                  })()}
                </div>
              </div>

              <div className="wallet-actions">
                <button
                  className="wallet-action-btn"
                  onClick={(e) => handleCopy(wallet, index, e)}
                >
                  {copied === index ? (
                    <CheckIcon size={14} />
                  ) : (
                    <CopyIcon size={14} />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simple Add Wallet Button */}
      <button className="wallet-add-btn-minimal" onClick={onAddWallet}>
        <div className="add-icon-circle">
          <PlusIcon size={14} />
        </div>
        <span>Add Wallet</span>
      </button>
    </div>
  );
}

interface WalletHeaderProps {
  wallet: Wallet;
  wallets?: Wallet[];
  onOpenSelector: () => void;
  onOpenAccount: () => void;
}

export function WalletHeader({
  wallet,
  onOpenSelector,
  onOpenAccount,
}: WalletHeaderProps) {
  const displayName = wallet.name || "Wallet";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Logo → opens Account modal */}
      <button
        className="wallet-header-btn"
        style={{ padding: "6px 8px", gap: 0 }}
        onClick={onOpenAccount}
        title="Account"
      >
        <div className="header-wallet-icon">
          <QiubitLogo size={20} />
        </div>
      </button>

      {/* Address pill → opens wallet switcher dropdown */}
      <button
        className="wallet-header-btn"
        style={{ padding: "5px 10px", gap: 6 }}
        onClick={onOpenSelector}
        title="Switch wallet"
      >
        <span className="header-wallet-name">{displayName}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          style={{ opacity: 0.5, flexShrink: 0 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

export default WalletSelector;
