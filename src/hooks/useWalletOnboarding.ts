import { Wallet } from "../types";
import { useWalletRecovery } from "./onboarding/useWalletRecovery";
import { useWalletCreation } from "./onboarding/useWalletCreation";
import { useWalletImport } from "./onboarding/useWalletImport";

interface UseWalletOnboardingProps {
  password: string | null;
  pendingWallet: Wallet | null;
  setWallets: (wallets: Wallet[]) => void;
  setPassword: (pwd: string | null) => void;
  setIsUnlocked: (isUnlocked: boolean) => void;
  setBalance: (balance: number) => void;
  setNonce: (nonce: number) => void;
  setTransactions: (txs: any[]) => void;
  setView: (view: string) => void;
  setPendingWallet: (wallet: Wallet | null) => void;
  showToast: (
    message: string,
    type: "info" | "success" | "warning" | "error",
  ) => void;
  saveActiveSession: (pwd: string) => Promise<void>;
  addWalletInternal: (wallet: Wallet, pwd: string) => Promise<void>;
  refreshTransactions: (opts?: { force?: boolean }) => Promise<void>;
  refreshBalance: (
    mode?: "public" | "private" | "both",
    opts?: { force?: boolean },
  ) => Promise<void>;
  rpcClient: any;
}

export function useWalletOnboarding(props: UseWalletOnboardingProps) {
  const {
    setWallets,
    setPassword,
    setIsUnlocked,
    setBalance,
    setNonce,
    setView,
    saveActiveSession,
    rpcClient,
  } = props;

  const { handleRecover } = useWalletRecovery({
    setWallets,
    setPassword,
    setIsUnlocked,
    setBalance,
    setNonce,
    setView,
    saveActiveSession,
    rpcClient,
  });

  const { handleSetupPassword, handleWalletGenerated } = useWalletCreation({
    password: props.password,
    pendingWallet: props.pendingWallet,
    setWallets,
    setPassword,
    setIsUnlocked,
    setBalance,
    setNonce,
    setTransactions: props.setTransactions,
    setView,
    setPendingWallet: props.setPendingWallet,
    showToast: props.showToast,
    saveActiveSession,
    refreshBalance: props.refreshBalance,
  });

  const { handleImportWallet, handleAddWalletFromModal } = useWalletImport({
    password: props.password,
    setView,
    setPassword,
    setIsUnlocked,
    showToast: props.showToast,
    saveActiveSession,
    addWalletInternal: props.addWalletInternal,
    refreshTransactions: props.refreshTransactions,
    refreshBalance: props.refreshBalance,
  });

  return {
    handleRecover,
    handleSetupPassword,
    handleWalletGenerated,
    handleImportWallet,
    handleAddWalletFromModal,
  };
}
