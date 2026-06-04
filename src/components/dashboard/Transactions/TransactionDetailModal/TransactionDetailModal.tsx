import { useState } from 'react';
import {
    CopyIcon,
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
import { formatDate } from '../../../../utils/date';
import { Transaction } from '../../../../types';
import { NETWORK_REGISTRY } from '../../../../constants/networks/registry';
import './TransactionDetailModal.css';

// Re-defining Transaction locally if import fails or to allow standalone usage
type TransactionDetail = Transaction;

interface TransactionDetailModalProps {
    tx: TransactionDetail | null;
    network: 'mainnet' | 'testnet';
    onClose: () => void;
}

export function TransactionDetailModal({ tx, network, onClose }: TransactionDetailModalProps) {
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [copiedHash, setCopiedHash] = useState(false);
    if (!tx) return null;

    const isPending = tx.status === 'pending';
    const isFailed = tx.status === 'failed' || tx.status === 'timeout';
    const isIncoming = tx.type === 'in' || tx.type === 'claim' || tx.type === 'unshield';

    let Icon = isIncoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
    let iconClass = isIncoming ? 'incoming' : 'outgoing';
    
    let title = isPending ? 'Pending' : isFailed ? 'Failed' : 'Successful';

    switch (tx.type) {
        case 'shield':
            Icon = ShieldIcon;
            iconClass = 'shield';
            title = isPending ? 'Shield Pending' : isFailed ? 'Shield Failed' : 'Shield Successful';
            break;
        case 'unshield':
            Icon = UnshieldIcon;
            iconClass = 'unshield';
            title = isPending ? 'Unshield Pending' : isFailed ? 'Unshield Failed' : 'Unshield Successful';
            break;
        case 'private':
            Icon = PrivateTransferIcon;
            iconClass = 'private';
            title = isPending ? 'Private Transfer Pending' : isFailed ? 'Private Transfer Failed' : 'Private Sent';
            break;
        case 'claim':
            Icon = ClaimIcon;
            iconClass = 'claim';
            title = isPending ? 'Claim Pending' : isFailed ? 'Claim Failed' : 'Claimed';
            break;
    }

    const networkConfig = tx.networkId ? NETWORK_REGISTRY[tx.networkId] : null;
    const isEvmTx = networkConfig 
        ? networkConfig.isEVM 
        : ((tx.address?.startsWith('0x') ?? false) && (tx.hash?.startsWith('0x') ?? false));
    const isEvmAddress = tx.address?.startsWith('0x') ?? false;

    const explorerBase = networkConfig?.blockExplorerUrl ?? 'https://etherscan.io';
    const networkName = networkConfig?.displayName ?? (isEvmTx ? 'Ethereum Mainnet' : `Octra ${network === 'testnet' ? 'Testnet' : 'Mainnet'}`);
    const feeSymbol = networkConfig?.nativeToken?.symbol ?? (isEvmTx ? 'ETH' : 'OCT');

    const explorerUrl = isEvmTx
        ? `${explorerBase}/tx/${tx.hash}`
        : network === 'mainnet'
            ? `https://octrascan.io/tx.html?hash=${tx.hash}`
            : `https://testnet.octrascan.io/tx.html?hash=${tx.hash}`;

    const addressExplorerUrl = isEvmAddress
        ? `${explorerBase}/address/${tx.address}`
        : network === 'mainnet'
            ? `https://octrascan.io/address.html?addr=${tx.address}`
            : `https://testnet.octrascan.io/address.html?addr=${tx.address}`;

    const handleCopyAddress = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 2000);
    };

    const handleCopyHash = (text: string) => {
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
                            {isIncoming ? '+' : '-'}{formatAmount(tx.amount)} {tx.token || 'OCT'}
                        </h1>
                        <div className={`tx-status-badge ${tx.status === 'pending' ? 'pending' : 'confirmed'}`}>
                            {tx.status === 'pending' ? 'Pending Confirmation' : 'Confirmed'}
                        </div>
                    </div>

                    {/* Details List */}
                    <div className="tx-details-list">
                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Status</span>
                            <span className={`tx-detail-value ${isPending ? 'text-warning' : isFailed ? 'text-danger' : 'text-success'}`}>{title}</span>
                        </div>

                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Date</span>
                            <span className="tx-detail-value">
                            <span className="tx-detail-value">
                                {formatDate(tx.timestamp, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short'
                                })}
                            </span>
                            </span>
                        </div>

                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Address</span>
                            <div className="tx-detail-value-group">
                                <a 
                                    href={addressExplorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="tx-detail-value mono clickable hover-underline"
                                    style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                    {truncateAddress(tx.address, 6, 6)}
                                </a>
                                <button className="tx-mini-copy" onClick={() => handleCopyAddress(tx.address)}>
                                    {copiedAddress ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                                </button>
                            </div>
                        </div>

                        <div className="tx-detail-row">
                            <span className="tx-detail-label">{isEvmTx ? 'Gas Fee' : 'Network Fee'}</span>
                            <span className="tx-detail-value">
                                {isEvmTx
                                    ? `${tx.fee || 0} ${feeSymbol}`
                                    : `${tx.ou ? formatAmount(parseInt(tx.ou.toString()) / 1000000) : formatAmount(tx.fee || 0)} OCT`
                                }
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
                            <span className="tx-detail-value">{networkName}</span>
                        </div>
                    </div>

                    {/* Hash & Explorer */}
                    <div className="tx-hash-section">
                        <div className="tx-hash-header">
                            <span className="tx-hash-label">Transaction Hash</span>
                            <button className="tx-mini-copy" onClick={() => handleCopyHash(tx.hash || '')}>
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
