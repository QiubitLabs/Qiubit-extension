import { useState } from 'react';
import {
    SendIcon,
    ReceiveIcon,
    ContractIcon,
    BridgeIcon,
    EarnIcon,
    GasIcon,
    CopyIcon,
    GlobeIcon,
    ChevronLeftIcon,
    ArrowUpRightIcon,
    ArrowDownLeftIcon,
    CheckIcon,
    CloseIcon,
    ShieldIcon,
    UnshieldIcon,
    PrivateTransferIcon,
    ClaimIcon
} from '../../../../components/shared/Icons';
import { formatAmount, truncateAddress } from '../../../../utils/crypto';
import './TransactionDetailModal.css';

export function TransactionDetailModal({ tx, network, onClose }) {
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [copiedHash, setCopiedHash] = useState(false);
    if (!tx) return null;

    const isIncoming = tx.type === 'in' || tx.type === 'claim' || tx.type === 'unshield';

    let Icon = isIncoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
    let iconClass = isIncoming ? 'incoming' : 'outgoing';
    let title = 'Successful';

    switch (tx.type) {
        case 'shield':
            Icon = ShieldIcon;
            iconClass = 'shield';
            title = 'Shield Successful';
            break;
        case 'unshield':
            Icon = UnshieldIcon;
            iconClass = 'unshield';
            title = 'Unshield Successful';
            break;
        case 'private':
            Icon = PrivateTransferIcon;
            iconClass = 'private';
            title = 'Private Sent';
            break;
        case 'claim':
            Icon = ClaimIcon;
            iconClass = 'claim';
            title = 'Claimed';
            break;
    }

    const explorerUrl = `https://octrascan.io/transactions/${tx.hash}`;

    const handleCopyAddress = (text) => {
        navigator.clipboard.writeText(text);
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 2000);
    };

    const handleCopyHash = (text) => {
        navigator.clipboard.writeText(text);
        setCopiedHash(true);
        setTimeout(() => setCopiedHash(false), 2000);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ overflow: 'visible' }}>
                {/* Header */}
                <div className="modal-header">
                    <h2 className="modal-title">Transaction Details</h2>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                <div className="tx-modal-body" style={{ padding: '0 24px 24px', overflowY: 'auto' }}>
                    {/* Amount & Status */}
                    <div className="tx-status-hero">
                        <div className={`tx-large-icon ${iconClass}`}>
                            <Icon size={32} />
                        </div>
                        <h1 className={`tx-large-amount ${iconClass}`}>
                            {isIncoming ? '+' : '-'}{formatAmount(tx.amount)} OCT
                        </h1>
                        <div className={`tx-status-badge ${tx.status === 'pending' ? 'pending' : 'confirmed'}`}>
                            {tx.status === 'pending' ? 'Pending Confirmation' : 'Confirmed'}
                        </div>
                    </div>

                    {/* Details List */}
                    <div className="tx-details-list">
                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Status</span>
                            <span className="tx-detail-value text-success">{title}</span>
                        </div>

                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Date</span>
                            <span className="tx-detail-value">
                                {new Date(tx.timestamp).toLocaleString(undefined, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                })}
                            </span>
                        </div>

                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Address</span>
                            <div className="tx-detail-value-group">
                                <span className="tx-detail-value mono">{truncateAddress(tx.address, 6, 6)}</span>
                                <button className="tx-mini-copy" onClick={() => handleCopyAddress(tx.address)}>
                                    {copiedAddress ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                                </button>
                            </div>
                        </div>

                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Network Fee</span>
                            <span className="tx-detail-value">
                                {tx.ou ? formatAmount(parseInt(tx.ou) / 1000000) : formatAmount(tx.fee || 0)} OCT
                            </span>
                        </div>

                        {tx.epoch && (
                            <div className="tx-detail-row">
                                <span className="tx-detail-label">Epoch</span>
                                <span className="tx-detail-value">#{tx.epoch}</span>
                            </div>
                        )}

                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Network</span>
                            <span className="tx-detail-value">Octra {network === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
                        </div>
                    </div>

                    {/* Hash & Explorer */}
                    <div className="tx-hash-section">
                        <div className="tx-hash-header">
                            <span className="tx-hash-label">Transaction Hash</span>
                            <button className="tx-mini-copy" onClick={() => handleCopyHash(tx.hash)}>
                                {copiedHash ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                            </button>
                        </div>
                        <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tx-hash-value mono clickable"
                        >
                            {tx.hash}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
