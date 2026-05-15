/**
 * Octra Wallet - Main Application
 * A simple, elegant wallet for the Octra network
 */

import { useState, useCallback, useEffect } from 'react';
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

  // Check for dApp approval request in URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#/dapp/approve')) {
      try {
        const queryPart = hash.split('?')[1];
        if (queryPart) {
          const params = new URLSearchParams(queryPart);
          const origin = params.get('origin');
          const action = params.get('action');
          const requestParams = params.get('params') ? JSON.parse(params.get('params') || '{}') : {};

          if (origin && action) {
            setDappRequest({
              origin,
              action,
              params: requestParams,
              icon: params.get('icon') || ''
            });
          }
        }
      } catch (e) {
        console.error('Failed to parse dapp request', e);
      }
    }
  }, []);

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
    rpcClient: getRpcClient()
  });

  // Initialize App
  useEffect(() => {
    walletContext.initializeApp(session.restoreActiveSession, auth.handleUnlock);
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
          onReject={async () => setDappRequest(null)}
          onApprove={async () => {
            // Logic to handle approval would go here
            setDappRequest(null);
          }}
        />
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {view === 'loading' && <LoadingScreen />}

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

      {view === 'dashboard' && wallet && (
        <Dashboard showToast={showToast} />
      )}

      {view === 'settings' && wallet && (
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
