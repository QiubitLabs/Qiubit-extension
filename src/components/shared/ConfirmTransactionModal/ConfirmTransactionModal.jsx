import { useState } from 'react';
import { formatAmount, truncateAddress } from '../../../utils/crypto';
import { CloseIcon, SendIcon, ChevronRightIcon, CheckIcon } from '../Icons';
import './ConfirmTransactionModal.css';

export function ConfirmTransactionModal({
    isOpen,
    onClose,
    onConfirm,
    recipient,
    amount,
    fee,
    feeEstimates,
    feeSpeed,
    onFeeChange,
    tokenSymbol = 'OCT',
    isLoading = false
}) {
    const [showFeePopup, setShowFeePopup] = useState(false);

    if (!isOpen) return null;

    const total = parseFloat(amount) + parseFloat(fee);

    const handleFeeSelect = (speed) => {
        onFeeChange(speed);
        setShowFeePopup(false);
    };

    const getSpeedLabel = () => {
        if (feeSpeed === 'slow') return 'Slow';
        if (feeSpeed === 'fast') return 'Fast';
        return 'Normal';
    };

    return (
        <>
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal confirm-tx-modal" onClick={e => e.stopPropagation()}>
                    {/* Header with Send Icon */}
                    <div className="ctm-header">
                        <button className="ctm-close" onClick={onClose}>
                            <CloseIcon size={18} />
                        </button>
                        <div className="ctm-icon">
                            <SendIcon size={28} />
                        </div>
                        <h3 className="ctm-title">Send</h3>
                        <p className="ctm-amount">
                            <span className="ctm-amount-value">-{formatAmount(parseFloat(amount), 6)}</span>
                            <span className="ctm-amount-symbol">{tokenSymbol}</span>
                        </p>
                    </div>

                    <div className="ctm-body">
                        {/* Network Fee - Clickable */}
                        <div className="ctm-row ctm-row-clickable" onClick={() => setShowFeePopup(true)}>
                            <span className="ctm-label">Est. network fee</span>
                            <div className="ctm-fee-info">
                                <span className="ctm-fee-badge">{getSpeedLabel()}</span>
                                <span className="ctm-fee-value">{formatAmount(fee, 6)} {tokenSymbol}</span>
                                <ChevronRightIcon size={14} />
                            </div>
                        </div>

                        {/* From */}
                        <div className="ctm-row">
                            <span className="ctm-label">From</span>
                            <span className="ctm-value ctm-address">Your Wallet</span>
                        </div>

                        {/* To */}
                        <div className="ctm-row">
                            <span className="ctm-label">To</span>
                            <span
                                className="ctm-value ctm-address"
                                style={{
                                    fontSize: '12px',
                                    fontFamily: "'SF Mono', 'Monaco', 'Consolas', 'Roboto Mono', monospace",
                                    letterSpacing: '0.02em',
                                    wordBreak: 'break-all',
                                    lineHeight: '1.5',
                                    display: 'inline-block',
                                    maxWidth: '85%'
                                }}
                            >
                                <span style={{ fontWeight: '700', opacity: 1 }}>{recipient.slice(0, 5)}</span>
                                <span style={{ opacity: 0.6 }}>{recipient.slice(5, -5)}</span>
                                <span style={{ fontWeight: '700', opacity: 1 }}>{recipient.slice(-5)}</span>
                            </span>
                        </div>

                        {/* Total */}
                        <div className="ctm-row ctm-row-total">
                            <span className="ctm-label">Total</span>
                            <span className="ctm-value ctm-total">{formatAmount(total, 6)} {tokenSymbol}</span>
                        </div>
                    </div>

                    <div className="ctm-footer">
                        <button className="btn btn-secondary" onClick={onClose} disabled={isLoading}>
                            Back
                        </button>
                        <button className="btn btn-primary" onClick={onConfirm} disabled={isLoading}>
                            {isLoading ? 'Sending...' : 'Send'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Fee Selection Mini Popup */}
            {showFeePopup && feeEstimates && (
                <div className="fee-popup-overlay" onClick={() => setShowFeePopup(false)}>
                    <div className="fee-popup" onClick={e => e.stopPropagation()}>
                        <div className="fee-popup-header">
                            <span className="fee-popup-title">Network Fee</span>
                            <button className="fee-popup-close" onClick={() => setShowFeePopup(false)}>
                                <CloseIcon size={16} />
                            </button>
                        </div>
                        <div className="fee-popup-options">
                            <button
                                className={`fee-popup-option ${feeSpeed === 'slow' ? 'active' : ''}`}
                                onClick={() => handleFeeSelect('slow')}
                            >
                                <div className="fee-popup-option-info">
                                    <span className="fee-popup-option-label">Slow</span>
                                    <span className="fee-popup-option-desc">Lower priority</span>
                                </div>
                                <div className="fee-popup-option-value">
                                    <span>{formatAmount(feeEstimates.low)} {tokenSymbol}</span>
                                    {feeSpeed === 'slow' && <CheckIcon size={16} />}
                                </div>
                            </button>
                            <button
                                className={`fee-popup-option ${feeSpeed === 'normal' ? 'active' : ''}`}
                                onClick={() => handleFeeSelect('normal')}
                            >
                                <div className="fee-popup-option-info">
                                    <span className="fee-popup-option-label">Normal</span>
                                    <span className="fee-popup-option-desc">Recommended</span>
                                </div>
                                <div className="fee-popup-option-value">
                                    <span>{formatAmount(feeEstimates.medium)} {tokenSymbol}</span>
                                    {feeSpeed === 'normal' && <CheckIcon size={16} />}
                                </div>
                            </button>
                            <button
                                className={`fee-popup-option ${feeSpeed === 'fast' ? 'active' : ''}`}
                                onClick={() => handleFeeSelect('fast')}
                            >
                                <div className="fee-popup-option-info">
                                    <span className="fee-popup-option-label">Fast</span>
                                    <span className="fee-popup-option-desc">Higher priority</span>
                                </div>
                                <div className="fee-popup-option-value">
                                    <span>{formatAmount(feeEstimates.high)} {tokenSymbol}</span>
                                    {feeSpeed === 'fast' && <CheckIcon size={16} />}
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

