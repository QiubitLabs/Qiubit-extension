import { ChevronLeftIcon, ChevronRightIcon, GlobeIcon, KeyIcon, LogoutIcon, ExportIcon, LockIcon, AlertIcon, CheckIcon, CopyIcon } from '../../shared/Icons';
import { truncateAddress } from '../../../utils/crypto';
import { keyringService } from '../../../services/core/KeyringService';
import { Wallet, Settings } from '../../../types';
import { useState } from 'react';
import './SettingsMenu.css';

interface SettingsMenuProps {
    wallet: Wallet;
    settings: Settings;
    onViewChange: (view: string) => void;
    onBack: () => void;
    onExportKeystore: () => void;
    onDisconnect: () => void;
    onLock?: () => void;
}

export function SettingsMenu({ wallet, settings, onViewChange, onBack, onExportKeystore, onDisconnect, onLock }: SettingsMenuProps) {
    const [copied, setCopied] = useState('');

    const handleCopy = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(label);
            setTimeout(() => setCopied(''), 2000);
        } catch {
            console.error('Failed to copy');
        }
    };

    const handlePanicLock = () => {
        // Immediate action, no confirmation for panic
        keyringService.panicLock();
        if (onLock) onLock();
    };

    return (
        <>
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Settings</span>
                </div>
            </header>

            <div className="wallet-content animate-fade-in" style={{ paddingBottom: 0 }}>
                {/* Wallet Info */}
                <div className="settings-section">
                    <div className="settings-section-title">Wallet</div>

                    <div className="card mb-md">
                        <div className="flex items-center gap-lg">
                            <div style={{
                                width: 48,
                                height: 48,
                                borderRadius: 'var(--radius-md)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <img src="/icon.svg" alt="Wallet Icon" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold mb-xs">{wallet.name || 'Octra Wallet'}</p>
                                <p className="text-mono text-sm text-secondary">{truncateAddress(wallet.address, 10, 8)}</p>
                            </div>
                            <button
                                className="header-icon-btn"
                                onClick={() => handleCopy(wallet.address, 'address')}
                            >
                                {copied === 'address' ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Network */}
                <div className="settings-section">
                    <div className="settings-section-title">Common</div>

                    <div className="settings-item" onClick={() => onViewChange('network')}>
                        <div className="flex items-center gap-md">
                            <GlobeIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Network</div>
                                <div className="settings-item-value">
                                    {settings.network === 'mainnet' ? 'Mainnet' : 'Testnet'}
                                </div>
                            </div>
                        </div>
                        <ChevronRightIcon size={18} className="text-tertiary" />
                    </div>



                </div>

                {/* Security */}
                <div className="settings-section">
                    <div className="settings-section-title">Security</div>

                    <div className="settings-item" onClick={() => onViewChange('change-password')}>
                        <div className="flex items-center gap-md">
                            <LockIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Change Password</div>
                                <div className="settings-item-value">Update your wallet password</div>
                            </div>
                        </div>
                        <ChevronRightIcon size={18} className="text-tertiary" />
                    </div>

                    <div className="settings-item" onClick={() => onViewChange('export')}>
                        <div className="flex items-center gap-md">
                            <KeyIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Export Private Key</div>
                                <div className="settings-item-value">Requires password</div>
                            </div>
                        </div>
                        <ChevronRightIcon size={18} className="text-tertiary" />
                    </div>

                    <div className="settings-item" onClick={onExportKeystore}>
                        <div className="flex items-center gap-md">
                            <ExportIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Export Keystore</div>
                                <div className="settings-item-value">Download wallet JSON file</div>
                            </div>
                        </div>
                        <ChevronRightIcon size={18} className="text-tertiary" />
                    </div>
                </div>

                {/* Recovery Phrase */}
                {wallet.mnemonic && (
                    <div className="settings-section">
                        <div className="settings-section-title">Recovery Phrase</div>

                        <div className="settings-item" onClick={() => onViewChange('recovery-phrase')}>
                            <div className="flex items-center gap-md">
                                <KeyIcon size={20} />
                                <div className="settings-item-content">
                                    <div className="settings-item-label">12-word phrase</div>
                                    <div className="settings-item-value">Requires password</div>
                                </div>
                            </div>
                            <ChevronRightIcon size={18} className="text-tertiary" />
                        </div>
                    </div>
                )}

                {/* Emergency Zone */}
                <div className="settings-section">
                    <div className="settings-section-title text-error">Emergency</div>

                    <div className="settings-item settings-item-danger" onClick={handlePanicLock}>
                        <div className="flex items-center gap-md">
                            <AlertIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Panic Lock</div>
                                <div className="settings-item-value">Immediately lock and wipe memory</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="settings-section">
                    <div className="settings-section-title">Danger Zone</div>

                    <div className="settings-item settings-item-danger" onClick={onDisconnect}>
                        <div className="flex items-center gap-md">
                            <LogoutIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Disconnect Wallet</div>
                                <div className="settings-item-value">Remove wallet from this device</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-center py-xl">
                    <p className="text-xs text-tertiary">Octra Wallet v1.1.1</p>
                    <p className="text-xs text-tertiary mt-xs">{settings.network === 'mainnet' ? 'Mainnet' : 'Testnet'} - Client-side only</p>
                </div>
            </div>
        </>
    );
}
