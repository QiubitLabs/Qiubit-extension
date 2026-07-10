import { useCallback } from "react";
import { Wallet } from "../../types";
import { hasPasswordSecure as hasPassword, storage } from "../../utils/storage";
import { keyringService } from "../../services/core/KeyringService";
import { privacyService } from "../../services/features/PrivacyService";

interface UseWalletImportProps {
  password: string | null;
  setView: (view: string) => void;
  setPassword: (pwd: string | null) => void;
  setIsUnlocked: (isUnlocked: boolean) => void;
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
}

export function useWalletImport({
  password,
  setView,
  setPassword,
  setIsUnlocked,
  showToast,
  saveActiveSession,
  addWalletInternal,
  refreshTransactions,
  refreshBalance,
}: UseWalletImportProps) {
  const handleImportWallet = useCallback(
    async (importedWallet: Wallet, newPassword: string) => {
      try {
        if (!(await hasPassword())) {
          try {
            await storage.clear();
            sessionStorage.clear();
          } catch (clearErr) {
            console.warn("[useWalletImport] Could not force clear:", clearErr);
          }
        }

        const passToUse = newPassword || password!;

        if (!keyringService.isUnlocked()) {
          await keyringService.initialize([], passToUse);
        }

        try {
          await addWalletInternal(importedWallet, passToUse);
        } catch (addErr: any) {
          if (
            addErr.message &&
            addErr.message.includes("Wallet already exists")
          ) {
            console.warn(
              "[useWalletImport] Import ignored (duplicate), proceeding...",
            );
          } else {
            throw addErr;
          }
        }

        await saveActiveSession(passToUse);

        setPassword(passToUse);
        setIsUnlocked(true);

        if (importedWallet.privateKeyB64 && passToUse) {
          privacyService.setPrivateKey(importedWallet.privateKeyB64, passToUse);
        }

        setTimeout(() => {
          refreshBalance("both", { force: true });
          refreshTransactions({ force: true });
        }, 200);

        setView("dashboard");
      } catch (err: any) {
        console.error("Failed to import wallet:", err);
        showToast(err.message || "Failed to import wallet", "error");
      }
    },
    [
      password,
      addWalletInternal,
      saveActiveSession,
      showToast,
      setView,
      setPassword,
      setIsUnlocked,
      refreshTransactions,
      refreshBalance,
    ],
  );

  const handleAddWalletFromModal = useCallback(
    async (data: { type: string; privateKey?: string; mnemonic?: string }) => {
      if (!password) {
        throw new Error("Cannot add wallet: Session not unlocked");
      }

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

      await handleImportWallet(newWallet, password);
    },
    [password, handleImportWallet],
  );

  return { handleImportWallet, handleAddWalletFromModal };
}
