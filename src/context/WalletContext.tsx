import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useWalletState } from '../hooks/useWalletState';
import { useSession } from './SessionContext';
import { useWalletData } from '../hooks/useWalletData';
import { useTransactionHistory } from '../hooks/useTransactionHistory';
import { useAppInitialization } from '../hooks/useAppInitialization';
import { Wallet, Settings, Transaction, Token } from '../types';
import { filterTokensByNetwork } from '../constants/networks/registry';

interface WalletContextType {
    wallet: Wallet | null;
    wallets: Wallet[];
    activeWalletIndex: number;
    pendingWallet: Wallet | null;
    balance: number;
    nonce: number;
    tokens: Token[];
    transactions: Transaction[];
    isSyncing: boolean;
    network: string;
    settings: Settings | null;
    currentView: string;

    // Actions & Setters
    setActiveWallet: (index: number) => Promise<void>;
    setActiveWalletIdx: (index: number) => void; // raw setter for auth flow
    refreshBalance: (mode?: 'public' | 'private' | 'both', opts?: { force?: boolean; auto?: boolean }) => Promise<void>;
    refreshTransactions: (opts?: { force?: boolean }) => Promise<void>;
    setView: (view: string) => void;
    fetchAllTokens: () => Promise<void>;
    setSettings: (settings: any) => void;
    initializeApp: (restoreSession: () => Promise<string | null>, onSessionRestored: (pwd: string) => Promise<void>) => Promise<void>;

    // Wallet Management
    handleAddWallet: (newWallet: Wallet, pwd: string) => Promise<void>;
    handleUpdateWalletName: (index: number, name: string) => Promise<void>;
    deleteWallet: (index: number, pwd: string) => Promise<void>;

    // Setters for Hooks (needed for orchestration in App.tsx)
    setWallets: (wallets: Wallet[]) => void;
    setPendingWallet: (wallet: Wallet | null) => void;
    setBalance: (balance: number) => void;
    setNonce: (nonce: number) => void;
    setTransactions: (transactions: Transaction[]) => void;

    // Hook Logic Exports
    loadMoreTransactions: () => Promise<void>;
    hasMoreTransactions: boolean;
    isLoadingMore: boolean;
    isLoadingTokens: boolean;
    isRefreshing: boolean;
    updateSettings: (newSettings: any) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const session = useSession();
    const appInit = useAppInitialization();

    // Core Wallet State
    const walletState = useWalletState(session.password);

    // Unified Data Hook (Replaces useBalanceRefresh & useWalletSync)
    const walletData = useWalletData({
        wallet: walletState.wallet,
        wallets: walletState.wallets,
        isUnlocked: session.isUnlocked,
        password: session.password,
        network: appInit.settings?.network || 'mainnet',
        setWallets: walletState.setWallets,
        extendSession: session.extendSession
    });

    // Transaction History — must use the live network setting, not a hardcoded string
    const txHistory = useTransactionHistory(walletState.wallet, session.password, { network: appInit.settings?.network || 'mainnet' });

    // Network-filtered tokens (must be a top-level hook, NOT nested inside useMemo)
    const filteredTokens = useMemo(() => {
        const networkMode = appInit.settings?.network || 'all';
        return filterTokensByNetwork(walletData.tokens, networkMode);
    }, [walletData.tokens, appInit.settings?.network]);

    const value: WalletContextType = useMemo(() => ({
        wallet: walletState.wallet,
        wallets: walletState.wallets,
        activeWalletIndex: walletState.activeWalletIndex,
        pendingWallet: walletState.pendingWallet,
        balance: walletData.balance,
        nonce: walletData.nonce,
        tokens: filteredTokens,
        transactions: txHistory.transactions,
        // Combined loading state
        isSyncing: walletData.isRefreshing || walletData.isLoadingTokens || txHistory.isLoadingMore,
        network: appInit.settings?.network || 'mainnet',
        settings: appInit.settings,
        currentView: appInit.view,

        setActiveWallet: walletState.setActiveWallet,
        setActiveWalletIdx: walletState.setActiveWalletIdx,
        refreshBalance: walletData.refreshAll,
        refreshTransactions: txHistory.refreshTransactions,
        setView: appInit.setView,
        fetchAllTokens: () => walletData.refreshAll('both', { force: true }),
        setSettings: appInit.setSettingsState,
        initializeApp: appInit.initializeApp,

        handleAddWallet: walletState.handleAddWallet,
        handleUpdateWalletName: walletState.handleUpdateWalletName,
        deleteWallet: walletState.deleteWallet,

        setWallets: walletState.setWallets,
        setPendingWallet: walletState.setPendingWallet,
        setBalance: walletData.setBalance,
        setNonce: walletData.setNonce,
        setTransactions: txHistory.setTransactions,

        loadMoreTransactions: txHistory.loadMoreTransactions,
        hasMoreTransactions: txHistory.hasMoreTxs,
        isLoadingMore: txHistory.isLoadingMore,
        isLoadingTokens: walletData.isLoadingTokens,
        isRefreshing: walletData.isRefreshing,
        updateSettings: appInit.updateSettings
    }), [
        walletState.wallet, walletState.wallets, walletState.activeWalletIndex, walletState.pendingWallet,
        walletState.setActiveWallet, walletState.setActiveWalletIdx, walletState.handleAddWallet, walletState.handleUpdateWalletName,
        walletState.deleteWallet, walletState.setWallets, walletState.setPendingWallet,
        
        walletData.balance, walletData.nonce, filteredTokens, walletData.isRefreshing, 
        walletData.isLoadingTokens, walletData.refreshAll, walletData.setBalance, walletData.setNonce,
        
        txHistory.transactions, txHistory.isLoadingMore, txHistory.hasMoreTxs, 
        txHistory.refreshTransactions, txHistory.setTransactions, txHistory.loadMoreTransactions,
        
        appInit.settings, appInit.view, appInit.setView, appInit.setSettingsState, 
        appInit.initializeApp, appInit.updateSettings
    ]);

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};
