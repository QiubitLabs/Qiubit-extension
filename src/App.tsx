/**
 * Octra Wallet - Main Application
 * A simple, elegant wallet for the Octra network
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';

import { WelcomeScreen, CreateWalletScreen, ImportWalletScreen } from './components/welcome';
import { Dashboard } from './components/dashboard';
import { SettingsScreen } from './components/settings';
import { LockScreen, SetupPassword } from './components/lockscreen';
import DappApprovalScreen from './components/dapp/DappApproval';

// Context
import { SessionProvider, useSession } from './context/SessionContext';
import { WalletProvider, useWallet } from './context/WalletContext';

// Services
import { getRpcClient } from './services/network/RpcService';
import { SessionService } from './services/core/SessionService';

// Custom Hooks (Orchestration logic)
import { useWalletAuth } from './hooks/useWalletAuth';
import { useWalletOnboarding } from './hooks/useWalletOnboarding';

import { LoadingScreen, Toast } from './components/shared';

function AppContent() {
  const session = useSession();
  const walletContext = useWallet();

  // Local UI State
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const [dappRequest, setDappRequest] = useState<any | null>(null);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Approval id stored so onApprove/onReject can RESOLVE_APPROVAL back to background
  const [approvalId, setApprovalId] = useState<string | null>(null);
  // Pending approval held here until wallet is unlocked (view = 'dashboard')
  const [pendingApproval, setPendingApproval] = useState<any | null>(null);

  // Check for dApp approval request in URL hash — background passes ?id=<uuid>
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#/dapp/approve')) return;
    const queryPart = hash.split('?')[1];
    if (!queryPart) return;
    const params = new URLSearchParams(queryPart);
    const id = params.get('id');
    if (!id) return;

    // Fetch the pending approval record from background
    chrome.runtime.sendMessage({ type: 'GET_PENDING_APPROVALS' }, (approvals: any[]) => {
      if (!approvals) return;
      const found = approvals.find((a: any) => a.id === id);
      if (!found) return;
      setApprovalId(id);
      // Hold in pendingApproval; it moves to dappRequest once wallet is unlocked
      setPendingApproval({
        origin: found.origin,
        action: found.type,
        params: found.params,
        icon: found.params?.favicon || '',
      });
    });
  }, []);

  // Whether this popup was opened specifically for dApp approval
  const isApprovalPopup = useRef(window.location.hash.startsWith('#/dapp/approve'));

  // Show approval overlay once wallet is unlocked (view = 'dashboard')
  // In an approval popup, also try to hydrate wallets if onSessionRestored failed
  useEffect(() => {
    if (!pendingApproval || walletContext.currentView !== 'dashboard') return;
    setDappRequest(pendingApproval);
    setPendingApproval(null);
  }, [pendingApproval, walletContext.currentView]);

  // Fallback: if approval popup shows but wallet state not hydrated, load wallets from session
  useEffect(() => {
    if (!dappRequest || !isApprovalPopup.current) return;
    if (walletContext.wallets && walletContext.wallets.length > 0) return;
    const decrypted = SessionService.getDecryptedWallets();
    if (decrypted && decrypted.length > 0) {
      walletContext.setWallets(decrypted as any);
    }
  }, [dappRequest]);

  // Auth Hook (Orchestration)
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
    refreshTransactions: walletContext.refreshTransactions
  });

  // Onboarding Hook (Orchestration)
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
    rpcClient: getRpcClient()
  });

  // Initialize App
  useEffect(() => {
    // The approval popup only needs session restoration, not the full wallet
    // initialization flow. Running handleUnlock here risks locking the background
    // keyring if any initialization step (OCS01, privacy service, balance fetch)
    // throws — because handleUnlock's error catch calls keyringService.lock() which
    // propagates to the background SW and breaks the pending approval.
    if (isApprovalPopup.current) {
      walletContext.initializeApp(session.restoreActiveSession, async (restoredPwd: string) => {
        // Lightweight sync: load React state from already-decrypted session data.
        // No heavy service initialization, no risk of background keyring lock.
        const decrypted = SessionService.getDecryptedWallets();
        if (decrypted && decrypted.length > 0) {
          walletContext.setWallets(decrypted as any);
        }
        session.setIsUnlocked(true);
        session.setPassword(restoredPwd);
        session.setSessionKey(SessionService.getSessionKey());
      });
    } else {
      walletContext.initializeApp(session.restoreActiveSession, auth.handleUnlock);
    }
  }, []);

  // Auto-lock: listen for wallet:auto-locked event and record activity
  useEffect(() => {
    const handleAutoLock = () => {
      session.lock();
    };

    const recordActivity = () => SessionService.recordActivity();

    window.addEventListener('wallet:auto-locked', handleAutoLock);
    window.addEventListener('mousemove', recordActivity, { passive: true });
    window.addEventListener('keydown', recordActivity, { passive: true });
    window.addEventListener('touchstart', recordActivity, { passive: true });

    return () => {
      window.removeEventListener('wallet:auto-locked', handleAutoLock);
      window.removeEventListener('mousemove', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      window.removeEventListener('touchstart', recordActivity);
    };
  }, [session.lock]);

  const { currentView: view, wallet } = walletContext;

  return (
    <div className="w-full h-full text-white font-sans overflow-hidden relative flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {dappRequest && (
        <DappApprovalScreen
          request={dappRequest}
          onReject={async () => {
            if (approvalId) {
              chrome.runtime.sendMessage({
                type: 'RESOLVE_APPROVAL',
                data: { id: approvalId, decision: 'rejected', result: null },
              });
            }
            setDappRequest(null);
            setApprovalId(null);
            window.close();
          }}
          onApprove={async (req: any) => {
            if (approvalId) {
              chrome.runtime.sendMessage({
                type: 'RESOLVE_APPROVAL',
                data: {
                  id: approvalId,
                  decision: 'approved',
                  result: req._evmResult ?? null,
                  sessionKey: session.sessionKey,
                  selectedOctraAddress: req._selectedOctraAddress ?? null,
                  selectedEvmAddress: req._selectedEvmAddress ?? null,
                },
              });
            }
            setDappRequest(null);
            setApprovalId(null);
            window.close();
          }}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Auth/onboarding views always render — needed for unlock flow before approval */}
      {view === 'loading' && <LoadingScreen />}

      {/* Dashboard state restored but wallet not yet hydrated — show loader to prevent blank screen */}
      {!dappRequest && view === 'dashboard' && !wallet && <LoadingScreen />}

      {view === 'welcome' && (
        <WelcomeScreen
          onCreateWallet={() => walletContext.setView('create_wallet')}
          onImportWallet={() => walletContext.setView('import_wallet')}
        />
      )}

      {view === 'create_wallet' && (
        <CreateWalletScreen
          onBack={() => walletContext.setView('welcome')}
          onComplete={onboarding.handleWalletGenerated}
        />
      )}

      {view === 'import_wallet' && (
        <ImportWalletScreen
          onBack={() => walletContext.setView('welcome')}
          onComplete={onboarding.handleImportWallet}
        />
      )}

      {view === 'setup_password' && (
        <SetupPassword
          onComplete={onboarding.handleSetupPassword}
        />
      )}

      {view === 'lock' && (
        <LockScreen
          onUnlock={auth.handleUnlock}
          onRecover={onboarding.handleRecover}
        />
      )}

      {/* Dashboard/settings hidden when approval overlay is showing */}
      {!dappRequest && view === 'dashboard' && wallet && (
        <Dashboard showToast={showToast} />
      )}

      {!dappRequest && view === 'settings' && wallet && (
        <SettingsScreen
          onPasswordChange={auth.handlePasswordChange}
        />
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
