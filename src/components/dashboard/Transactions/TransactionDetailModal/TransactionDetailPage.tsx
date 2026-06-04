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
    ChevronLeftIcon,
    SwapIcon
} from '../../../../components/shared/Icons';
import { formatAmount, formatHistoryAmount, truncateAddress } from '../../../../utils/crypto';
import { formatDate } from '../../../../utils/date';
import { Transaction } from '../../../../types';
import { NETWORK_REGISTRY } from '../../../../constants/networks/registry';
import { TokenIcon } from '../../../../components/shared/TokenIcon';
import './TransactionDetailModal.css';

interface TransactionDetailPageProps {
    tx: Transaction;
    network: string;
    onBack: () => void;
}

export function TransactionDetailPage({ tx, network, onBack }: TransactionDetailPageProps) {
    const [copiedAddress, setCopiedAddress] = useState(false);
    const [copiedHash, setCopiedHash] = useState(false);

    const isIncoming = tx.type === 'in' || tx.type === 'claim' || tx.type === 'unshield';

    const isPending = tx.status === 'pending';
    const isFailed = tx.status === 'failed' || tx.status === 'timeout';

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
        case 'swap':
            Icon = SwapIcon;
            iconClass = 'swap';
            title = isPending ? 'Swap Pending' : isFailed ? 'Swap Failed' : 'Swap Successful';
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
        : network === 'testnet'
            ? `https://testnet.octrascan.io/tx.html?hash=${tx.hash}`
            : `https://octrascan.io/tx.html?hash=${tx.hash}`;

    const addressExplorerUrl = isEvmAddress
        ? `${explorerBase}/address/${tx.address}`
        : network === 'testnet'
            ? `https://testnet.octrascan.io/address.html?addr=${tx.address}`
            : `https://octrascan.io/address.html?addr=${tx.address}`;

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

    // Resolve native token logo if logoUrl is not present and it's a native token, or an ERC20 token defined in registry
    const isNativeToken = !tx.contractAddress || tx.contractAddress === '0x0000000000000000000000000000000000000000' || tx.token === networkConfig?.nativeToken?.symbol;
    const erc20Token = networkConfig?.erc20Tokens?.find(t => t.symbol === tx.token || t.contractAddress?.toLowerCase() === tx.contractAddress?.toLowerCase());
    const resolvedLogoUrl = tx.logoUrl || (isNativeToken ? networkConfig?.nativeToken?.logoUrl : erc20Token?.logoUrl);

    // Format transaction amount cleanly and limit decimals
    const amountVal = typeof tx.amount === 'string' ? parseFloat(tx.amount) : (tx.amount || 0);
    const formattedAmount = formatHistoryAmount(amountVal);

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
                {tx.type === 'swap' && tx.fromTokenSymbol && tx.toTokenSymbol ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                        <div className="tx-hero-badge-container">
                            <TokenIcon
                                symbol={tx.fromTokenSymbol}
                                size={50}
                                chainId={tx.chainId ?? (tx.networkId === 'octra' ? undefined : (typeof tx.networkId === 'number' ? tx.networkId : undefined))}
                            />
                        </div>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '20px', fontWeight: 600 }}>→</span>
                        <div className="tx-hero-badge-container">
                            <TokenIcon
                                symbol={tx.toTokenSymbol}
                                size={50}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="tx-hero-badge-container">
                        <TokenIcon
                            symbol={tx.token || 'OCT'}
                            logoUrl={resolvedLogoUrl}
                            size={60}
                            contractAddress={tx.contractAddress}
                            chainId={tx.chainId ?? (tx.networkId === 'octra' ? undefined : (typeof tx.networkId === 'number' ? tx.networkId : undefined))}
                        />
                        <div className={`tx-action-overlay ${iconClass}`}>
                            <Icon size={12} />
                        </div>
                    </div>
                )}

                {tx.type === 'swap' && tx.fromTokenSymbol && tx.toTokenSymbol ? (
                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px', fontWeight: 700 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>-{formatHistoryAmount(Number(tx.fromAmount || tx.amount))} {tx.fromTokenSymbol}</span>
                            <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                            <span className="text-success">+{formatHistoryAmount(Number(tx.toAmount))} {tx.toTokenSymbol}</span>
                        </div>
                    </div>
                ) : (
                    <h1 className={`tx-large-amount ${iconClass}`} style={{ marginTop: '12px', marginBottom: '4px' }}>
                        {isIncoming ? '+' : '-'}{formattedAmount} {tx.token || 'OCT'}
                    </h1>
                )}

                <div className={`tx-status-badge ${tx.status === 'pending' ? 'pending' : 'confirmed'}`} style={{ marginTop: '12px' }}>
                    {tx.status === 'pending' ? 'Pending Confirmation' : 'Confirmed'}
                </div>
            </div>

            {/* Details List */}
            <div className="tx-details-list">
                <div className="tx-detail-row">
                    <span className="tx-detail-label">Status</span>
                    <span className={`tx-detail-value ${isPending ? 'text-warning' : isFailed ? 'text-danger' : 'text-success'}`}>{title}</span>
                </div>

                {tx.type === 'swap' && tx.fromTokenSymbol && (
                    <>
                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Asset Spent</span>
                            <span className="tx-detail-value">
                                {formatHistoryAmount(Number(tx.fromAmount || tx.amount))} {tx.fromTokenSymbol}
                            </span>
                        </div>
                        <div className="tx-detail-row">
                            <span className="tx-detail-label">Asset Received</span>
                            <span className="tx-detail-value text-success" style={{ fontWeight: 600 }}>
                                {formatHistoryAmount(Number(tx.toAmount))} {tx.toTokenSymbol}
                            </span>
                        </div>
                    </>
                )}

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

                {tx.token && tx.token !== feeSymbol && isEvmTx && (
                    <div className="tx-detail-row">
                        <span className="tx-detail-label">Token</span>
                        <span className="tx-detail-value">{tx.token}</span>
                    </div>
                )}

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
    );
}
