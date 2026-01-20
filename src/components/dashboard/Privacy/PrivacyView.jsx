/**
 * Privacy View - Full privacy feature management
 * Clean and simple design with SVG icons
 */

import { useState, useEffect, useCallback } from 'react';
import { formatAmount } from '../../../utils/crypto';
import { privacyService } from '../../../services/PrivacyService';
import { ShieldModal, PrivateTransferModal, ClaimTransfersModal } from './PrivacyModals';
import {
    ChevronLeftIcon,
    ShieldIcon,
    UnshieldIcon,
    PrivateTransferIcon,
    ClaimIcon,
    RefreshIcon
} from '../../shared/Icons';
import './Privacy.css';

export function PrivacyView({ wallet, onBack, showToast, publicBalance }) {
    const [encryptedBalance, setEncryptedBalance] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pendingTransfers, setPendingTransfers] = useState([]);

    // Modal states
    const [shieldModalOpen, setShieldModalOpen] = useState(false);
    const [shieldMode, setShieldMode] = useState('shield');
    const [privateTransferOpen, setPrivateTransferOpen] = useState(false);
    const [claimModalOpen, setClaimModalOpen] = useState(false);

    const fetchPrivacyData = useCallback(async (isInitial = false) => {
        if (!wallet?.address) return;

        if (isInitial) setIsLoading(true);
        setIsRefreshing(true);

        try {
            // privacyService already has PK and handles internal secure cache
            const result = await privacyService.getEncryptedBalance(wallet.address);

            if (result.success) {
                setEncryptedBalance(result);
            }

            const transfers = await privacyService.getPendingTransfers(wallet.address);
            setPendingTransfers(transfers);
        } catch (error) {
            console.error('Failed to fetch privacy data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [wallet?.address, wallet?.privateKeyB64, encryptedBalance]);

    useEffect(() => {
        fetchPrivacyData(true);
    }, []); // Only on mount

    const handleShieldSubmit = async (amount) => {
        try {

            if (shieldMode === 'shield') {
                await privacyService.shieldBalance(wallet.address, amount);
            } else {
                await privacyService.unshieldBalance(wallet.address, amount);
            }

            setTimeout(() => fetchPrivacyData(), 2000);
        } catch (error) {
            showToast?.('Failed. Try again.', 'error');
            throw error;
        }
    };

    const handlePrivateTransferSubmit = async (recipient, amount) => {
        try {
            await privacyService.privacyTransfer(wallet.address, recipient, amount);
            setTimeout(() => fetchPrivacyData(), 2000);
        } catch (error) {
            showToast?.('Failed. Try again.', 'error');
            throw error;
        }
    };

    const handleClaimTransfer = async (transferId) => {
        try {
            await privacyService.claimPrivateTransfer(wallet.address, transferId);
            setTimeout(() => fetchPrivacyData(), 2000);
        } catch (error) {
            showToast?.('Failed. Try again.', 'error');
            throw error;
        }
    };

    const currentPublicBalance = publicBalance !== undefined ? publicBalance : (encryptedBalance?.publicBalance || 0);
    const totalBalance = currentPublicBalance + (encryptedBalance?.encryptedBalance || 0);
    const shieldedPercent = totalBalance > 0
        ? Math.round((encryptedBalance?.encryptedBalance || 0) / totalBalance * 100)
        : 0;

    return (
        <div className="privacy-view animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-md mb-xl">
                <button className="header-icon-btn" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <h2 className="text-lg font-semibold flex-1">Privacy</h2>
                <button
                    className="header-icon-btn"
                    onClick={() => fetchPrivacyData()}
                    disabled={isRefreshing}
                >
                    <RefreshIcon size={20} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Single Balance Card - Always show, balance loads in background */}
            <div className={`privacy-main-card ${isLoading || isRefreshing ? 'updating' : ''}`}>
                <div className="main-card-header">
                    <ShieldIcon size={18} className="main-card-icon" />
                    <span className="main-card-title">Privacy Balance</span>
                </div>

                <div className="main-card-balance">
                    {isLoading && !encryptedBalance ? (
                        <span className="main-balance-amount shimmer">---</span>
                    ) : (
                        <span className={`main-balance-amount ${isRefreshing ? 'shimmer' : ''}`}>
                            {formatAmount(encryptedBalance?.encryptedBalance || 0)}
                        </span>
                    )}
                    <span className="main-balance-symbol">OCT</span>
                </div>

                <div className="main-card-sub">
                    <span className="sub-label">Total Balance:</span>
                    {isLoading && !encryptedBalance ? (
                        <span className="sub-value shimmer">---</span>
                    ) : (
                        <span className={`sub-value ${isRefreshing ? 'shimmer' : ''}`}>
                            {formatAmount(totalBalance)} OCT
                        </span>
                    )}
                </div>

                <div className="shield-progress">
                    <div className="shield-progress-bar">
                        <div
                            className="shield-progress-fill"
                            style={{ width: `${shieldedPercent}%` }}
                        />
                    </div>
                    <span className="shield-progress-text">{shieldedPercent}% Shielded</span>
                </div>
            </div>

            {/* Action Buttons - Always show, never blocked by loading */}
            <div className="privacy-action-grid">
                <button
                    className="privacy-grid-btn"
                    onClick={() => { setShieldMode('shield'); setShieldModalOpen(true); }}
                    disabled={isLoading || currentPublicBalance <= 0}
                >
                    <div className="grid-btn-icon shield">
                        <ShieldIcon size={22} />
                    </div>
                    <span className="grid-btn-label">Shield</span>
                </button>

                <button
                    className="privacy-grid-btn"
                    onClick={() => { setShieldMode('unshield'); setShieldModalOpen(true); }}
                    disabled={isLoading || !encryptedBalance?.hasEncryptedFunds}
                >
                    <div className="grid-btn-icon unshield">
                        <UnshieldIcon size={22} />
                    </div>
                    <span className="grid-btn-label">Unshield</span>
                </button>

                <button
                    className="privacy-grid-btn"
                    onClick={() => setPrivateTransferOpen(true)}
                    disabled={isLoading || !encryptedBalance?.hasEncryptedFunds}
                >
                    <div className="grid-btn-icon transfer">
                        <PrivateTransferIcon size={22} />
                    </div>
                    <span className="grid-btn-label">Transfer</span>
                </button>

                <button
                    className="privacy-grid-btn"
                    onClick={() => setClaimModalOpen(true)}
                >
                    <div className="grid-btn-icon claim">
                        <ClaimIcon size={22} />
                        {pendingTransfers.length > 0 && (
                            <span className="grid-btn-badge">{pendingTransfers.length}</span>
                        )}
                    </div>
                    <span className="grid-btn-label">Claim</span>
                </button>
            </div>

            {(isLoading || isRefreshing) && (
                <div className="refresh-status text-xs text-center mt-xl opacity-50">
                    {isLoading ? 'Loading privacy data...' : 'Updating balance from blockchain...'}
                </div>
            )}

            {/* Modals */}
            <ShieldModal
                isOpen={shieldModalOpen}
                onClose={() => setShieldModalOpen(false)}
                mode={shieldMode}
                balance={currentPublicBalance}
                encryptedBalance={encryptedBalance?.encryptedBalance || 0}
                onSubmit={handleShieldSubmit}
            />

            <PrivateTransferModal
                isOpen={privateTransferOpen}
                onClose={() => setPrivateTransferOpen(false)}
                encryptedBalance={encryptedBalance?.encryptedBalance || 0}
                onSubmit={handlePrivateTransferSubmit}
            />

            <ClaimTransfersModal
                isOpen={claimModalOpen}
                onClose={() => setClaimModalOpen(false)}
                pendingTransfers={pendingTransfers}
                onClaim={handleClaimTransfer}
                isLoading={isRefreshing}
            />
        </div>
    );
}
