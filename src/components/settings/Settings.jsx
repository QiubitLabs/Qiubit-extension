/**
 * Settings Screen Component
 * With password protection for sensitive operations
 */

import { useState } from 'react';
import './Settings.css';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    GlobeIcon,
    KeyIcon,
    LogoutIcon,
    ExportIcon,
    EyeIcon,
    EyeOffIcon,
    CopyIcon,
    CheckIcon,
    LockIcon,
    AlertIcon
} from '../shared/Icons';
import { truncateAddress } from '../../utils/crypto';
import {
    verifyPasswordSecure as verifyPassword,
    changePasswordSecure as changePassword,
    exportWalletSecure as exportWallet
} from '../../utils/storageSecure';
import { NetworkSwitcher } from './NetworkSwitcher/NetworkSwitcher';
import { keyringService } from '../../services/KeyringService';
import { calculatePasswordStrength } from '../../utils/validation';
import { ConfirmModal } from '../shared/ConfirmModal';

export function SettingsScreen({ wallet, settings, password, onUpdateSettings, onDisconnect, onLock, onBack, onPasswordChange }) {
    const [view, setView] = useState('main'); // 'main' | 'network' | 'export' | 'recovery-phrase' | 'change-password'
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [copied, setCopied] = useState('');
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);

    const handleCopy = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(label);
            setTimeout(() => setCopied(''), 2000);
        } catch {
            console.error('Failed to copy');
        }
    };

    const handleExportKeystore = () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const filename = `octra_wallet_${wallet.address.slice(-8)}_${timestamp}.json`;
        exportWallet(wallet, filename);
    };

    const handleDisconnect = () => {
        setShowDisconnectModal(true);
    };

    const handlePanicLock = () => {
        // Immediate action, no confirmation for panic
        keyringService.panicLock();
        if (onLock) onLock();
    };

    if (view === 'network') {
        return (
            <NetworkSwitcher
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                onBack={() => setView('main')}
                onSwitchComplete={(network) => {
                    // Network switched, parent will auto-refresh
                    console.log(`Switched to ${network}`);
                }}
            />
        );
    }

    if (view === 'rpc') {
        return (
            <NetworkSettings
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                onBack={() => setView('main')}
            />
        );
    }

    if (view === 'export') {
        return (
            <ExportSettings
                wallet={wallet}
                password={password}
                onBack={() => setView('main')}
            />
        );
    }

    if (view === 'change-password') {
        return (
            <ChangePasswordSettings
                onBack={() => setView('main')}
                onPasswordChange={onPasswordChange}
            />
        );
    }

    if (view === 'recovery-phrase') {
        return (
            <RecoveryPhraseSettings
                wallet={wallet}
                password={password}
                onBack={() => setView('main')}
            />
        );
    }



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
                                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <span className="text-xl font-bold" style={{ color: '#000' }}>
                                    {wallet.address.slice(3, 5).toUpperCase()}
                                </span>
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

                    <div className="settings-item" onClick={() => setView('network')}>
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

                    <div className="settings-item" onClick={() => setView('rpc')}>
                        <div className="flex items-center gap-md">
                            <GlobeIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">RPC Endpoint</div>
                                <div className="settings-item-value truncate" style={{ maxWidth: '200px' }}>
                                    {settings.rpcUrl || 'Default'}
                                </div>
                            </div>
                        </div>
                        <ChevronRightIcon size={18} className="text-tertiary" />
                    </div>

                </div>

                {/* Security */}
                <div className="settings-section">
                    <div className="settings-section-title">Security</div>

                    <div className="settings-item" onClick={() => setView('change-password')}>
                        <div className="flex items-center gap-md">
                            <LockIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Change Password</div>
                                <div className="settings-item-value">Update your wallet password</div>
                            </div>
                        </div>
                        <ChevronRightIcon size={18} className="text-tertiary" />
                    </div>

                    <div className="settings-item" onClick={() => setView('export')}>
                        <div className="flex items-center gap-md">
                            <KeyIcon size={20} />
                            <div className="settings-item-content">
                                <div className="settings-item-label">Export Private Key</div>
                                <div className="settings-item-value">Requires password</div>
                            </div>
                        </div>
                        <ChevronRightIcon size={18} className="text-tertiary" />
                    </div>



                    <div className="settings-item" onClick={handleExportKeystore}>
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

                        <div className="settings-item" onClick={() => setView('recovery-phrase')}>
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

                    <div className="settings-item settings-item-danger" onClick={handleDisconnect}>
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
                    <p className="text-xs text-tertiary">Octra Wallet v1.0.0</p>
                    <p className="text-xs text-tertiary mt-xs">{settings.network === 'mainnet' ? 'Mainnet' : 'Testnet'} - Client-side only</p>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDisconnectModal}
                title="Disconnect Wallet?"
                message={`Are you sure you want to remove this wallet from this device?\n\nIMPORTANT: Make sure you have backed up your recovery phrase or private key. You will lose access to this wallet if you haven't saved them.`}
                confirmText="Disconnect"
                cancelText="Cancel"
                isDanger={true}
                onConfirm={() => {
                    setShowDisconnectModal(false);
                    onDisconnect();
                }}
                onCancel={() => setShowDisconnectModal(false)}
            />
        </>
    );
}

