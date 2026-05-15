import { useState } from 'react';
import {
    CopyIcon,
    ArrowUpRightIcon,
    ArrowDownLeftIcon,
    CheckIcon,
    ShieldIcon,
    UnshieldIcon,
    PrivateTransferIcon,
    ClaimIcon,
    ChevronLeftIcon
} from '../../../../components/shared/Icons';
import { formatAmount, truncateAddress } from '../../../../utils/crypto';
import { formatDate } from '../../../../utils/date';
import { Transaction } from '../../../../types';
import './TransactionDetailModal.css';

interface TransactionDetailPageProps {
    tx: Transaction;
    network: 'mainnet' | 'testnet';
    onBack: () => void;
}

export function TransactionDetailPage({ tx, network, onBack }: TransactionDetailPageProps) {
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [copiedHash, setCopiedHash] = useState(false);

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

    const isEvmTx = tx.hash?.startsWith('0x') ?? false;
    const isEvmAddress = tx.address?.startsWith('0x') ?? false;

    const explorerUrl = isEvmTx
        ? `https://etherscan.io/tx/${tx.hash}`
        : network === 'mainnet'
            ? `https://octrascan.io/tx.html?hash=${tx.hash}`
            : `https://testnet.octrascan.io/tx.html?hash=${tx.hash}`;

    const addressExplorerUrl = isEvmAddress
        ? `https://etherscan.io/address/${tx.address}`
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
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-md mb-xl">
                <button className="header-icon-btn" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <h2 className="text-lg font-semibold">Transaction Details</h2>
            </div>

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
                    <span className="tx-detail-value text-success">{title}</span>
                </div>

                <div className="tx-detail-row">
                    <span className="tx-detail-label">Date</span>
                    <span className="tx-detail-value">
                        {formatDate(tx.timestamp, {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                        })}
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
                    <span className="tx-detail-label">Network Fee</span>
                    <span className="tx-detail-value">
                        {isEvmTx
                            ? `${tx.fee || 0} ETH`
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
                    <span className="tx-detail-value">
                        {isEvmTx ? 'Ethereum Mainnet' : `Octra ${network === 'mainnet' ? 'Mainnet' : 'Testnet'}`}
                    </span>
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
    );
}
