/**
 * Dashboard Component - Main wallet view
 * Displays balance, actions, and token list
 */

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import "./Dashboard.css";
import { useClipboard } from "../../hooks/useClipboard";

import { useWallet } from "../../context/WalletContext";
import { useSession } from "../../context/SessionContext";

import { DashboardHeader } from "./layout/Header/DashboardHeader";
import {
  BottomNavigation,
  DashboardView,
} from "./layout/Navigation/BottomNavigation";
import {
  RenameWalletModal,
  DeleteWalletConfirmModal,
} from "./modals/WalletManagement/WalletManagementModals";
import { AddressDrawer } from "./modals/AddressDrawer/AddressDrawer";

import { AddWalletModal } from "./AddWalletModal";
import { AccountPage } from "./modals/AccountModal/AccountPage";
import { getRpcClient } from "../../services/network/RpcService";
import { ErrorBoundary } from "../shared/ErrorBoundary";

import { HomeView } from "./Home";
import { SendView } from "./Send";
import { SwapView } from "./Swap/SwapView";
import { HistoryView } from "./History";
import { PrivacyView } from "./Privacy";
import { TokenDetailView } from "./TokenDetail";

import { NFTGallery } from "./NFT";
import { Token, Wallet } from "../../types";
import { NETWORK_REGISTRY } from "../../constants/networks/registry";

