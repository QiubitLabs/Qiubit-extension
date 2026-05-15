import { useState, useRef, useEffect } from 'react';
import { Wallet } from '../../../../types';
import { EditIcon, KeyIcon, EyeIcon, EyeOffIcon, CopyIcon, CheckIcon } from '../../../shared/Icons';
import { verifyPasswordSecure } from '../../../../utils/storage';
import './AccountModal.css';

interface AccountModalProps {
    wallet: Wallet;
    activeWalletIndex: number;
    onClose: () => void;
    onRename: (index: number, currentName: string) => void;
}

type Screen = 'menu' | 'export-pw' | 'export-key';
type Network = 'octra' | 'evm';

function getPrivateKey(wallet: Wallet, network: Network): string {
    if (network === 'octra') {
        return wallet.privateKeyB64;
    }
    // EVM: same 32-byte seed in hex with 0x prefix
    const hex = wallet.privateKeyHex.startsWith('0x')
        ? wallet.privateKeyHex
        : '0x' + wallet.privateKeyHex;
    return hex;
}

function hasEvmKey(wallet: Wallet): boolean {
    return !!(wallet.privateKeyHex && wallet.evmAddress);
}

export function AccountModal({ wallet, activeWalletIndex, onClose, onRename }: AccountModalProps) {
    const [screen, setScreen] = useState<Screen>('menu');
    const [network, setNetwork] = useState<Network>('octra');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [pwError, setPwError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    // Close on overlay click
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
    };

    // Reset when closing
    useEffect(() => {
        return () => {
            setPassword('');
            setRevealed(false);
        };
    }, []);

    const handleVerifyPassword = async () => {
        if (!password.trim()) { setPwError('Enter your password'); return; }
        setIsVerifying(true);
        setPwError('');
        try {
            const ok = await verifyPasswordSecure(password);
            if (ok) {
                setScreen('export-key');
                setRevealed(false);
            } else {
                setPwError('Incorrect password');
            }
        } catch {
            setPwError('Verification failed');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(getPrivateKey(wallet, network));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };

    const displayAddress = wallet.address
        ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-6)}`
        : '';

    return (
        <div className="account-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="account-sheet" onClick={e => e.stopPropagation()}>
                <div className="account-handle" />

                {/* Wallet identity header — always visible */}
                <div className="account-header">
                    <div className="account-avatar">
                        <img src="/iconsub.svg" alt="Wallet" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div className="account-meta">
                        <div className="account-name">
                            {wallet.name || `Wallet ${activeWalletIndex + 1}`}
                        </div>
                        <div className="account-address">{displayAddress}</div>
                    </div>
                </div>

                {/* ── SCREEN: Menu ── */}
                {screen === 'menu' && (
                    <div className="account-menu">
                        <button
                            className="account-menu-item"
                            onClick={() => { onClose(); onRename(activeWalletIndex, wallet.name || ''); }}
                        >
                            <div className="account-menu-icon"><EditIcon size={16} /></div>
                            <div>
                                <div className="account-menu-label">Edit Name</div>
                                <div className="account-menu-desc">Change wallet display name</div>
                            </div>
                        </button>

                        <button
                            className="account-menu-item danger"
                            onClick={() => setScreen('export-pw')}
                        >
                            <div className="account-menu-icon"><KeyIcon size={16} /></div>
                            <div>
                                <div className="account-menu-label">Export Private Key</div>
                                <div className="account-menu-desc">Requires password verification</div>
                            </div>
                        </button>
                    </div>
                )}

                {/* ── SCREEN: Password ── */}
                {screen === 'export-pw' && (
                    <div className="account-export-body">
                        <button className="account-export-back" onClick={() => { setScreen('menu'); setPwError(''); setPassword(''); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                            Back
                        </button>

                        {/* Network selector */}
                        <div className="account-network-tabs">
                            <button
                                className={`account-network-tab ${network === 'octra' ? 'active' : ''}`}
                                onClick={() => setNetwork('octra')}
                            >
                                Octra (OCT)
                            </button>
                            {hasEvmKey(wallet) && (
                                <button
                                    className={`account-network-tab ${network === 'evm' ? 'active' : ''}`}
                                    onClick={() => setNetwork('evm')}
                                >
                                    Ethereum (EVM)
                                </button>
                            )}
                        </div>

                        <div className="account-warning">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                                <path d="M12 9v4M12 17h.01" />
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            </svg>
                            Never share your private key. Anyone with this key has full control of your wallet.
                        </div>

                        <div style={{ position: 'relative', marginBottom: 12 }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className={`input input-lg${pwError ? ' input-error' : ''}`}
                                style={{ width: '100%', paddingRight: 44 }}
                                value={password}
                                onChange={e => { setPassword(e.target.value); setPwError(''); }}
                                placeholder="Enter password"
                                onKeyDown={e => e.key === 'Enter' && handleVerifyPassword()}
                                autoFocus
                            />
                            <button
                                type="button"
                                className="input-icon-btn"
                                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                                onClick={() => setShowPassword(p => !p)}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                            </button>
                        </div>
                        {pwError && <p style={{ color: 'var(--color-error, #ef4444)', fontSize: 12, marginBottom: 10 }}>{pwError}</p>}

                        <button
                            className="btn btn-primary btn-full"
                            onClick={handleVerifyPassword}
                            disabled={isVerifying || !password.trim()}
                        >
                            {isVerifying ? <span className="loading-spinner" /> : 'Show Private Key'}
                        </button>
                    </div>
                )}

                {/* ── SCREEN: Key revealed ── */}
                {screen === 'export-key' && (
                    <div className="account-export-body">
                        <button className="account-export-back" onClick={() => { setScreen('export-pw'); setRevealed(false); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M15 18l-6-6 6-6" />
                            </svg>
                            Back
                        </button>

                        <div style={{ marginBottom: 12, display: 'flex', gap: 6 }}>
                            <span style={{ fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '3px 8px', color: 'var(--text-tertiary)' }}>
                                {network === 'octra' ? 'Octra · Base64' : 'Ethereum · Hex'}
                            </span>
                            {network === 'evm' && !wallet.mnemonic && (
                                <span style={{ fontSize: 12, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '3px 8px', color: 'var(--accent-primary)' }}>
                                    Same seed as Octra
                                </span>
                            )}
                            {network === 'evm' && wallet.mnemonic && (
                                <span style={{ fontSize: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '3px 8px', color: '#f59e0b' }}>
                                    From mnemonic seed
                                </span>
                            )}
                        </div>

                        <div className="account-key-box" onClick={() => setRevealed(true)}>
                            <p className={`account-key-text ${revealed ? 'revealed' : ''}`}>
                                {getPrivateKey(wallet, network)}
                            </p>
                        </div>

                        <div className="account-key-actions">
                            <button className="account-key-btn" onClick={() => setRevealed(r => !r)}>
                                {revealed ? <EyeOffIcon size={15} /> : <EyeIcon size={15} />}
                            </button>
                            <button className="account-key-btn copy-btn" onClick={handleCopy}>
                                {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                                {copied ? 'Copied!' : 'Copy Key'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
