import { useState } from 'react';
import { formatAmount } from '../../../utils/crypto';
import { ChevronLeftIcon, ChevronDownIcon } from '../../shared/Icons';
import { NetworkFeeSheet } from '../../shared/NetworkFeeSheet/NetworkFeeSheet';
import { TokenIcon } from '../../shared/TokenIcon';
import { Token } from '../../../types';
import { getNetworkByChainId, getNetworkForToken } from '../../../constants/networks/registry';

interface SendConfirmModalProps {
    selectedToken: Token | null;
    amount: string;
    wallet: any;
    recipient: string;
    fee: number;
    ethPriceUsd: number | null;
    feeSpeed: 'slow' | 'normal' | 'fast' | 'custom';
    setFeeSpeed: (speed: 'slow' | 'normal' | 'fast' | 'custom') => void;
    customFeeGwei: string;
    setCustomFeeGwei: (gwei: string) => void;
    feeEstimates: { low: number; medium: number; high: number };
    evmGasOpts: any;
    showFeePopup: boolean;
    setShowFeePopup: (show: boolean) => void;
    handleConfirmSend: () => void;
    onBackToForm: () => void;
}

function shortAddr(addr: string): string {
    if (!addr) return '';
    if (addr.startsWith('oct')) return addr.slice(0, 8) + '...' + addr.slice(-4);
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function AddressRow({ label, addr }: { label: string; addr: string }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="detail-label">{label}</span>
                <button
                    onClick={() => setExpanded(e => !e)}
                    className="addr-chip-btn"
                >
                    <span>{shortAddr(addr)}</span>
                    <ChevronDownIcon
                        size={12}
                        style={{
                            transform: expanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.18s',
                            color: 'var(--text-secondary)',
                            flexShrink: 0,
                        }}
                    />
                </button>
            </div>
            {expanded && (
                <div className="expanded-address-container active">
                    {addr}
                </div>
            )}
        </div>
    );
}

