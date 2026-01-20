/**
 * Wallet Selector Component - Professional & Minimalist
 * Dropdown for switching between multiple wallets
 */

import { useState } from 'react';
import './WalletSelector.css';
import {
    ChevronLeftIcon,
    ChevronDownIcon,
    PlusIcon,
    CheckIcon,
    CopyIcon,
    WalletIcon,
    EditIcon,
    CloseIcon,
    QuantumLogo
} from '../Icons';
import { truncateAddress, formatAmount } from '../../../utils/crypto';

export function WalletSelector({
    wallets,
    activeAddress,
    onSelect,
    onAddWallet,
    onEditWallet,
    onClose
}) {
    const [copied, setCopied] = useState(null);

    const handleCopy = async (address, index, e) => {
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onSelect) onSelect(index);
                                }}
                            >
                                <div className="wallet-avatar">
                                    <span className="wallet-avatar-number">
                                        <WalletIcon size={16} />
                                    </span>
                                    <div
                                        className="wallet-avatar-edit-overlay"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onEditWallet) onEditWallet(index);
                                        }}
                                    >
                                        <EditIcon size={12} />
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

export function WalletHeader({
    wallet,
    wallets = [],
    onOpenSelector
}) {
    // Custom truncation for header: Shortened to 5 chars start (0x...) + .. + 4 chars end
    const displayAddress = wallet.address
        ? `${wallet.address.slice(0, 5)}..${wallet.address.slice(-4)}`
        : '...';

    return (
        <button className="wallet-header-btn" onClick={onOpenSelector}>
            <div className="header-wallet-icon">
                <QuantumLogo size={20} />
            </div>
            <span className="header-wallet-name">
                {displayAddress}
            </span>
        </button>
    );
}

export default WalletSelector;
