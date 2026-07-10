import { useState, useCallback } from "react";
import {
  hasPasswordSecure as hasPassword,
  hasWalletsSecure as hasWallets,
} from "../utils/storage";
import {
  loadSettingsPlain,
  saveSettingsPlain,
} from "../utils/storage/settings";
import { runMigrations } from "../migrations";
import { setRpcUrl } from "../services/network/RpcService";
import { initCurrency } from "../services/network/CurrencyService";

export function useAppInitialization() {
  const [view, setView] = useState<string>("loading");
  const [settings, setSettingsState] = useState<any>(() => loadSettingsPlain());

  const initializeApp = useCallback(
    async (
      restoreSession: () => Promise<string | null>,
      onSessionRestored: (pwd: string) => Promise<void>,
    ) => {
      runMigrations().catch(() => {});
      initCurrency().catch(() => {});

      try {
        const savedSettings = loadSettingsPlain();
        let network = savedSettings?.network || "all";
        if (network === "mainnet" || network === "testnet") {
          network = "all";
        }
        const settingsWithDefaults = {
          ...savedSettings,
          network,
        };

        if (network !== savedSettings?.network) {
          saveSettingsPlain(settingsWithDefaults);
        }

        if ((settingsWithDefaults as any).rpcUrl) {
          setRpcUrl((settingsWithDefaults as any).rpcUrl);
        }
        setSettingsState(settingsWithDefaults);

        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          chrome.storage.local
            .set({ dapp_active_network: network })
            .catch(() => {});
        }

        const hasWalletsConfigured = await hasWallets();
        const hasPasswordConfigured = await hasPassword();

        if (hasWalletsConfigured && hasPasswordConfigured) {
          const restoredPwd = await restoreSession();

          if (restoredPwd) {
            try {
              await onSessionRestored(restoredPwd);
            } catch (restoreErr) {
              console.warn(
                "[useAppInitialization] onSessionRestored failed but session is valid:",
                restoreErr,
              );
            }
            setView("dashboard");
            return;
          }

          setView("lock");
        } else {
          setView("welcome");
        }
      } catch (error) {
        console.error("[useAppInitialization] Init error:", error);
        try {
          const stillHasWallets = await hasWallets();
          setView(stillHasWallets ? "lock" : "welcome");
        } catch {
          setView("welcome");
        }
      }
    },
    [],
  );

  const updateSettings = useCallback(
    async (newSettings: any) => {
      const updated = { ...settings, ...newSettings };
      setSettingsState(updated);
      saveSettingsPlain(updated);

      if (newSettings.rpcUrl) {
        setRpcUrl(newSettings.rpcUrl);
      }

      if (
        newSettings.network !== undefined &&
        typeof chrome !== "undefined" &&
        chrome.storage?.local
      ) {
        chrome.storage.local
          .set({ dapp_active_network: newSettings.network })
          .catch(() => {});
      }
    },
    [settings],
  );

  return {
    view,
    settings,
    setView,
    setSettingsState,
    initializeApp,
    updateSettings,
  };
}
