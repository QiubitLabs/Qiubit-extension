import { useState } from 'react';
import { ChevronLeftIcon, ChevronDownIcon, CheckIcon } from '../../shared/Icons';
import { GasOptions } from '../../../utils/evmProvider';
import { Wallet } from '../../../types';
import { NetworkFeeSheet } from '../../shared/NetworkFeeSheet/NetworkFeeSheet';
import { OctraFeeSheet } from '../../shared/OctraFeeSheet/OctraFeeSheet';

const ETH_BRIDGE = '0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE';

const OCTRA_LOGO = '/qiubit-icon.svg';
const ETH_LOGO = 'https://static.debank.com/image/chain/logo_url/eth/42ba589cd077e7bdd97db6480b0ff61d.png';

export interface BridgeConfirmModalProps {
    showClaimConfirm: boolean;
    setShowClaimConfirm: (val: boolean) => void;
    pendingClaim: { calldata: string; epochId: number; amount?: string } | null;
    showBridgeConfirm: boolean;
    setShowBridgeConfirm: (val: boolean) => void;
    fromAmount: string;
    bridgeDir: 'o2e' | 'e2o';
    address: string;
    wallet: Wallet;
    claimFeeSpeed: 'slow' | 'normal' | 'fast' | 'custom';
    setClaimFeeSpeed: (val: 'slow' | 'normal' | 'fast' | 'custom') => void;
    customClaimGasPriceGwei: string;
    setCustomClaimGasPriceGwei: (val: string) => void;
    claimGasOpts: GasOptions | null;
    ethPriceUsd: number | null;
    ethBalanceWei: bigint | null;
    octFeeSpeed: 'slow' | 'normal' | 'fast' | 'custom';
    setOctFeeSpeed: (val: 'slow' | 'normal' | 'fast' | 'custom') => void;
    customOctFee: string;
    setCustomOctFee: (val: string) => void;
    octFeeEstimate: { slow: number; medium: number; fast: number };
    selectedOctFee: number;
    showClaimFeePopup: boolean;
    setShowClaimFeePopup: (val: boolean) => void;
    showOctFeePopup: boolean;
    setShowOctFeePopup: (val: boolean) => void;
    bridgeError: string;
    isFetchingClaimFee: boolean;
    claimWoct: () => Promise<void>;
    lockOctToEth: () => Promise<void>;
    burnWoctToOct: () => Promise<void>;
}

