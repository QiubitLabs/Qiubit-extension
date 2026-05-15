import React, { useState } from 'react';
import {
    PlusIcon,
    CheckIcon,
    CopyIcon,
    WalletIcon,
    EditIcon,
    QiubitLogo
} from '../Icons';
import { formatAmount } from '../../../utils/crypto';
import { Wallet } from '../../../types';
import './WalletSelector.css';
import './NetworkSwitcher.css';

interface WalletSelectorProps {
    wallets: any[];
    activeAddress: string;
    onSelect: (index: number) => void;
    onAddWallet: () => void;
    onEditWallet?: (index: number) => void;
    onClose?: () => void;
}

export function WalletSelector({
    wallets,
    activeAddress,
    onSelect,
    onAddWallet,
    onEditWallet
}: WalletSelectorProps) {
    const [copied, setCopied] = useState<number | null>(null);

    const handleCopy = async (address: string, index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(address);
            setCopied(index);
            setTimeout(() => setCopied(null), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="wallet-selector-content">
            {/* Wallet List */}
            <div className="wallet-list-container">
                {wallets.map((wallet, index) => {
                    const isActive = wallet.address === activeAddress;
                    return (
                        <div
                            key={wallet.id || index}
                            className={`wallet-card ${isActive ? 'active' : ''}`}
                            onClick={() => onSelect(index)}
                        >
                            <div
                                className="wallet-avatar-container"
                            >
                                <div className="wallet-avatar">
                                    <span className="wallet-avatar-number">
                                        <WalletIcon size={16} />
                                    </span>
                                    <div
                                        className="wallet-avatar-edit-overlay"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            e.nativeEvent.stopImmediatePropagation();
                                            if (onEditWallet) onEditWallet(index);
                                        }}
                                        title="Rename Wallet"
                                    >
                                        <EditIcon size={14} />
                                    </div>
                                </div>
                            </div>

                            <div className="wallet-info">
                                <div className="wallet-name-row">
                                    <span className="wallet-name">
                                        {wallet.name || `Wallet ${index + 1}`}
                                    </span>
                                    {isActive && <div className="wallet-check-indicator"><CheckIcon size={14} /></div>}
                                </div>
                                <div className="wallet-balance">
                                    {wallet.balance !== undefined ? formatAmount(wallet.balance) : '0.000'} OCT
                                </div>
                            </div>

                            <div className="wallet-actions">
                                <button
                                    className="wallet-action-btn"
                                    onClick={(e) => handleCopy(wallet.address, index, e)}
                                >
                                    {copied === index ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Simple Add Wallet Button */}
            <button
                className="wallet-add-btn-minimal"
                onClick={onAddWallet}
            >
                <div className="add-icon-circle">
                    <PlusIcon size={14} />
                </div>
                <span>Add Wallet</span>
            </button>
        </div>
    );
}

interface WalletHeaderProps {
    wallet: Wallet;
    wallets?: Wallet[];
    onOpenSelector: () => void;
    onOpenAccount: () => void;
}

export function WalletHeader({ wallet, onOpenSelector, onOpenAccount }: WalletHeaderProps) {
    const displayAddress = wallet.address
        ? `${wallet.address.slice(0, 5)}..${wallet.address.slice(-4)}`
        : '...';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Logo → opens Account modal */}
            <button
                className="wallet-header-btn"
                style={{ padding: '6px 8px', gap: 0 }}
                onClick={onOpenAccount}
                title="Account"
            >
                <div className="header-wallet-icon">
                    <QiubitLogo size={20} />
                </div>
            </button>

            {/* Address pill → opens wallet switcher dropdown */}
            <button
                className="wallet-header-btn"
                style={{ padding: '5px 10px', gap: 6 }}
                onClick={onOpenSelector}
                title="Switch wallet"
            >
                <span className="header-wallet-name">{displayAddress}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5, flexShrink: 0 }}>
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>
        </div>
    );
}

export default WalletSelector;