export function SendConfirmModal({
    selectedToken,
    amount,
    wallet,
    recipient,
    fee,
    ethPriceUsd,
    feeSpeed,
    setFeeSpeed,
    customFeeGwei,
    setCustomFeeGwei,
    feeEstimates,
    evmGasOpts,
    showFeePopup,
    setShowFeePopup,
    handleConfirmSend,
    onBackToForm
}: SendConfirmModalProps) {
    const nativeGasSymbol = selectedToken?.isEVM
        ? (getNetworkByChainId(selectedToken.chainId ?? 1)?.nativeToken?.symbol ?? 'ETH')
        : (selectedToken?.symbol ?? '');

    const fromSymbol = selectedToken?.symbol || '';
    const network = selectedToken ? getNetworkForToken(selectedToken) : null;

    let senderAddr = wallet?.evmAddress || wallet?.address || '';
    if (network?.id === 'solana') {
        senderAddr = wallet?.solanaAddress || '';
    } else if (network?.id === 'sui') {
        senderAddr = wallet?.suiAddress || '';
    } else if (network?.id === 'bitcoin') {
        senderAddr = wallet?.bitcoinAddress || '';
    }

    const hasContract = selectedToken?.contractAddress &&
        selectedToken.contractAddress !== '0x0000000000000000000000000000000000000000';



    // Render check icon inline to avoid undefined issues
    const CheckIcon = ({ size }: { size: number }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );

    return (
        <div className="full-page-overlay animate-fade-in" style={{ display: 'flex', flexDirection: 'column', padding: '16px', minHeight: '100%', position: 'relative', background: '#0D0D0D' }}>
            {/* Header */}
            <div className="view-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                <button className="back-btn" onClick={onBackToForm}>
                    <ChevronLeftIcon size={20} />
                </button>
                <span className="view-title">Confirm Transaction</span>
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
                {/* Pay Row */}
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
                        <TokenIcon symbol={fromSymbol} logoUrl={selectedToken?.logoUrl} size={44} chainId={selectedToken?.chainId} contractAddress={selectedToken?.contractAddress} />
                    </div>
                    <div className="token-flow-info" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <span className="flow-label" style={{ 
                            fontSize: '10px', 
                            fontWeight: 700, 
                            textTransform: 'uppercase', 
                            color: 'var(--text-secondary)', 
                            letterSpacing: '0.8px', 
                            marginBottom: '4px' 
                        }}>Pay</span>
                        <span className="flow-amount-text" style={{ 
                            fontSize: '22px', 
                            fontWeight: 800, 
                            color: 'var(--text-primary)', 
                            lineHeight: 1.2 
                        }}>
                            {amount ? parseFloat(amount) : '0'}{' '}
                            <span className="flow-symbol-text" style={{ 
                                fontSize: '15px', 
                                fontWeight: 500, 
                                color: 'var(--text-secondary)' 
                            }}>{fromSymbol}</span>
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
                        <TokenIcon symbol={fromSymbol} logoUrl={selectedToken?.logoUrl} size={44} chainId={selectedToken?.chainId} contractAddress={selectedToken?.contractAddress} />
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
                            {amount ? parseFloat(amount) : '0'}{' '}
                            <span className="flow-symbol-text" style={{ 
                                fontSize: '15px', 
                                fontWeight: 500, 
                                color: 'rgba(0, 200, 83, 0.7)' 
                            }}>{fromSymbol}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Details Card */}
            <div className="details-card" style={{ marginBottom: '16px' }}>
                {senderAddr && (
                    <AddressRow label="From" addr={senderAddr} />
                )}

                {recipient && (
                    <AddressRow label="Recipient" addr={recipient} />
                )}

                {network && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span className="detail-label">From chain</span>
                            <div className="chain-badge">
                                {network.iconUrl && (
                                    <img src={network.iconUrl} alt={network.displayName} className="chain-logo" />
                                )}
                                <span className="chain-name">{network.displayName}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span className="detail-label">To chain</span>
                            <div className="chain-badge">
                                {network.iconUrl && (
                                    <img src={network.iconUrl} alt={network.displayName} className="chain-logo" />
                                )}
                                <span className="chain-name">{network.displayName}</span>
                            </div>
                        </div>
                    </>
                )}

                {hasContract && selectedToken?.contractAddress && (
                    <AddressRow label="Token contract" addr={selectedToken.contractAddress} />
                )}

                {/* Network Fee */}
                <div
                    onClick={() => setShowFeePopup(true)}
                    className="detail-row border-top"
                    style={{ cursor: 'pointer' }}
                >
                    <span className="detail-label">
                        Network fee
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
                            <path d="M11 19H13V17H11V19ZM12 2C10.0222 2 8.08879 2.58649 6.4443 3.6853C4.79981 4.78412 3.51809 6.3459 2.76121 8.17317C2.00433 10.0004 1.8063 12.0111 2.19215 13.9509C2.578 15.8907 3.53041 17.6725 4.92894 19.0711C6.32746 20.4696 8.10929 21.422 10.0491 21.8079C11.9889 22.1937 13.9996 21.9957 15.8268 21.2388C17.6541 20.4819 19.2159 19.2002 20.3147 17.5557C21.4135 15.9112 22 13.9778 22 12C22 9.34784 20.9464 6.8043 19.0711 4.92893C17.1957 3.05357 14.6522 2 12 2ZM12 20C10.4178 20 8.87104 19.5308 7.55544 18.6518C6.23985 17.7727 5.21447 16.5233 4.60897 15.0615C4.00347 13.5997 3.84504 11.9911 4.15372 10.4393C4.4624 8.88743 5.22433 7.46196 6.34315 6.34315C7.46197 5.22433 8.88744 4.4624 10.4393 4.15372C11.9911 3.84504 13.5997 4.00346 15.0615 4.60896C16.5233 5.21447 17.7727 6.23984 18.6518 7.55544C19.5308 8.87103 20 10.4177 20 12C20 14.1217 19.1572 16.1566 17.6569 17.6569C16.1566 19.1571 14.1217 20 12 20Z" fill="currentColor" />
                        </svg>
                    </span>
                    <div className="network-fee-block">
                        <span className="network-fee-val">
                            {fee ? `${formatAmount(fee, 6)} ${nativeGasSymbol}` : '--'}
                        </span>
                        {selectedToken?.isEVM && fee && ethPriceUsd && (
                            <div className="network-fee-fiat">
                                ≈ ${(fee * ethPriceUsd).toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>
            </div>



            {/* Confirm Button */}
            <button
                className="action-button-main animate-fade-in"
                onClick={handleConfirmSend}
            >
                <CheckIcon size={18} />
                <span>Confirm Transaction</span>
            </button>

            <NetworkFeeSheet
                show={showFeePopup}
                onClose={() => setShowFeePopup(false)}
                feeSpeed={feeSpeed}
                setFeeSpeed={setFeeSpeed}
                feeEstimates={feeEstimates}
                evmGasOpts={selectedToken?.isEVM ? evmGasOpts : null}
                customFeeGwei={customFeeGwei}
                setCustomFeeGwei={setCustomFeeGwei}
                gasSymbol={nativeGasSymbol}
                ethPriceUsd={ethPriceUsd}
            />
        </div>
    );
}
