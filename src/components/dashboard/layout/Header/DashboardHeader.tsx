import { useState, useRef, useEffect } from "react";
import "./DashboardHeader.css";
import { WalletHeader, WalletSelector } from "../../../shared/WalletSelector";
import { ReceiveIcon, RefreshIcon, SettingsIcon } from "../../../shared/Icons";
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

        {/* Compact Dropdown Menu */}
        {showWalletSwitcher && (
          <div
            className="wallet-dropdown-menu"
            onClick={(e) => e.stopPropagation()}
          >
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