function NetworkSettings({ settings, onUpdateSettings, onBack }) {
    const [rpcUrl, setRpcUrl] = useState(settings.rpcUrl || '');
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const presets = settings.network === 'mainnet' ? [
        { name: 'Octra Mainnet', url: import.meta.env.VITE_RPC_URL || 'https://octra.network' },
        { name: 'Local Node', url: 'http://localhost:8080' },
    ] : [
        { name: 'Octra Testnet', url: import.meta.env.VITE_TESTNET_RPC_URL || '' },
        { name: 'Local Node', url: 'http://localhost:8080' },
    ];

    const handleTest = async () => {
        if (!rpcUrl) return;

        setIsTesting(true);
        setTestResult(null);

        try {
            // ALWAYS use proxy to avoid CORS
            const isDev = import.meta.env.DEV;
            let testUrl;
            const mainnetUrl = import.meta.env.VITE_RPC_URL || 'https://octra.network';
            if (rpcUrl === mainnetUrl || rpcUrl.startsWith(mainnetUrl)) {
                // Use proxy for octra.network
                testUrl = isDev ? '/api' : '/api/rpc';
            } else if (rpcUrl.startsWith('http://localhost') || rpcUrl.startsWith('http://127.0.0.1')) {
                // Local RPC can be accessed directly
                testUrl = rpcUrl;
            } else {
                // Other custom RPC, use direct URL
                testUrl = rpcUrl;
            }

            const response = await fetch(`${testUrl}/staging`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (response.ok) {
                setTestResult({ success: true, message: 'Connection successful!' });
            } else {
                setTestResult({ success: false, message: `HTTP ${response.status}` });
            }
        } catch (error) {
            setTestResult({ success: false, message: `Connection failed: ${error.message}` });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = () => {
        onUpdateSettings({ rpcUrl });
        onBack();
    };

    return (
        <>
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">
                        RPC Endpoint ({settings.network === 'mainnet' ? 'Mainnet' : 'Testnet'})
                    </span>
                </div>
            </header>

            <div className="wallet-content animate-fade-in">
                <div className="form-group">
                    <label className="form-label">RPC Endpoint URL</label>
                    <input
                        type="text"
                        className="input input-mono"
                        value={rpcUrl}
                        onChange={(e) => setRpcUrl(e.target.value)}
                        placeholder="https://..."
                    />
                </div>

                <div className="flex gap-md mb-xl">
                    <button
                        className="btn btn-secondary flex-1"
                        onClick={handleTest}
                        disabled={!rpcUrl || isTesting}
                    >
                        {isTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                </div>

                {testResult && (
                    <div className={`card mb-xl ${testResult.success ? 'text-success' : 'text-error'}`}>
                        {testResult.message}
                    </div>
                )}

                <div className="settings-section">
                    <div className="settings-section-title">Presets</div>
                    {presets.map((preset, index) => (
                        <div
                            key={index}
                            className="settings-item"
                            onClick={() => setRpcUrl(preset.url)}
                        >
                            <div className="settings-item-content">
                                <div className="settings-item-label">{preset.name}</div>
                                <div className="settings-item-value text-mono text-xs">{preset.url}</div>
                            </div>
                            {rpcUrl === preset.url && <CheckIcon size={18} className="text-success" />}
                        </div>
                    ))}
                </div>

                <button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={handleSave}
                >
                    Save Changes
                </button>
            </div>
        </>
    );
}

function ExportSettings({ wallet, password, onBack }) {
    const [showKey, setShowKey] = useState(false);
    const [showInputPassword, setShowInputPassword] = useState(false);
    const [copied, setCopied] = useState(false);
    const [inputPassword, setInputPassword] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    const handleVerifyPassword = async () => {
        if (!inputPassword.trim()) {
            setError('Please enter your password');
            return;
        }

        setIsVerifying(true);
        setError('');

        try {
            const isValid = await verifyPassword(inputPassword);
            if (isValid) {
                setIsVerified(true);
            } else {
                setError('Incorrect password');
            }
        } catch (err) {
            setError('Verification failed');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(wallet.privateKeyB64);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.error('Failed to copy');
        }
    };

    return (
        <>
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Export Private Key</span>
                </div>
            </header>

            <div className="wallet-content animate-fade-in">
                {!isVerified ? (
                    <>
                        <div className="text-center mb-xl">
                            <div className="lock-icon-container" style={{ margin: '0 auto var(--space-lg)' }}>
                                <LockIcon size={28} />
                            </div>
                            <h3 className="text-lg font-semibold mb-sm">Verify Password</h3>
                            <p className="text-secondary text-sm">
                                Enter your wallet password to view your private key
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <div className="input-with-icon">
                                <input
                                    type={showInputPassword ? 'text' : 'password'}
                                    className={`input input-lg ${error ? 'input-error' : ''}`}
                                    value={inputPassword}
                                    onChange={(e) => {
                                        setInputPassword(e.target.value);
                                        setError('');
                                    }}
                                    placeholder="Enter your password"
                                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                                />
                                <button
                                    type="button"
                                    className="input-icon-btn"
                                    onClick={() => setShowInputPassword(!showInputPassword)}
                                    tabIndex={-1}
                                >
                                    {showInputPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                            {error && <p className="form-error">{error}</p>}
                        </div>

                        <button
                            className="btn btn-primary btn-lg btn-full"
                            onClick={handleVerifyPassword}
                            disabled={isVerifying || !inputPassword.trim()}
                        >
                            {isVerifying ? <span className="loading-spinner" /> : 'Verify'}
                        </button>
                    </>
                ) : (
                    <>
                        {/* Animated Icon */}
                        <div className="security-icon-container">
                            <div className="security-icon-pulse">
                                <KeyIcon size={32} />
                            </div>
                        </div>

                        {/* Security Warning - Professional */}
                        <div className="security-notice">
                            <p>Never share your private key. Anyone with this key has full control of your wallet.</p>
                        </div>

                        {/* Private Key Display */}
                        <div
                            className="secret-display"
                            style={{
                                filter: showKey ? 'none' : 'blur(6px)',
                                userSelect: showKey ? 'all' : 'none'
                            }}
                        >
                            <p className="text-mono text-sm">{wallet.privateKeyB64}</p>
                        </div>

                        {/* Action row - Show (20%) + Copy (80%) */}
                        <div className="secret-actions">
                            <button
                                className="secret-btn secret-btn-toggle"
                                onClick={() => setShowKey(!showKey)}
                            >
                                {showKey ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                            </button>
                            <button
                                className={`secret-btn secret-btn-copy ${copied ? 'copied' : ''}`}
                                onClick={handleCopy}
                            >
                                {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
                                <span>{copied ? 'Copied!' : 'Copy Private Key'}</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

function ChangePasswordSettings({ onBack, onPasswordChange }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const passwordStrength = calculatePasswordStrength(newPassword);

    const handleSubmit = async () => {
        if (!currentPassword.trim()) {
            setError('Please enter your current password');
            return;
        }
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await changePassword(currentPassword, newPassword);
            if (onPasswordChange) {
                await onPasswordChange(newPassword);
            }
            setSuccess(true);
        } catch (err) {
            setError(err.message || 'Failed to change password');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <>
                <header className="wallet-header">
                    <div className="flex items-center gap-md">
                        <button className="header-icon-btn" onClick={onBack}>
                            <ChevronLeftIcon size={20} />
                        </button>
                        <span className="text-lg font-semibold">Change Password</span>
                    </div>
                </header>

                <div className="wallet-content animate-fade-in">
                    <div className="text-center py-3xl">
                        <div className="success-checkmark mb-xl" style={{ margin: '0 auto var(--space-xl)' }}>
                            <CheckIcon size={32} />
                        </div>
                        <p className="text-xl font-bold mb-sm">Password Changed!</p>
                        <p className="text-secondary text-sm mb-xl">
                            Your wallet password has been updated successfully.
                        </p>
                        <button className="btn btn-primary btn-lg" onClick={onBack}>
                            Done
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Change Password</span>
                </div>
            </header>

            <div className="wallet-content animate-fade-in">
                <div className="form-group">
                    <label className="form-label">Current Password</label>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        className="input input-lg"
                        value={currentPassword}
                        onChange={(e) => {
                            setCurrentPassword(e.target.value);
                            setError('');
                        }}
                        placeholder="Enter current password"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">New Password</label>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        className="input input-lg"
                        value={newPassword}
                        onChange={(e) => {
                            setNewPassword(e.target.value);
                            setError('');
                        }}
                        placeholder="Enter new password (min 8 chars)"
                    />
                    {newPassword && (
                        <div className="password-strength">
                            <div className="password-strength-bar">
                                <div
                                    className={`password-strength-fill strength-${passwordStrength.level}`}
                                    style={{ width: `${passwordStrength.percent}%` }}
                                />
                            </div>
                            <span className={`password-strength-text strength-${passwordStrength.level}`}>
                                {passwordStrength.label}
                            </span>
                        </div>
                    )}
                </div>

                <div className="form-group">
                    <label className="form-label">Confirm New Password</label>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        className={`input input-lg ${confirmPassword && newPassword !== confirmPassword ? 'input-error' : ''}`}
                        value={confirmPassword}
                        onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setError('');
                        }}
                        placeholder="Confirm new password"
                    />
                    {confirmPassword && newPassword !== confirmPassword && (
                        <p className="form-error">Passwords do not match</p>
                    )}
                </div>

                <div className="flex items-center gap-md mb-xl">
                    <button
                        className="btn btn-ghost btn-sm gap-sm"
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        {showPassword ? 'Hide passwords' : 'Show passwords'}
                    </button>
                </div>

                {error && <p className="text-error text-sm mb-lg">{error}</p>}

                <button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={handleSubmit}
                    disabled={isLoading || !currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
                >
                    {isLoading ? <span className="loading-spinner" /> : 'Change Password'}
                </button>
            </div>
        </>
    );
}

function RecoveryPhraseSettings({ wallet, onBack }) {
    const [showPhrase, setShowPhrase] = useState(false);
    const [showInputPassword, setShowInputPassword] = useState(false);
    const [copied, setCopied] = useState(false);
    const [inputPassword, setInputPassword] = useState('');
    const [isVerified, setIsVerified] = useState(false);
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    const handleVerifyPassword = async () => {
        if (!inputPassword.trim()) {
            setError('Please enter your password');
            return;
        }

        setIsVerifying(true);
        setError('');

        try {
            const isValid = await verifyPassword(inputPassword);
            if (isValid) {
                setIsVerified(true);
            } else {
                setError('Incorrect password');
            }
        } catch (err) {
            setError('Verification failed');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(wallet.mnemonic.join(' '));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            console.error('Failed to copy');
        }
    };

    return (
        <>
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Recovery Phrase</span>
                </div>
            </header>

            <div className="wallet-content animate-fade-in">
                {!isVerified ? (
                    <>
                        <div className="text-center mb-xl">
                            <div className="lock-icon-container" style={{ margin: '0 auto var(--space-lg)' }}>
                                <LockIcon size={28} />
                            </div>
                            <h3 className="text-lg font-semibold mb-sm">Verify Password</h3>
                            <p className="text-secondary text-sm">
                                Enter your wallet password to view your recovery phrase
                            </p>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Password</label>
                            <div className="input-with-icon">
                                <input
                                    type={showInputPassword ? 'text' : 'password'}
                                    className={`input input-lg ${error ? 'input-error' : ''}`}
                                    value={inputPassword}
                                    onChange={(e) => {
                                        setInputPassword(e.target.value);
                                        setError('');
                                    }}
                                    placeholder="Enter your password"
                                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyPassword()}
                                />
                                <button
                                    type="button"
                                    className="input-icon-btn"
                                    onClick={() => setShowInputPassword(!showInputPassword)}
                                    tabIndex={-1}
                                >
                                    {showInputPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                            {error && <p className="form-error">{error}</p>}
                        </div>

                        <button
                            className="btn btn-primary btn-lg btn-full"
                            onClick={handleVerifyPassword}
                            disabled={isVerifying || !inputPassword.trim()}
                        >
                            {isVerifying ? <span className="loading-spinner" /> : 'Verify'}
                        </button>
                    </>
                ) : (
                    <>
                        {/* Animated Icon */}
                        <div className="security-icon-container">
                            <div className="security-icon-pulse">
                                <KeyIcon size={32} />
                            </div>
                        </div>

                        {/* Security Warning - Professional */}
                        <div className="security-notice">
                            <p>Never share your recovery phrase. Anyone with this phrase can access your wallet.</p>
                        </div>

                        {/* Mnemonic grid */}
                        <div
                            className="mnemonic-grid"
                            style={{
                                filter: showPhrase ? 'none' : 'blur(6px)',
                                userSelect: showPhrase ? 'text' : 'none'
                            }}
                        >
                            {wallet.mnemonic.map((word, index) => (
                                <div key={index} className="mnemonic-word">
                                    <span className="mnemonic-word-num">{index + 1}</span>
                                    <span className="mnemonic-word-text">{word}</span>
                                </div>
                            ))}
                        </div>

                        {/* Action row - Show (20%) + Copy (80%) */}
                        <div className="secret-actions">
                            <button
                                className="secret-btn secret-btn-toggle"
                                onClick={() => setShowPhrase(!showPhrase)}
                            >
                                {showPhrase ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                            </button>
                            <button
                                className={`secret-btn secret-btn-copy ${copied ? 'copied' : ''}`}
                                onClick={handleCopy}
                            >
                                {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
                                <span>{copied ? 'Copied!' : 'Copy Recovery Phrase'}</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}



export default SettingsScreen;
