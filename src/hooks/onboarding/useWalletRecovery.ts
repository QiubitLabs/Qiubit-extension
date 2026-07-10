import { useCallback } from "react";
import { Wallet } from "../../types";
import { addWalletSecure as addWallet, storage } from "../../utils/storage";
import { keyringService } from "../../services/core/KeyringService";

interface UseWalletRecoveryProps {
  setWallets: (wallets: Wallet[]) => void;
  setPassword: (pwd: string | null) => void;
  setIsUnlocked: (isUnlocked: boolean) => void;
  setBalance: (balance: number) => void;
  setNonce: (nonce: number) => void;
  setView: (view: string) => void;
  saveActiveSession: (pwd: string) => Promise<void>;
  rpcClient: any;
}

export function useWalletRecovery({
  setWallets,
  setPassword,
  setIsUnlocked,
  setBalance,
  setNonce,
  setView,
  saveActiveSession,
  rpcClient,
}: UseWalletRecoveryProps) {
  const handleRecover = useCallback(
    async ({
      type,
      value,
      newPassword,
    }: {
      type: "mnemonic" | "privateKey";
      value: string;
      newPassword: string;
    }) => {
      try {
        await storage.clear();
        sessionStorage.clear();

        let recoveredWallet: Wallet;

        if (type === "mnemonic") {
          const { importFromMnemonic } = await import("../../utils/crypto");
          recoveredWallet = await importFromMnemonic(value);
        } else {
          const { importFromPrivateKey } = await import("../../utils/crypto");
          recoveredWallet = await importFromPrivateKey(value);
        }

        await addWallet(recoveredWallet, newPassword);

        await keyringService.initialize([recoveredWallet], newPassword);
        keyringService.addKey(
          recoveredWallet.address,
          recoveredWallet.privateKeyB64,
          recoveredWallet.publicKeyB64,
        );

        setPassword(newPassword);
        const walletWithMeta = {
          ...recoveredWallet,
          id: crypto.randomUUID(),
          name: "Recovered Wallet",
        };
        setWallets([walletWithMeta]);
        setIsUnlocked(true);

        await saveActiveSession(newPassword);

        try {
          const balanceData = await rpcClient.getBalance(
            recoveredWallet.address,
          );
          if (balanceData?.balance !== undefined) {
            setBalance(balanceData.balance);
            setNonce(balanceData.nonce || 0);
          }
        } catch (err) {
          console.warn("[useWalletRecovery] Failed to fetch balance:", err);
          setBalance(0);
          setNonce(0);
        }

        setView("dashboard");
      } catch (error: any) {
        console.error("[useWalletRecovery] [ERROR] Recovery failed:", error);
        throw new Error(
          error.message || "Failed to recover wallet. Please check your input.",
        );
      }
    },
    [
      rpcClient,
      saveActiveSession,
      setView,
      setWallets,
      setPassword,
      setIsUnlocked,
      setBalance,
      setNonce,
    ],
  );

  return { handleRecover };
}
