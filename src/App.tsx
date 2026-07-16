/**
 * Octra Wallet - Main Application
 * A simple, elegant wallet for the Octra network
 */

import { useState, useCallback, useEffect, useRef } from "react";
import "./App.css";

import {
  WelcomeScreen,
  CreateWalletScreen,
  ImportWalletScreen,
} from "./components/welcome";
import { Dashboard } from "./components/dashboard";
import { SettingsScreen } from "./components/settings";
import { LockScreen, SetupPassword } from "./components/lockscreen";
import DappApprovalScreen from "./components/dapp/DappApproval";

import { SessionProvider, useSession } from "./context/SessionContext";
import { WalletProvider, useWallet } from "./context/WalletContext";

import { getRpcClient } from "./services/network/RpcService";
import { SessionService } from "./services/core/SessionService";

import { useWalletAuth } from "./hooks/useWalletAuth";
import { useWalletOnboarding } from "./hooks/useWalletOnboarding";

import { LoadingScreen, Toast } from "./components/shared";

function AppContent() {
  const session = useSession();
  const walletContext = useWallet();

  const [toast, setToast] = useState<{
    message: string;
    type: "info" | "success" | "warning" | "error";
  } | null>(null);
  const [dappRequest, setDappRequest] = useState<any | null>(null);

  const showToast = useCallback(
    (
      message: string,
      type: "info" | "success" | "warning" | "error" = "info",
    ) => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<any | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#/dapp/approve")) return;
    const queryPart = hash.split("?")[1];
    if (!queryPart) return;
    const params = new URLSearchParams(queryPart);
    const id = params.get("id");
    if (!id) return;

    chrome.runtime.sendMessage(
      { type: "GET_PENDING_APPROVALS" },
      (approvals: any[]) => {
        if (!approvals) return;
        const found = approvals.find((a: any) => a.id === id);
        if (!found) return;
        setApprovalId(id);
        setPendingApproval({
          origin: found.origin,
          action: found.type,
          params: found.params,
          icon: found.params?.favicon || "",
        });
      },
    );
  }, []);

  const isApprovalPopup = useRef(
    window.location.hash.startsWith("#/dapp/approve"),
  );

  useEffect(() => {
    if (!pendingApproval || walletContext.currentView !== "dashboard") return;
    setDappRequest(pendingApproval);
    setPendingApproval(null);
  }, [pendingApproval, walletContext.currentView]);

  useEffect(() => {
    if (!dappRequest || !isApprovalPopup.current) return;
    if (walletContext.wallets && walletContext.wallets.length > 0) return;
    const decrypted = SessionService.getDecryptedWallets();
    if (decrypted && decrypted.length > 0) {
      walletContext.setWallets(decrypted as any);
    }
  }, [dappRequest]);

  // After the current request is signed/rejected, step to the NEXT queued
  // request instead of closing — the OKX/Rabby-style single-window queue.
  // Closes the popup only when the queue is empty.
  const advanceQueue = useCallback(() => {
    setDappRequest(null);
    setApprovalId(null);
    try {
      chrome.runtime.sendMessage(
        { type: "GET_PENDING_APPROVALS" },
        (approvals: any[]) => {
          void chrome.runtime.lastError;
          const next = Array.isArray(approvals) ? approvals[0] : null;
          if (next) {
            setApprovalId(next.id);
            setPendingApproval({
              origin: next.origin,
              action: next.type,
              params: next.params,
              icon: next.params?.favicon || "",
            });
          } else {
            window.close();
          }
        },
      );
    } catch {
      window.close();
    }
  }, []);

  // A new request arrived while this window is open and idle — pick it up.
  useEffect(() => {
    if (!isApprovalPopup.current) return;
    const onMsg = (msg: any) => {
      if (msg?.type === "APPROVAL_QUEUE_CHANGED" && !dappRequest) {
        advanceQueue();
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, [dappRequest, advanceQueue]);

  const auth = useWalletAuth({
    settings: walletContext.settings,
    wallets: walletContext.wallets,
    activeWalletIndex: walletContext.activeWalletIndex,
    setPassword: session.setPassword,
    setWallets: walletContext.setWallets,
    setIsUnlocked: session.setIsUnlocked,
    setActiveWalletIdx: walletContext.setActiveWalletIdx,
    setSessionKey: session.setSessionKey,
    setView: walletContext.setView,
    showToast,
    lock: session.lock,
    saveActiveSession: session.saveActiveSession,
    refreshAllBalances: walletContext.refreshBalance,
    refreshTransactions: walletContext.refreshTransactions,
  });

  const onboarding = useWalletOnboarding({
    password: session.password,
    pendingWallet: walletContext.pendingWallet,
    setWallets: walletContext.setWallets,
    setPassword: session.setPassword,
    setIsUnlocked: session.setIsUnlocked,
    setBalance: walletContext.setBalance,
    setNonce: walletContext.setNonce,
    setTransactions: walletContext.setTransactions,
    setView: walletContext.setView,
    setPendingWallet: walletContext.setPendingWallet,
    showToast,
    saveActiveSession: session.saveActiveSession,
    addWalletInternal: walletContext.handleAddWallet,
    refreshTransactions: walletContext.refreshTransactions,
    refreshBalance: walletContext.refreshBalance,
    rpcClient: getRpcClient(),
  });

  useEffect(() => {
    if (isApprovalPopup.current) {
      walletContext.initializeApp(
        session.restoreActiveSession,
        async (restoredPwd: string) => {
          const decrypted = SessionService.getDecryptedWallets();
          if (decrypted && decrypted.length > 0) {
            walletContext.setWallets(decrypted as any);
          }
          try {
            const { getActiveWalletIndex } = await import("./utils/storage");
            const activeIndex = await getActiveWalletIndex();
            let targetIndex = 0;
            if (
              activeIndex >= 0 &&
              decrypted &&
              activeIndex < decrypted.length
            ) {
              walletContext.setActiveWalletIdx(activeIndex);
              targetIndex = activeIndex;
            }

            const { keyringService } =
              await import("./services/core/KeyringService");
            await keyringService.unlock(restoredPwd, decrypted || []);
            if (decrypted && decrypted[targetIndex]) {
              await keyringService.setActiveWallet(
                decrypted[targetIndex].address,
              );
            }
            const { SessionService } =
              await import("./services/core/SessionService");
            SessionService.syncSessionToBackground();
          } catch (e) {
            console.warn(
              "[App] Failed to restore active wallet index / unlock background:",
              e,
            );
          }
          session.setIsUnlocked(true);
          session.setPassword(restoredPwd);
          session.setSessionKey(SessionService.getSessionKey());
        },
      );
    } else {
      walletContext.initializeApp(
        session.restoreActiveSession,
        auth.handleUnlock,
      );
    }
  }, []);

  useEffect(() => {
    const handleAutoLock = () => {
      session.lock();
    };

    const recordActivity = () => SessionService.recordActivity();

    window.addEventListener("wallet:auto-locked", handleAutoLock);
    window.addEventListener("mousemove", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity, { passive: true });
    window.addEventListener("touchstart", recordActivity, { passive: true });

    return () => {
      window.removeEventListener("wallet:auto-locked", handleAutoLock);
      window.removeEventListener("mousemove", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("touchstart", recordActivity);
    };
  }, [session.lock]);

  const { currentView: view, wallet } = walletContext;

  return (
    <div
      className="w-full h-full text-white font-sans overflow-hidden relative flex flex-col"
      style={{ background: "var(--bg-primary)" }}
    >
      {dappRequest && (
        <DappApprovalScreen
          request={dappRequest}
          onReject={async () => {
            if (approvalId) {
              try {
                await chrome.runtime.sendMessage({
                  type: "RESOLVE_APPROVAL",
                  data: { id: approvalId, decision: "rejected", result: null },
                });
              } catch (err) {
                console.warn("Failed to send reject message:", err);
              }
            }
            advanceQueue();
          }}
          onApprove={async (req: any) => {
            if (approvalId) {
              try {
                await chrome.runtime.sendMessage({
                  type: "RESOLVE_APPROVAL",
                  data: {
                    id: approvalId,
                    decision: "approved",
                    result: req._evmResult ?? null,
                    sessionKey: session.sessionKey,
                    selectedOctraAddress: req._selectedOctraAddress ?? null,
                    selectedEvmAddress: req._selectedEvmAddress ?? null,
                  },
                });
              } catch (err) {
                console.warn("Failed to send approve message:", err);
              }
            }
            advanceQueue();
          }}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Auth/onboarding views always render — needed for unlock flow before approval */}
      {view === "loading" && <LoadingScreen />}

      {/* Dashboard state restored but wallet not yet hydrated — show loader to prevent blank screen */}
      {!dappRequest && view === "dashboard" && !wallet && <LoadingScreen />}

      {view === "welcome" && (
        <WelcomeScreen
          onCreateWallet={() => walletContext.setView("create_wallet")}
          onImportWallet={() => walletContext.setView("import_wallet")}
        />
      )}

      {view === "create_wallet" && (
        <CreateWalletScreen
          onBack={() => walletContext.setView("welcome")}
          onComplete={onboarding.handleWalletGenerated}
        />
      )}

      {view === "import_wallet" && (
        <ImportWalletScreen
          onBack={() => walletContext.setView("welcome")}
          onComplete={onboarding.handleImportWallet}
        />
      )}

      {view === "setup_password" && (
        <SetupPassword onComplete={onboarding.handleSetupPassword} />
      )}

      {view === "lock" && (
        <LockScreen
          onUnlock={auth.handleUnlock}
          onRecover={onboarding.handleRecover}
        />
      )}

      {/* Dashboard/settings hidden when approval overlay is showing */}
      {!dappRequest && view === "dashboard" && wallet && (
        <Dashboard showToast={showToast} />
      )}

      {!dappRequest && view === "settings" && wallet && (
        <SettingsScreen onPasswordChange={auth.handlePasswordChange} />
      )}
    </div>
  );
}

function App() {
  return (
    <SessionProvider>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </SessionProvider>
  );
}

export default App;
