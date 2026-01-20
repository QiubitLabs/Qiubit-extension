/**
 * Dashboard Component - Main wallet view
 * Displays balance, actions, and token list
 */

import { useState, useEffect } from 'react';
import './Dashboard.css';
import {
    SendIcon,
    ReceiveIcon,
    HistoryIcon,
    CloseIcon,
    SettingsIcon,
    WalletIcon,
    PrivacyIcon,
    CheckIcon,
    CopyIcon,
    RefreshIcon
} from '../shared/Icons';
import { WalletSelector, WalletHeader } from '../shared/WalletSelector';
import { Toast } from '../shared/Toast';
import { AddWalletModal } from './AddWalletModal';
import { getRpcClient } from '../../utils/rpc';

// Sub-components
import { HomeView } from './Home';
import { SendView } from './Send';
import { ReceiveView } from './Receive';
import { HistoryView } from './History';
import { PrivacyView } from './Privacy';
import { TokenDetailView } from './TokenDetail';

// Feature components
import { NFTGallery } from './NFT';

export function Dashboard({ wallet, wallets, activeWalletIndex, onSwitchWallet, onAddWallet, onRenameWallet, balance, nonce, transactions, allTokens, isLoadingTokens, onRefresh, isRefreshing, settings, onUpdateSettings, onOpenSettings, onLock, onLoadMoreTransactions, hasMoreTransactions, isLoadingMore, onFetchHistory }) {
    const [view, setView] = useState('home'); // 'home' | 'send' | 'receive' | 'history' | 'nft' | 'tokens' | 'addressbook'
    const [copied, setCopied] = useState(false);
    const [headerCopied, setHeaderCopied] = useState(false);
    const [showWalletSwitcher, setShowWalletSwitcher] = useState(false);

    const handleHeaderCopy = async () => {
        if (wallet?.address) {
            try {
                await navigator.clipboard.writeText(wallet.address);
                setHeaderCopied(true);
                setTimeout(() => setHeaderCopied(false), 2000);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        }
    };

    const handleRefresh = () => {
        if (onRefresh && !isRefreshing) {
            onRefresh();
        }
    };
    const [showAddWallet, setShowAddWallet] = useState(false);

    // Session-based balance visibility (resets on refresh)
    const [isBalanceHidden, setIsBalanceHidden] = useState(false);

    // Toast notification state
    const [toast, setToast] = useState(null);

    // Rename wallet state
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renameWalletIndex, setRenameWalletIndex] = useState(null);
    const [renameWalletName, setRenameWalletName] = useState('');

    // Token detail state
    const [selectedToken, setSelectedToken] = useState(null);

    // Show toast notification
    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        // Toast component handles timeout
    };

    // Reset to home view when wallet changes
    useEffect(() => {
        setView('home');
        setSelectedToken(null);
    }, [wallet?.address, activeWalletIndex]);

    const rpcClient = getRpcClient(settings?.rpcUrl);

    // Trigger History Fetch when entering history view
    useEffect(() => {
        if (view === 'history' && onFetchHistory) {
            console.log('[Dashboard] Entered History View -> Fetching transactions...');
            onFetchHistory();
        }
    }, [view, onFetchHistory]);

    const handleCopyAddress = async () => {
        try {
            await navigator.clipboard.writeText(wallet.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy address', error);
        }
    };

    const handleBack = () => {
        setSelectedToken(null);
        setView('home');
    };

    const handleTokenClick = (token) => {
        setSelectedToken(token);
        setView('token-detail');
    };

    const handleTokenSend = (token) => {
        setSelectedToken(token);
        setView('send');
    };

    const handleSelectWallet = (index) => {
        onSwitchWallet(index);
        setShowWalletSwitcher(false);
    };

    const handleOpenAddWallet = () => {
        setShowWalletSwitcher(false);
        setShowAddWallet(true);
    };

    const handleOpenRename = (index, currentName, e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        setShowWalletSwitcher(false); // Close the dropdown
        setRenameWalletIndex(index);
        setRenameWalletName(currentName || `Wallet ${index + 1}`);
        setShowRenameModal(true);
    };

    const handleSaveRename = () => {
        if (renameWalletName.trim() && onRenameWallet) {
            onRenameWallet(renameWalletIndex, renameWalletName.trim());
        }
        setShowRenameModal(false);
        setRenameWalletIndex(null);
        setRenameWalletName('');
    };

    return (
        <>
            {/* Header */}
            <header className="wallet-header">
                <div style={{ position: 'relative' }}>
                    <WalletHeader
                        wallet={wallet}
                        wallets={wallets}
                        onOpenSelector={() => setShowWalletSwitcher(!showWalletSwitcher)}
                        onCopyAddress={() => {/* Handled inside component */ }}
                    />

                    {/* Compact Dropdown Menu */}
                    {showWalletSwitcher && (
                        <div className="wallet-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                            <WalletSelector
                                wallets={wallets.map((w, i) => ({
                                    ...w,
                                    balance: i === activeWalletIndex ? balance : (w.lastKnownBalance || 0)
                                }))}
                                activeAddress={wallet?.address}
                                onSelect={handleSelectWallet}
                                onAddWallet={handleOpenAddWallet}
                                onEditWallet={(idx) => handleOpenRename(idx, wallets[idx].name, { stopPropagation: () => { } })}
                                onClose={() => setShowWalletSwitcher(false)}
                            />
                        </div>
                    )}
                </div>

                <div className="header-actions">
                    <button className="header-icon-btn" onClick={handleHeaderCopy} title="Copy Address">
                        {headerCopied ? <CheckIcon size={18} className="animate-fade-in-scale" /> : <CopyIcon size={18} />}
                    </button>
                    <button
                        className="header-icon-btn"
                        onClick={handleRefresh}
                        title="Refresh Balance"
                        disabled={isRefreshing}
                    >
                        <RefreshIcon size={18} className={isRefreshing ? 'spin-animation' : ''} />
                    </button>
                    <button className="header-icon-btn" onClick={onOpenSettings}>
                        <SettingsIcon size={18} />
                    </button>
                </div>
            </header>

            {/* Transparent Overlay for closing dropdown */}
            {showWalletSwitcher && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'transparent' }}
                    onClick={() => setShowWalletSwitcher(false)}
                />
            )}

            {/* Rename Wallet Modal */}
            {showRenameModal && (
                <div className="modal-overlay" onClick={() => setShowRenameModal(false)}>
                    <div className="modal-content rename-wallet-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-semibold">Rename Wallet</h3>
                            <button className="modal-close" onClick={() => setShowRenameModal(false)}>
                                <CloseIcon size={20} />
                            </button>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Wallet Name</label>
                            <input
                                type="text"
                                className="input"
                                value={renameWalletName}
                                onChange={(e) => setRenameWalletName(e.target.value)}
                                placeholder="Enter wallet name..."
                                maxLength={20}
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-md">
                            <button
                                className="btn btn-secondary flex-1"
                                onClick={() => setShowRenameModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary flex-1"
                                onClick={handleSaveRename}
                                disabled={!renameWalletName.trim()}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Wallet Modal */}
            {showAddWallet && (
                <AddWalletModal
                    onClose={() => setShowAddWallet(false)}
                    onAddWallet={onAddWallet}
                />
            )}

            {/* Content */}
            <div className="wallet-content">
                {view === 'home' && (
                    <HomeView
                        wallet={wallet}
                        balance={balance}
                        transactions={transactions}
                        onCopyAddress={handleCopyAddress}
                        copied={copied}
                        onSend={() => setView('send')}
                        onReceive={() => setView('receive')}
                        onHistory={() => setView('history')}
                        onNFT={() => setView('nft')}
                        onTokenClick={handleTokenClick}
                        settings={settings}
                        onUpdateSettings={onUpdateSettings}
                        showToast={showToast}
                        isBalanceHidden={isBalanceHidden}
                        onToggleBalance={() => setIsBalanceHidden(!isBalanceHidden)}
                        allTokens={allTokens}
                        isLoadingTokens={isLoadingTokens}
                        onRefresh={onRefresh}
                    />
                )}

                {view === 'send' && (
                    <SendView
                        wallet={wallet}
                        balance={balance}
                        nonce={nonce}
                        onBack={() => { setSelectedToken(null); handleBack(); }}
                        onRefresh={onRefresh}
                        settings={settings}
                        onLock={onLock}
                        initialToken={selectedToken}
                        allTokens={allTokens}
                    />
                )}

                {view === 'receive' && (
                    <ReceiveView
                        address={wallet.address}
                        onBack={handleBack}
                    />
                )}

                {view === 'history' && (
                    <HistoryView
                        transactions={transactions}
                        address={wallet.address}
                        settings={settings}
                        onBack={handleBack}
                        isLoading={isRefreshing && transactions.length === 0}
                        onLoadMore={onLoadMoreTransactions}
                        hasMore={hasMoreTransactions}
                        isLoadingMore={isLoadingMore}
                    />
                )}

                {view === 'privacy' && (
                    <PrivacyView
                        wallet={wallet}
                        onBack={handleBack}
                        showToast={showToast}
                        publicBalance={balance}
                    />
                )}

                {view === 'nft' && (
                    <NFTGallery
                        wallet={wallet}
                        rpcClient={rpcClient}
                        onBack={handleBack}
                    />
                )}

                {view === 'token-detail' && selectedToken && (
                    <TokenDetailView
                        token={selectedToken}
                        wallet={wallet}
                        onBack={handleBack}
                        onSend={handleTokenSend}
                        onReceive={() => setView('receive')}
                        transactions={transactions}
                    />
                )}
            </div>

            {/* Bottom Navigation - OKX Style */}
            <nav className="wallet-nav">
                <button className={`nav-item nav-home ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
                    <WalletIcon size={20} className="nav-icon" />
                    <span className="nav-label">Home</span>
                </button>
                <button className={`nav-item nav-send ${view === 'send' ? 'active' : ''}`} onClick={() => setView('send')}>
                    <SendIcon size={20} className="nav-icon" />
                    <span className="nav-label">Send</span>
                </button>
                <button className={`nav-item nav-privacy ${view === 'privacy' ? 'active' : ''}`} onClick={() => setView('privacy')}>
                    <PrivacyIcon size={20} className="nav-icon" />
                    <span className="nav-label">Privacy</span>
                </button>
                <button className={`nav-item nav-receive ${view === 'receive' ? 'active' : ''}`} onClick={() => setView('receive')}>
                    <ReceiveIcon size={20} className="nav-icon" />
                    <span className="nav-label">Receive</span>
                </button>
                <button className={`nav-item nav-history ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>
                    <HistoryIcon size={20} className="nav-icon" />
                    <span className="nav-label">History</span>
                </button>
            </nav>

            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </>
    );
}

export default Dashboard;