export function Dashboard({
  showToast,
}: {
  showToast: (
    message: string,
    type?: "info" | "success" | "warning" | "error",
  ) => void;
}) {
  const {
    wallet,
    wallets,
    activeWalletIndex,
    balance,
    nonce,
    tokens,
    transactions,
    settings,
    setActiveWallet,
    refreshBalance,
    refreshTransactions,
    setView,
    handleAddWallet,
    handleUpdateWalletName,
    deleteWallet,
    loadMoreTransactions,
    hasMoreTransactions,
    isLoadingMore,
    isLoadingTokens,
    isRefreshing,
  } = useWallet();

  const { lock, password } = useSession();

  const [view, setViewLocal] = useState<DashboardView>("home");
  const [showAddressDrawer, setShowAddressDrawer] = useState(false);
  const [showAddWallet, setShowAddWallet] = useState(false);

  const { hasCopied, copy } = useClipboard(2000, {
    onSuccess: () => showToast("Address copied", "success"),
    onError: () => showToast("Failed to copy address", "error"),
  });

  const [isBalanceHidden, setIsBalanceHidden] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameWalletIndex, setRenameWalletIndex] = useState<number | null>(
    null,
  );
  const [renameWalletName, setRenameWalletName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [selectedToken, setSelectedToken] = useState<Token | null>(null);

  const [sendStep, setSendStep] = useState<string>("select");
  const hideChrome =
    (view === "send" && (sendStep === "confirm" || sendStep === "sending")) ||
    view === "swap";

  const [derivedEvmAddress, setDerivedEvmAddress] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    if (wallet) {
      if (wallet.evmAddress) {
        setDerivedEvmAddress(wallet.evmAddress);
      } else if (wallet.privateKeyHex) {
        try {
          let pk = wallet.privateKeyHex;
          if (!pk.startsWith("0x")) pk = "0x" + pk;
          if (/^0x[a-fA-F0-9]{64}$/.test(pk)) {
            const evmWallet = new ethers.Wallet(pk);
            setDerivedEvmAddress(ethers.getAddress(evmWallet.address));
          } else {
            setDerivedEvmAddress(undefined);
          }
        } catch (e) {
          console.error("Failed to derive EVM address:", e);
          setDerivedEvmAddress(undefined);
        }
      } else {
        setDerivedEvmAddress(undefined);
      }
    }
  }, [wallet]);

  useEffect(() => {
    setViewLocal("home");
    setSelectedToken(null);
  }, [wallet?.address, activeWalletIndex]);

  const rpcClient = getRpcClient();

  useEffect(() => {
    if (view === "history" && refreshTransactions) {
      refreshTransactions();
    }
  }, [view]); // intentionally exclude refreshTransactions to avoid retrigger storms

  const handleCopyAddress = () => {
    if (!wallet?.address) return;
    const networkSetting = settings?.network || "all";
    const netConfig = NETWORK_REGISTRY[networkSetting];
    let address = wallet.address;
    if (netConfig?.addressType === "evm" && derivedEvmAddress) {
      address = derivedEvmAddress;
    } else if (netConfig?.addressType === "solana" && wallet.solanaAddress) {
      address = wallet.solanaAddress;
    } else if (netConfig?.addressType === "sui" && wallet.suiAddress) {
      address = wallet.suiAddress;
    } else if (netConfig?.addressType === "bitcoin" && wallet.bitcoinAddress) {
      address = wallet.bitcoinAddress;
    }
    copy(address);
  };

  const handleBack = () => {
    setSelectedToken(null);
    setSendStep("select");
    setViewLocal("home");
  };

  const handleTokenClick = (token: Token) => {
    setSelectedToken(token);
    setViewLocal("token-detail" as any);
  };

  const handleTokenSend = (token: Token) => {
    setSelectedToken(token);
    setViewLocal("send");
  };

  const handleOpenRename = (index: number, currentName: string) => {
    setRenameWalletIndex(index);
    setRenameWalletName(currentName || `Wallet ${index + 1}`);
    setShowRenameModal(true);
  };

  const handleSaveRename = async (newName: string) => {
    if (newName.trim() && renameWalletIndex !== null) {
      setIsRenaming(true);
      try {
        await handleUpdateWalletName(renameWalletIndex, newName.trim());
        showToast("Wallet renamed successfully", "success");
        setShowRenameModal(false);
        setRenameWalletIndex(null);
        setRenameWalletName("");
      } catch (err) {
        console.error("Failed to rename wallet:", err);
        showToast("Failed to rename wallet", "error");
      } finally {
        setIsRenaming(false);
      }
    } else {
      setShowRenameModal(false);
      setRenameWalletIndex(null);
      setRenameWalletName("");
    }
  };

  const handleDeleteWallet = async () => {
    if (renameWalletIndex !== null && password) {
      await deleteWallet(renameWalletIndex, password);
      if (wallets.length <= 1) {
        setView("welcome");
      }
    }
    setShowDeleteConfirm(false);
    setShowRenameModal(false);
    setRenameWalletIndex(null);
  };

  const handleAddWalletInternal = async (data: {
    type: string;
    privateKey?: string;
    mnemonic?: string;
  }) => {
    if (!password) {
      showToast("Session locked", "error");
      return;
    }

    try {
      let newWallet: Wallet;
      if (data.type === "create") {
        const { generateWallet } = await import("../../utils/crypto");
        newWallet = await generateWallet();
      } else if (data.type === "import") {
        const { importFromPrivateKey } = await import("../../utils/crypto");
        if (!data.privateKey) throw new Error("Private key required");
        newWallet = await importFromPrivateKey(data.privateKey);
      } else if (data.type === "import_mnemonic") {
        const { importFromMnemonic } = await import("../../utils/crypto");
        if (!data.mnemonic) throw new Error("Mnemonic required");
        newWallet = await importFromMnemonic(data.mnemonic);
      } else {
        throw new Error("Invalid wallet type");
      }

      await handleAddWallet(newWallet, password);
      showToast("Wallet added successfully", "success");
      setShowAddWallet(false);
    } catch (error: any) {
      console.error("Failed to add wallet:", error);
      showToast(error.message || "Failed to add wallet", "error");
    }
  };

  const handleChangeView = (v: DashboardView) => {
    setSendStep("select");
    setViewLocal(v);
  };

  if (!wallet) return <div>Loading Wallet...</div>;

  return (
    <>
      {!hideChrome && (
        <DashboardHeader
          wallet={wallet}
          wallets={wallets}
          balance={balance}
          activeWalletIndex={activeWalletIndex}
          isRefreshing={isRefreshing}
          activeWalletTokens={tokens}
          onSwitchWallet={setActiveWallet}
          onAddWallet={() => setShowAddWallet(true)}
          onRenameWallet={handleOpenRename}
          onRefresh={() => refreshBalance("both", { force: true })}
          onOpenSettings={() => setView("settings")}
          onShowAddresses={() => setShowAddressDrawer(true)}
          onOpenAccount={() => setViewLocal("account" as any)}
          networkSetting={settings?.network || "all"}
        />
      )}

      {/* Rename Wallet Modal */}
      {showRenameModal && (
        <RenameWalletModal
          isOpen={showRenameModal}
          currentName={renameWalletName}
          onClose={() => setShowRenameModal(false)}
          onSave={handleSaveRename}
          onDeleteStart={() => setShowDeleteConfirm(true)}
          isSaving={isRenaming}
        />
      )}

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <DeleteWalletConfirmModal
          isOpen={showDeleteConfirm}
          walletName={wallets[renameWalletIndex!]?.name || "Wallet"}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteWallet}
        />
      )}

      <AddressDrawer
        isOpen={showAddressDrawer}
        octraAddress={wallet.address}
        evmAddress={derivedEvmAddress}
        solanaAddress={wallet.solanaAddress}
        suiAddress={wallet.suiAddress}
        bitcoinAddress={wallet.bitcoinAddress}
        onClose={() => setShowAddressDrawer(false)}
        showToast={showToast}
      />

      {/* Add Wallet Modal */}
      {showAddWallet && (
        <AddWalletModal
          onClose={() => setShowAddWallet(false)}
          onAddWallet={handleAddWalletInternal}
        />
      )}

      {/* Account page rendered inline below */}

      <div
        className={`wallet-content no-scrollbar relative ${hideChrome ? "chrome-hidden" : ""}`}
      >
        <ErrorBoundary key={view}>
          {view === "home" && (
            <HomeView
              wallet={wallet}
              balance={balance}
              transactions={transactions}
              allTokens={tokens}
              isLoadingTokens={isLoadingTokens}
              onCopyAddress={handleCopyAddress}
              copied={hasCopied}
              onTokenClick={handleTokenClick}
              isBalanceHidden={isBalanceHidden}
              onToggleBalance={() => setIsBalanceHidden(!isBalanceHidden)}
              onRefresh={refreshBalance}
              networkSetting={settings?.network || "all"}
            />
          )}

          {view === "send" && (
            <SendView
              wallet={wallet}
              balance={balance}
              nonce={nonce}
              settings={
                settings || {
                  network: "all",
                  showTestnet: false,
                  hideDust: false,
                  explorerUrl: "",
                  rpcUrl: "",
                }
              }
              onLock={lock}
              allTokens={tokens}
              onRefresh={refreshBalance}
              onBack={handleBack}
              initialToken={selectedToken || undefined}
              onStepChange={setSendStep}
            />
          )}

          {view === "swap" && (
            <SwapView
              wallet={wallet}
              tokens={tokens}
              balance={balance}
              address={wallet.address}
              onRefresh={refreshBalance}
              isRefreshing={isRefreshing}
              onBack={() => setViewLocal("home")}
              settings={
                settings || {
                  network: "all",
                  showTestnet: false,
                  hideDust: false,
                  explorerUrl: "",
                  rpcUrl: "",
                }
              }
            />
          )}

          {view === "history" && (
            <HistoryView
              transactions={transactions}
              address={wallet.address}
              evmAddress={derivedEvmAddress}
              settings={
                settings || {
                  network: "all",
                  showTestnet: false,
                  hideDust: false,
                  explorerUrl: "",
                  rpcUrl: "",
                }
              }
              onBack={handleBack}
              isLoading={isRefreshing}
              onLoadMore={loadMoreTransactions}
              hasMore={hasMoreTransactions}
              isLoadingMore={isLoadingMore}
              tokens={tokens}
            />
          )}

          {view === "privacy" && (
            <PrivacyView
              wallet={wallet}
              publicBalance={balance}
              onBack={handleBack}
            />
          )}

          {view === "nft" && (
            <NFTGallery
              wallet={wallet}
              rpcClient={rpcClient}
              onBack={handleBack}
            />
          )}

          {/* Token Detail View */}
          {view === "token-detail" && selectedToken && (
            <TokenDetailView
              token={selectedToken}
              evmAddress={derivedEvmAddress}
              octraAddress={wallet?.address}
              solanaAddress={wallet?.solanaAddress}
              suiAddress={wallet?.suiAddress}
              bitcoinAddress={wallet?.bitcoinAddress}
              onBack={handleBack}
              onSend={() => handleTokenSend(selectedToken)}
              onShowQR={() => setShowAddressDrawer(true)}
              transactions={transactions.filter((tx) => {
                if (selectedToken.isNative && !tx.token) return true;
                if (selectedToken.contractAddress && tx.contractAddress) {
                  return (
                    tx.contractAddress.toLowerCase() ===
                    selectedToken.contractAddress.toLowerCase()
                  );
                }
                return (
                  tx.token?.toLowerCase() ===
                  selectedToken.symbol?.toLowerCase()
                );
              })}
            />
          )}

          {/* Account Page */}
          {(view as any) === "account" && (
            <AccountPage
              wallet={wallet}
              activeWalletIndex={activeWalletIndex}
              onBack={handleBack}
              onRename={(idx, name) => {
                handleBack();
                handleOpenRename(idx, name);
              }}
              onDelete={() => {
                handleBack();
                setRenameWalletIndex(activeWalletIndex);
                setShowDeleteConfirm(true);
              }}
            />
          )}
        </ErrorBoundary>
      </div>

      {!hideChrome && (
        <BottomNavigation
          view={view as DashboardView}
          onChangeView={handleChangeView}
        />
      )}
    </>
  );
}
