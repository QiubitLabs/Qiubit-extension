import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import "./DashboardHeader.css";
import { WalletHeader, WalletSelector } from "../../../shared/WalletSelector";
import { ReceiveIcon, RefreshIcon, SettingsIcon, PlusIcon } from "../../../shared/Icons";
import { Wallet, Token } from "../../../../types";
import { loadSnapshot } from "../../../../utils/walletSnapshot";

interface DashboardHeaderProps {
  wallet: Wallet;
  wallets: any[];
  balance: number;
  activeWalletIndex?: number;
  isRefreshing: boolean;
  activeWalletTokens?: Token[];
  onSwitchWallet: (index: number) => void;
  onAddWallet: () => void;
  onRenameWallet: (index: number, currentName: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onShowAddresses: () => void;
  onOpenAccount: () => void;
  networkSetting?: string;
}

export function DashboardHeader({
  wallet,
  wallets,
  balance,
  activeWalletIndex,
  isRefreshing,
  activeWalletTokens,
  onSwitchWallet,
  onAddWallet,
  onRenameWallet,
  onRefresh,
  onOpenSettings,
  onShowAddresses,
  onOpenAccount,
  networkSetting,
}: DashboardHeaderProps) {
  const [showWalletSwitcher, setShowWalletSwitcher] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target && (target.closest(".wallet-switcher-drawer") || target.closest(".drawer-overlay"))) {
        return;
      }
      if (
        switcherRef.current &&
        !switcherRef.current.contains(event.target as Node)
      ) {
        setShowWalletSwitcher(false);
      }
    };

    if (showWalletSwitcher) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showWalletSwitcher]);

  const handleSelectWallet = (index: number) => {
    onSwitchWallet(index);
    setShowWalletSwitcher(false);
  };

  return (
    <header className="wallet-header">
      <div ref={switcherRef} style={{ position: "relative" }}>
        <WalletHeader
          wallet={wallet}
          wallets={wallets}
          onOpenSelector={() => setShowWalletSwitcher(!showWalletSwitcher)}
          onOpenAccount={onOpenAccount}
        />

        {/* Slide-up Bottom Drawer */}
        {showWalletSwitcher && createPortal(
          <>
            <div
              className="drawer-overlay"
              onClick={() => setShowWalletSwitcher(false)}
            />
            <div
              className="wallet-switcher-drawer"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="drawer-handle" />
              <div className="drawer-header">
                <span className="drawer-title">Switch Account</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    onClick={() => {
                      setShowWalletSwitcher(false);
                      onAddWallet();
                    }}
                    type="button"
                    title="Add Wallet"
                     style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "18px",
                      padding: "7px 13px",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "12.5px",
                      fontWeight: "600",
                      transition: "all 0.2s ease",
                      marginRight: "6px"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--text-primary)";
                      e.currentTarget.style.borderColor = "var(--border-default)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text-secondary)";
                      e.currentTarget.style.borderColor = "var(--border-subtle)";
                    }}
                  >
                    <PlusIcon size={13} />
                    <span>Add Wallet</span>
                  </button>
                  <button
                    className="drawer-close"
                    onClick={() => setShowWalletSwitcher(false)}
                    type="button"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="drawer-body no-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
                <WalletSelector
                  wallets={wallets.map((w, i) => ({
                    ...w,
                    balance:
                      i === activeWalletIndex
                        ? balance
                        : (loadSnapshot(w.address)?.balance ??
                          w.lastKnownBalance ??
                          0),
                  }))}
                  activeAddress={wallet?.address}
                  activeWalletTokens={activeWalletTokens}
                  onSelect={handleSelectWallet}
                  onAddWallet={() => {
                    setShowWalletSwitcher(false);
                    onAddWallet();
                  }}
                  onEditWallet={(idx) => {
                    setShowWalletSwitcher(false);
                    onRenameWallet(idx, wallets[idx]?.name || "");
                  }}
                  onClose={() => setShowWalletSwitcher(false)}
                  networkSetting={networkSetting}
                />
              </div>
            </div>
          </>,
          document.body
        )}
      </div>

      <div className="header-actions">
        <button
          className="header-icon-btn"
          onClick={onShowAddresses}
          title="Show Addresses"
        >
          <ReceiveIcon size={18} />
        </button>
        <button
          className="header-icon-btn"
          onClick={onRefresh}
          title="Refresh Balance"
          disabled={isRefreshing}
        >
          <RefreshIcon
            size={18}
            className={isRefreshing ? "spin-animation" : ""}
          />
        </button>
        <button
          className="header-icon-btn"
          onClick={onOpenSettings}
          title="Settings"
        >
          <SettingsIcon size={18} />
        </button>
      </div>
    </header>
  );
}