function shortAddr(addr: string): string {
    if (!addr) return '';
    if (addr.startsWith('oct')) return addr.slice(0, 8) + '...' + addr.slice(-4);
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function AddrField({ label, addr }: { label: string; addr: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="detail-label">{label}</span>
                <button
                    onClick={() => setOpen(v => !v)}
                    className="addr-chip-btn"
                >
                    <span>{shortAddr(addr)}</span>
                    <ChevronDownIcon
                        size={12}
                        style={{
                            transform: open ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.18s',
                            color: 'var(--text-secondary)',
                            flexShrink: 0,
                        }}
                    />
                </button>
            </div>
            {open && (
                <div className="expanded-address-container active">
                    {addr}
                </div>
            )}
        </div>
    );
}

function ChainBadge({ logo, name }: { logo: string; name: string }) {
    return (
        <div className="chain-badge">
            <img
                src={logo}
                alt=""
                className="chain-logo"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="chain-name">{name}</span>
        </div>
    );
}

export function BridgeConfirmModal({
    showClaimConfirm,
    setShowClaimConfirm,
    pendingClaim,
    showBridgeConfirm: _showBridgeConfirm,
    setShowBridgeConfirm,
    fromAmount,
    bridgeDir,
    address,
    wallet,
    claimFeeSpeed,
    setClaimFeeSpeed,
    customClaimGasPriceGwei,
    setCustomClaimGasPriceGwei,
    claimGasOpts,
    ethPriceUsd,
    ethBalanceWei,
    octFeeSpeed,
    setOctFeeSpeed,
    customOctFee,
    setCustomOctFee,
    octFeeEstimate,
    selectedOctFee,
    showClaimFeePopup,
    setShowClaimFeePopup,
    showOctFeePopup,
    setShowOctFeePopup,
    bridgeError,
    isFetchingClaimFee,
    claimWoct,
    lockOctToEth,
    burnWoctToOct,
}: BridgeConfirmModalProps) {
    const isClaim = showClaimConfirm && !!pendingClaim;
    const bridgeAmount = isClaim ? pendingClaim!.amount : fromAmount;
    const bridgeType = isClaim ? 'claim' : (bridgeDir === 'o2e' ? 'lock' : 'burn');

    const fromAddr = (bridgeType === 'burn' || bridgeType === 'claim') ? wallet.evmAddress : address;
    const toAddr = bridgeType === 'burn' ? address : (wallet.evmAddress || '');

    const fromSymbol = bridgeType === 'burn' ? 'wOCT' : 'OCT';
    const toSymbol = bridgeType === 'burn' ? 'OCT' : 'wOCT';

    const fromChainName = bridgeType === 'burn' ? 'Ethereum' : 'Octra';
    const toChainName = bridgeType === 'burn' ? 'Octra' : 'Ethereum';
    const fromChainLogo = bridgeType === 'burn' ? ETH_LOGO : OCTRA_LOGO;
    const toChainLogo = bridgeType === 'burn' ? OCTRA_LOGO : ETH_LOGO;

    const actionLabel = isClaim ? 'Claim' : bridgeType === 'lock' ? 'Lock' : 'Burn';

    const handleConfirm = () => {
        if (isClaim) {
            claimWoct();
        } else if (bridgeDir === 'o2e') {
            setShowBridgeConfirm(false);
            lockOctToEth();
        } else {
            burnWoctToOct();
        }
    };

    const handleBack = () => {
        if (isClaim) setShowClaimConfirm(false);
        else setShowBridgeConfirm(false);
    };

    const isInsufficientEth = isClaim && claimGasOpts !== null && ethBalanceWei !== null &&
        ethBalanceWei < claimGasOpts[claimFeeSpeed === 'custom' ? 'normal' : claimFeeSpeed].maxFeePerGas * claimGasOpts.gasLimit;

    return (
        <div className="full-page-overlay animate-fade-in" style={{ display: 'flex', flexDirection: 'column', padding: '16px', minHeight: '100%', position: 'relative', background: '#0D0D0D' }}>
            {/* Header */}
            <div className="view-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                <button
                    onClick={handleBack}
                    className="back-btn"
                >
                    <ChevronLeftIcon size={20} />
                </button>
                <span className="view-title">
                    Confirm {actionLabel}
                </span>
            </div>

            {/* Token Flow Card */}
            <div className="flow-card-unified" style={{ 
                background: 'var(--bg-secondary)', 
                border: '1px solid var(--border-subtle)', 
                borderRadius: '16px', 
                padding: '16px', 
                marginBottom: '16px', 
                display: 'flex', 
                flexDirection: 'column', 
                position: 'relative'
            }}>
                {/* Send Row */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '14px', 
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
                }}>
                    <div className="token-logo-wrap" style={{ 
                        width: '44px', 
                        height: '44px', 
                        borderRadius: '12px', 
                        background: 'var(--bg-card)', 
                        border: '1.5px solid var(--border-subtle)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        overflow: 'hidden', 
                        flexShrink: 0 
                    }}>
                        <img
                            src={fromChainLogo}
                            alt=""
                            className="token-logo"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>
                    <div className="token-flow-info" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span className="flow-label" style={{ 
                            fontSize: '10px', 
                            fontWeight: 700, 
                            textTransform: 'uppercase', 
                            color: 'var(--text-secondary)', 
                            letterSpacing: '0.8px', 
                            marginBottom: '4px' 
                        }}>{isClaim ? 'Action' : 'Send'}</span>
                        <span className="flow-amount-text" style={{ 
                            fontSize: '22px', 
                            fontWeight: 800, 
                            color: 'var(--text-primary)', 
                            lineHeight: 1.2 
                        }}>
                            {isClaim ? (
                                <>Claim Proof <span className="flow-symbol-text" style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-secondary)' }}>Epoch #{pendingClaim!.epochId}</span></>
                            ) : (
                                <>{bridgeAmount}{' '}
                                <span className="flow-symbol-text" style={{ 
                                    fontSize: '15px', 
                                    fontWeight: 500, 
                                    color: 'var(--text-secondary)' 
                                }}>{fromSymbol}</span></>
                            )}
                        </span>
                    </div>
                </div>

                {/* Overlapping cut-out Divider Arrow */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    height: '0', 
                    position: 'relative', 
                    zIndex: 10 
                }}>
                    <div style={{ 
                        position: 'absolute', 
                        top: '-15px', 
                        background: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-subtle)', 
                        borderRadius: '50%', 
                        width: '30px', 
                        height: '30px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                    }}>
                        <svg width="10" height="10" viewBox="0 0 12 8" fill="none" style={{ color: 'var(--text-secondary)' }}>
                            <path d="M1 1L6 7L11 1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>

                {/* Receive Row */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '14px', 
                    paddingTop: '16px'
                }}>
                    <div className="token-logo-wrap" style={{ 
                        width: '44px', 
                        height: '44px', 
                        borderRadius: '12px', 
                        background: 'var(--bg-card)', 
                        border: '1.5px solid var(--border-subtle)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        overflow: 'hidden', 
                        flexShrink: 0 
                    }}>
                        <img
                            src={toChainLogo}
                            alt=""
                            className="token-logo"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    </div>
                    <div className="token-flow-info" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span className="flow-label" style={{ 
                            fontSize: '10px', 
                            fontWeight: 700, 
                            textTransform: 'uppercase', 
                            color: 'var(--success)', 
                            letterSpacing: '0.8px', 
                            marginBottom: '4px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px' 
                        }}>
                            Receive 
                            <span className="estimate-badge" style={{ 
                                fontSize: '8px', 
                                background: 'var(--success-bg)', 
                                color: 'var(--success)', 
                                border: '1px solid rgba(0, 200, 83, 0.2)',
                                padding: '1px 6px', 
                                borderRadius: '4px',
                                textTransform: 'uppercase',
                                fontWeight: 700
                            }}>Estimate</span>
                        </span>
                        <span className="flow-amount-text" style={{ 
                            fontSize: '22px', 
                            fontWeight: 800, 
                            color: 'var(--success)', 
                            lineHeight: 1.2 
                        }}>
                            {bridgeAmount}{' '}
                            <span className="flow-symbol-text" style={{ 
                                fontSize: '15px', 
                                fontWeight: 500, 
                                color: 'rgba(0, 200, 83, 0.7)' 
                            }}>{toSymbol}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Details Card */}
            <div className="details-card" style={{ marginBottom: '16px' }}>
                <AddrField label="From address" addr={fromAddr || ''} />
                {toAddr && <AddrField label="To address" addr={toAddr} />}

                {/* Chains */}
                <div className="detail-row">
                    <span className="detail-label">From chain</span>
                    <ChainBadge logo={fromChainLogo} name={fromChainName} />
                </div>

                <div className="detail-row">
                    <span className="detail-label">To chain</span>
                    <ChainBadge logo={toChainLogo} name={toChainName} />
                </div>

                {isClaim && (
                    <div className="detail-row">
                        <span className="detail-label">Contract</span>
                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                            {ETH_BRIDGE.slice(0, 6)}...{ETH_BRIDGE.slice(-4)}
                        </span>
                    </div>
                )}

                {/* Insufficient ETH warning */}
                {isInsufficientEth && (
                    <div className="warning-card-box">
                        Insufficient ETH for gas fee. Please deposit more ETH to claim wOCT on Ethereum.
                    </div>
                )}

                {/* Network Fee */}
                <div
                    onClick={() => (isClaim || bridgeType === 'burn') ? setShowClaimFeePopup(true) : setShowOctFeePopup(true)}
                    className="detail-row border-top"
                    style={{ cursor: 'pointer' }}
                >
                    <span className="detail-label">Network fee</span>
                    <div className="network-fee-block">
                        {(isClaim || bridgeType === 'burn') ? (
                            <>
                                <span className="network-fee-val">
                                    {claimGasOpts
                                        ? `${(Number(claimGasOpts[claimFeeSpeed === 'custom' ? 'normal' : claimFeeSpeed].maxFeePerGas * claimGasOpts.gasLimit) / 1e18).toFixed(6)} ETH`
                                        : '--'
                                    }
                                </span>
                                {claimGasOpts && ethPriceUsd && (
                                    <div className="network-fee-fiat">
                                        ≈ ${(Number(claimGasOpts[claimFeeSpeed === 'custom' ? 'normal' : claimFeeSpeed].maxFeePerGas * claimGasOpts.gasLimit) / 1e18 * ethPriceUsd).toFixed(2)}
                                    </div>
                                )}
                            </>
                        ) : (
                            <span className="network-fee-val">
                                {selectedOctFee.toFixed(4)} OCT
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Simulation Card */}
            {bridgeError && (
                <div className="warning-card-box">
                    {bridgeError}
                </div>
            )}

            {/* Confirm Button */}
            <button
                className="action-button-main"
                onClick={handleConfirm}
                disabled={isFetchingClaimFee || isInsufficientEth}
            >
                {isFetchingClaimFee ? (
                    <>
                        <div className="spinner-small" style={{ borderTopColor: '#ffffff' }} />
                        <span>Processing...</span>
                    </>
                ) : (
                    <>
                        <CheckIcon size={18} />
                        <span>Confirm {actionLabel}</span>
                    </>
                )}
            </button>

            {/* Shared Network Fee Sheet for Claim/Burn (ETH) */}
            <NetworkFeeSheet
                show={showClaimFeePopup}
                onClose={() => setShowClaimFeePopup(false)}
                feeSpeed={claimFeeSpeed}
                setFeeSpeed={setClaimFeeSpeed}
                feeEstimates={{
                    low: claimGasOpts ? Number(claimGasOpts.slow.maxFeePerGas * claimGasOpts.gasLimit) / 1e18 : 0,
                    medium: claimGasOpts ? Number(claimGasOpts.normal.maxFeePerGas * claimGasOpts.gasLimit) / 1e18 : 0,
                    high: claimGasOpts ? Number(claimGasOpts.fast.maxFeePerGas * claimGasOpts.gasLimit) / 1e18 : 0,
                }}
                evmGasOpts={claimGasOpts}
                customFeeGwei={customClaimGasPriceGwei}
                setCustomFeeGwei={setCustomClaimGasPriceGwei}
                gasSymbol="ETH"
                ethPriceUsd={ethPriceUsd}
            />

            {/* OCT Fee Sheet (for lock) */}
            <OctraFeeSheet
                show={showOctFeePopup && bridgeType === 'lock'}
                onClose={() => setShowOctFeePopup(false)}
                feeSpeed={octFeeSpeed}
                setFeeSpeed={setOctFeeSpeed}
                feeEstimates={octFeeEstimate}
                customFee={customOctFee}
                setCustomFee={setCustomOctFee}
            />
        </div>
    );
}
