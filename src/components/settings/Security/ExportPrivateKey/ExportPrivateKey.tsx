import { useState } from 'react';
import { ChevronLeftIcon, EyeIcon, EyeOffIcon, CheckIcon, CopyIcon, LockIcon, KeyIcon } from '../../../shared/Icons';
import { verifyPasswordSecure as verifyPassword } from '../../../../utils/storage';
import { Wallet } from '../../../../types';
import '../Security.css';

interface ExportPrivateKeyProps {
    wallet: Wallet;
    onBack: () => void;
}

export function ExportPrivateKey({ wallet, onBack }: ExportPrivateKeyProps) {
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
        } catch (err: any) {
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
        <div className="animate-fade-in">
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Export Private Key</span>
                </div>
            </header>

            <div className="wallet-content">
                {!isVerified ? (
                    <>
                        <div className="text-center mb-xl">
                            <div className="lock-icon-container" style={{ margin: '0 auto var(--space-lg)', display: 'flex', justifyContent: 'center' }}>
                                <div className="lock-icon-circle">
                                    <LockIcon size={28} />
                                </div>
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
                            {error && <p className="form-error text-error text-sm mt-sm">{error}</p>}
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
        </div>
    );
}
