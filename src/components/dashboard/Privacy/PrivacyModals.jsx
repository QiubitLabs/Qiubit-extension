import { useState } from 'react';
import { formatAmount, isValidAddress } from '../../../utils/crypto';
import {
    ShieldIcon,
    UnshieldIcon,
    PrivateTransferIcon,
    ClaimIcon,
    CloseIcon,
    PublicIcon,
    LockIcon,
    AlertIcon,
    InfoIcon
} from '../../shared/Icons';

/**
 * Shield/Unshield Modal
 * Allows users to move balance between public and encrypted
 */
export function ShieldModal({ isOpen, onClose, mode, balance, encryptedBalance, onSubmit }) {
    const [amount, setAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);


    if (!isOpen) return null;

    const isShield = mode === 'shield';
    const maxAmount = isShield ? balance : encryptedBalance;
    const title = isShield ? 'Shield Balance' : 'Unshield Balance';
    const description = isShield
        ? 'Convert public balance to encrypted balance. Your funds will be hidden from public view.'
        : 'Convert encrypted balance to public balance. Your funds will become visible on-chain.';
    const IconComponent = isShield ? ShieldIcon : UnshieldIcon;

    const handleMax = () => {
        setAmount(String(maxAmount));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) return;
        if (amountNum > maxAmount) return;

        setIsLoading(true);
        try {
            await onSubmit(amountNum);
            setAmount('');
            onClose();
        } catch (err) {
            // Silent error handling - no notification
            console.error('Shield/Unshield error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal shield-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="flex items-center gap-sm">
                        <IconComponent size={20} className={isShield ? 'text-accent' : 'text-secondary'} />
                        <h3 className="modal-title">{title}</h3>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <p className="shield-description">{description}</p>

                        <div className="shield-balance-info">
                            <div className="shield-balance-row">
                                <span className="shield-balance-label">Available:</span>
                                <span className="shield-balance-value">
                                    {formatAmount(maxAmount)} OCT
                                </span>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Amount</label>
                            <div className="input-with-button">
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    step="0.000001"
                                    min="0"
                                    max={maxAmount}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline max-btn"
                                    onClick={handleMax}
                                    disabled={isLoading}
                                >
                                    MAX
                                </button>
                            </div>

                        </div>

                        <div className="shield-preview">
                            <div className="shield-preview-row">
                                <span>After {isShield ? 'shielding' : 'unshielding'}:</span>
                            </div>
                            <div className="shield-preview-balances">
                                <div className="shield-preview-item">
                                    <span className="preview-icon">
                                        <PublicIcon size={14} />
                                    </span>
                                    <span className="preview-label">Public</span>
                                    <span className="preview-value">
                                        {formatAmount(
                                            isShield
                                                ? balance - (parseFloat(amount) || 0)
                                                : balance + (parseFloat(amount) || 0)
                                        )} OCT
                                    </span>
                                </div>
                                <div className="shield-preview-item shielded">
                                    <span className="preview-icon">
                                        <ShieldIcon size={14} />
                                    </span>
                                    <span className="preview-label">Shielded</span>
                                    <span className="preview-value">
                                        {formatAmount(
                                            isShield
                                                ? encryptedBalance + (parseFloat(amount) || 0)
                                                : encryptedBalance - (parseFloat(amount) || 0)
                                        )} OCT
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-outline flex-1"
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className={`btn flex-1 ${isShield ? 'btn-primary' : 'btn-secondary'}`}
                            disabled={isLoading || !amount}
                        >
                            {isLoading ? (
                                <span className="loading-spinner" style={{ width: 16, height: 16 }} />
                            ) : (
                                title
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/**
 * Private Transfer Modal
 * Send funds from encrypted balance with hidden amounts
 */
export function PrivateTransferModal({ isOpen, onClose, encryptedBalance, onSubmit }) {
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const [step, setStep] = useState(1); // 1: input, 2: confirm

    if (!isOpen) return null;

    const handleMax = () => {
        setAmount(String(encryptedBalance));
    };

    const handleNext = () => {
        if (!isValidAddress(recipient)) return;

        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) return;
        if (amountNum > encryptedBalance) return;

        setStep(2);
    };

    const handleSubmit = async () => {
        setIsLoading(true);

        try {
            await onSubmit(recipient, parseFloat(amount));
            setRecipient('');
            setAmount('');
            setStep(1);
            onClose();
        } catch (err) {
            // Silent error handling - no notification
            console.error('Private transfer error:', err);
            setStep(1);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        setStep(1);

    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal private-transfer-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="flex items-center gap-sm">
                        <PrivateTransferIcon size={20} className="text-accent" />
                        <h3 className="modal-title">Private Transfer</h3>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {step === 1 ? (
                        <>
                            <div className="private-transfer-info">
                                <div className="info-badge">
                                    <span className="info-icon">
                                        <InfoIcon size={16} />
                                    </span>
                                    <span className="info-text">
                                        Amount will be hidden on-chain using FHE encryption
                                    </span>
                                </div>
                            </div>

                            <div className="shield-balance-info">
                                <div className="shield-balance-row">
                                    <span className="shield-balance-label">Encrypted Balance:</span>
                                    <span className="shield-balance-value shielded">
                                        {formatAmount(encryptedBalance)} OCT
                                    </span>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Recipient Address</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="octXXX..."
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Amount</label>
                                <div className="input-with-button">
                                    <input
                                        type="number"
                                        className="input"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        step="0.000001"
                                        min="0"
                                        max={encryptedBalance}
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-sm btn-outline max-btn"
                                        onClick={handleMax}
                                        disabled={isLoading}
                                    >
                                        MAX
                                    </button>
                                </div>

                            </div>
                        </>
                    ) : (
                        <>
                            <div className="confirm-card">
                                <div className="confirm-header">
                                    <span className="confirm-icon">
                                        <LockIcon size={20} />
                                    </span>
                                    <span className="confirm-title">Confirm Private Transfer</span>
                                </div>

                                <div className="confirm-details">
                                    <div className="confirm-row">
                                        <span className="confirm-label">To</span>
                                        <span className="confirm-value address">
                                            {recipient.slice(0, 8)}...{recipient.slice(-8)}
                                        </span>
                                    </div>
                                    <div className="confirm-row">
                                        <span className="confirm-label">Amount</span>
                                        <span className="confirm-value amount">
                                            {formatAmount(parseFloat(amount))} OCT
                                        </span>
                                    </div>
                                    <div className="confirm-row">
                                        <span className="confirm-label">Privacy</span>
                                        <span className="confirm-value privacy flex items-center gap-xs">
                                            <LockIcon size={14} /> Hidden on-chain
                                        </span>
                                    </div>
                                </div>

                                <div className="confirm-warning">
                                    <span className="warning-icon">
                                        <AlertIcon size={16} />
                                    </span>
                                    <span className="warning-text">
                                        Recipient must claim this transfer to receive funds
                                    </span>
                                </div>
                            </div>

                        </>
                    )}
                </div>

                <div className="modal-footer">
                    {step === 1 ? (
                        <>
                            <button
                                type="button"
                                className="btn btn-outline flex-1"
                                onClick={onClose}
                                disabled={isLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary flex-1"
                                onClick={handleNext}
                                disabled={isLoading || !recipient || !amount}
                            >
                                Continue
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className="btn btn-outline flex-1"
                                onClick={handleBack}
                                disabled={isLoading}
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary flex-1"
                                onClick={handleSubmit}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <span className="loading-spinner" style={{ width: 16, height: 16 }} />
                                ) : (
                                    'Send Privately'
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Claim Transfers Modal
 * View and claim pending private transfers
 */
export function ClaimTransfersModal({ isOpen, onClose, pendingTransfers, onClaim, isLoading }) {
    const [claimingId, setClaimingId] = useState(null);

    if (!isOpen) return null;

    const handleClaim = async (transferId) => {
        setClaimingId(transferId);
        try {
            await onClaim(transferId);
        } finally {
            setClaimingId(null);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal claim-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="flex items-center gap-sm">
                        <ClaimIcon size={20} className="text-secondary" />
                        <h3 className="modal-title">Pending Transfers</h3>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {isLoading ? (
                        <div className="empty-state">
                            <div className="loading-spinner" style={{ width: 32, height: 32 }} />
                            <p className="text-secondary mt-md">Loading transfers...</p>
                        </div>
                    ) : pendingTransfers.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">
                                <ClaimIcon size={40} className="opacity-20" />
                            </div>
                            <p>No pending transfers</p>
                            <p className="text-tertiary text-xs">
                                Private transfers sent to you will appear here
                            </p>
                        </div>
                    ) : (
                        <div className="pending-transfers-list">
                            {pendingTransfers.map((transfer) => (
                                <div key={transfer.id} className="pending-transfer-item">
                                    <div className="transfer-info">
                                        <div className="transfer-from">
                                            From: {transfer.from?.slice(0, 8)}...{transfer.from?.slice(-6)}
                                        </div>
                                        <div className="transfer-amount flex items-center gap-xs">
                                            <LockIcon size={12} /> Encrypted Amount
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-sm btn-primary"
                                        onClick={() => handleClaim(transfer.id)}
                                        disabled={claimingId === transfer.id}
                                    >
                                        {claimingId === transfer.id ? (
                                            <span className="loading-spinner" style={{ width: 14, height: 14 }} />
                                        ) : (
                                            'Claim'
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-outline flex-1" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
