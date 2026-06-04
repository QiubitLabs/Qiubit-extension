/**
 * Dapp Approval Component
 * Displays a popup for approving dApp connections and transactions.
 */

import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { QiubitLogo, AlertIcon } from '../shared/Icons';
import { ConfirmModal } from '../shared';
import { ConnectApproval } from './ConnectApproval';
import { MessageApproval } from './MessageApproval';
import { TransactionApproval } from './TransactionApproval';
import { NetworkApproval } from './NetworkApproval';
import './AddNetworkModal.css';
import './DappApproval.css';
import { keyringService } from '../../services/core/KeyringService';
import { decodeTx, formatDecodedTx } from '../../services/network/TxDecoder';
import { resolveNetwork, resolveNetworkByChainId } from '../../services/network/NetworkResolver';
import { getRpcEndpoint } from '../../config/rpcEndpoints';
import { useWallet } from '../../context/WalletContext';
import { Wallet } from '../../types';
import { loadSnapshot } from '../../utils/walletSnapshot';
import { getCachedPrices, getTokenPrice } from '../../services/network/PriceService';
import { fetchGasOptions, gweiToWei } from '../../utils/evmProvider';

interface RequestData {
    origin: string;
    icon?: string;
    action: 'connect' | 'signMessage' | 'signTransaction' | 'sendTransaction'
          | 'addNetwork' | 'switchNetwork'
          | 'ethSendTransaction' | 'ethPersonalSign' | 'ethSignTypedData';
    params?: any;
    [key: string]: any;
}

interface DappApprovalProps {
    request?: RequestData;
    onApprove?: (request: RequestData) => Promise<void>;
    onReject?: (request: RequestData) => Promise<void>;
    approvalId?: string;
    sessionKey?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(addr: string, front = 6, back = 4): string {
    if (!addr || addr.length <= front + back + 3) return addr;
    return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

function formatUsd(usd: number): string {
    if (usd === 0) return '';
    if (usd < 0.01) return '<$0.01';
    return `$${usd.toFixed(2)}`;
}

// ── Wallet Picker Modal ───────────────────────────────────────────────────────

interface WalletPickerProps {
    wallets: Wallet[];
    selectedOctraAddr: string;
    isEvmAction: boolean;
    onSelect: (octraAddr: string) => void;
    onClose: () => void;
}

function computeWalletUsd(address: string): number {
    const priceMap = getCachedPrices();
    const snap = loadSnapshot(address);
    if (!snap?.tokens?.length) return 0;
    return snap.tokens.reduce((sum, t) => {
        const bal = typeof t.balance === 'string' ? parseFloat(t.balance) : (t.balance || 0);
        const price = priceMap.get(t.symbol)?.price ?? priceMap.get(t.symbol.toUpperCase())?.price ?? 0;
        return sum + (isNaN(bal) ? 0 : bal * price);
    }, 0);
}

function WalletPicker({ wallets, selectedOctraAddr, isEvmAction, onSelect, onClose }: WalletPickerProps) {
    return (
        <div className="da-picker-overlay" onClick={onClose}>
            <div className="da-picker-sheet" onClick={e => e.stopPropagation()}>
                <div className="da-picker-header">
                    <span>Select wallet</span>
                    <button className="da-picker-close" onClick={onClose}>✕</button>
                </div>
                <div className="da-picker-list">
                    {wallets.map((w, i) => {
                        const evmAddr = w.evmAddress ?? keyringService.getEvmAddress(w.address) ?? '';
                        const hasEvm = !!evmAddr;
                        const displayAddr = isEvmAction ? (evmAddr || '') : w.address;
                        const isActive = w.address === selectedOctraAddr;
                        const usdTotal = computeWalletUsd(w.address);
                        const disabled = isEvmAction && !hasEvm;
                        return (
                            <button
                                key={w.address}
                                className={`da-picker-item ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                                onClick={() => { if (!disabled) { onSelect(w.address); onClose(); } }}
                                disabled={disabled}
                            >
                                <div className="da-picker-avatar">
                                    {(w.name ?? `Wallet ${i + 1}`).slice(0, 1).toUpperCase()}
                                </div>
                                <div className="da-picker-info">
                                    <span className="da-picker-name">{w.name ?? `Wallet ${i + 1}`}</span>
                                    <span className="da-picker-addr">
                                        {disabled ? 'No EVM address' : truncate(displayAddr || w.address, 8, 6)}
                                    </span>
                                </div>
                                <div className="da-picker-bal">
                                    <span className="da-picker-usd">{usdTotal > 0 ? formatUsd(usdTotal) : '$0.00'}</span>
                                </div>
                                {isActive && <span className="da-picker-tick">✓</span>}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DappApproval({ request: propRequest, onApprove, onReject }: DappApprovalProps) {
    const { wallets, activeWalletIndex, setActiveWallet } = useWallet();

    const [request, setRequest] = useState<RequestData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [decodedMethod, setDecodedMethod] = useState<string | null>(null);

    // Selected Octra address — uniquely identifies the selected account
    const [selectedOctraAddr, setSelectedOctraAddr] = useState<string>('');
    // Track if user explicitly chose a wallet so we don't override on re-renders
    const userPickedRef = useRef(false);

    // Gas & Fee states
    const [feeEstimates, setFeeEstimates] = useState<{ low: number; medium: number; high: number } | null>(null);
    const [feeSpeed, setFeeSpeed] = useState<'slow' | 'normal' | 'fast' | 'custom'>('normal');
    const [customFeeGwei, setCustomFeeGwei] = useState('10');
    const [showFeePopup, setShowFeePopup] = useState(false);
    const [evmGasOpts, setEvmGasOpts] = useState<any | null>(null);
    const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);
    const [isLoadingFee, setIsLoadingFee] = useState(false);


    const sessionNetSetting = request?.params?.networkSetting;
    const requestChain = request?.params?.chain;
    const currentNetwork = sessionNetSetting ? resolveNetwork(sessionNetSetting) : null;
    const NON_EVM_CHAINS = ['sui', 'solana', 'bitcoin', 'octra'];
    const isEvmAction = !!(
        request?.action && (
            request.action.startsWith('eth') ||
            (request.action === 'connect' &&
                !NON_EVM_CHAINS.includes(requestChain) &&
                (currentNetwork ? currentNetwork.addressType === 'evm' : sessionNetSetting !== 'octra'))
        )
    );

    const getDisplayAddress = (octraAddr: string) => {
        if (!octraAddr) return '';
        if (isEvmAction) {
            const w = wallets.find(w => w.address === octraAddr);
            return w?.evmAddress ?? keyringService.getEvmAddress(octraAddr) ?? '';
        }
        return octraAddr;
    };

    const handleWalletSelect = async (octraAddr: string) => {
        userPickedRef.current = true;
        setSelectedOctraAddr(octraAddr);
        const idx = wallets.findIndex(w => w.address === octraAddr);
        if (idx !== -1) {
            try {
                await setActiveWallet(idx);
            } catch (err) {
                console.error('Failed to set active wallet during selection:', err);
            }
        }
    };

    useEffect(() => {
        if (propRequest) setRequest(propRequest);
    }, [propRequest]);

    // Initialise selectedOctraAddr from the active wallet — but only if user hasn't manually picked one
    useEffect(() => {
        if (userPickedRef.current || wallets.length === 0) return;
        // Prefer keyring's tracked active address for correctness across popup contexts
        const activeAddr = keyringService.getActiveAddress();
        const candidate = (activeAddr && wallets.some(w => w.address === activeAddr))
            ? activeAddr
            : (wallets[activeWalletIndex]?.address ?? wallets[0].address);
        setSelectedOctraAddr(candidate);
    }, [wallets, activeWalletIndex]);


    useEffect(() => {
        if (!propRequest || propRequest.action !== 'ethSendTransaction') return;
        const { txParams, chainId } = propRequest.params || {};
        if (!txParams?.data || txParams.data === '0x' || !txParams.to) return;
        decodeTx(txParams.data, txParams.to, chainId || 1).then(decoded => {
            if (decoded) setDecodedMethod(formatDecodedTx(decoded));
        });
    }, [propRequest]);

    // Fetch gas options and pricing automatically
    useEffect(() => {
        if (!request || request.action !== 'ethSendTransaction' || !selectedOctraAddr) return;
        const { txParams, chainId } = request.params || {};
        const fromAddr = getDisplayAddress(selectedOctraAddr);
        if (!fromAddr) return;

        let active = true;
        setIsLoadingFee(true);

        const run = async () => {
            try {
                const netConfig = resolveNetworkByChainId(chainId || 1);
                const networkName = netConfig?.id;
                
                // Construct standard transaction for estimation
                const txForEstimation: ethers.TransactionRequest = {
                    from: fromAddr,
                    to: txParams.to || undefined,
                    value: txParams.value || undefined,
                    data: txParams.data || undefined,
                };

                let gasLimitFallback = 65_000n;
                if (txParams.gas) {
                    try {
                        gasLimitFallback = BigInt(txParams.gas);
                    } catch {}
                }

                const [opts, priceData] = await Promise.all([
                    fetchGasOptions(txForEstimation, gasLimitFallback, networkName),
                    getTokenPrice('ETH').catch(() => null),
                ]);

                if (!active) return;

                setEvmGasOpts(opts);
                setEthPriceUsd(priceData?.price ?? null);
                
                const normGwei = (Number(opts.normal.maxFeePerGas) / 1e9).toFixed(2);
                setCustomFeeGwei(normGwei);

                const toEth = (tier: any) =>
                    parseFloat((Number(tier.maxFeePerGas * opts.gasLimit) / 1e18).toFixed(8));

                setFeeEstimates({
                    low:    toEth(opts.slow),
                    medium: toEth(opts.normal),
                    high:   toEth(opts.fast),
                });
            } catch (err) {
                console.warn('EVM Fee estimate failed in DappApproval', err);
                if (active) {
                    setFeeEstimates({ low: 0.0005, medium: 0.001, high: 0.0015 });
                }
            } finally {
                if (active) setIsLoadingFee(false);
            }
        };

        run();
        return () => {
            active = false;
        };
    }, [request, selectedOctraAddr]);

    const handleApprove = async () => {
        if (!request) return;
        setIsLoading(true);
        setError('');

        try {
            if (request.action === 'ethSendTransaction') {
                const { txParams, chainId } = request.params;
                const netConfig = resolveNetworkByChainId(chainId || 1);
                const rpcUrl = netConfig?.rpcUrl || getRpcEndpoint(chainId || 1);
                const activeOctraAddr = selectedOctraAddr;
                if (!activeOctraAddr) throw new Error('No wallet selected');

                const txRequest: any = {
                    to: txParams.to,
                    value: txParams.value || undefined,
                    data: txParams.data,
                    chainId: chainId || 1,
                };

                // Add gasLimit if estimated or provided
                if (evmGasOpts) {
                    txRequest.gasLimit = evmGasOpts.gasLimit;
                } else if (txParams.gas) {
                    txRequest.gasLimit = txParams.gas;
                }

                // Add gas pricing based on selected feeSpeed
                if (evmGasOpts && feeEstimates) {
                    if (feeSpeed === 'custom') {
                        const customWei = gweiToWei(customFeeGwei || '0');
                        txRequest.maxFeePerGas = customWei;
                        txRequest.maxPriorityFeePerGas = customWei > 1_000_000_000n ? 1_000_000_000n : customWei;
                    } else {
                        const tier = evmGasOpts[feeSpeed];
                        if (tier) {
                            txRequest.maxFeePerGas = tier.maxFeePerGas;
                            txRequest.maxPriorityFeePerGas = tier.maxPriorityFeePerGas;
                        }
                    }
                }

                const txResponse = await keyringService.signAndSendEvm(activeOctraAddr, txRequest, rpcUrl);
                if (onApprove) await onApprove({ ...request, _evmResult: txResponse.hash });
                window.close();
                return;
            }

            if (request.action === 'ethPersonalSign') {
                const { message } = request.params;
                if (!selectedOctraAddr) throw new Error('No wallet selected');
                const sig = await keyringService.signEvmMessage(selectedOctraAddr, message);
                if (onApprove) await onApprove({ ...request, _evmResult: sig });
                window.close();
                return;
            }

            if (request.action === 'ethSignTypedData') {
                const { typedData } = request.params;
                if (!selectedOctraAddr) throw new Error('No wallet selected');
                const sig = await keyringService.signEvmTypedData(selectedOctraAddr, typedData);
                if (onApprove) await onApprove({ ...request, _evmResult: sig });
                window.close();
                return;
            }

            // For connect: attach the selected wallet address so the background
            // uses it instead of re-reading (potentially stale) session storage.
            const connectResult = {
                ...request,
                _selectedOctraAddress: selectedOctraAddr,
                _selectedEvmAddress: getDisplayAddress(selectedOctraAddr),
            };
            if (onApprove) await onApprove(connectResult);
            window.close();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const clean = msg.replace(/\(.*\)/gs, '').replace(/\s+/g, ' ').trim().slice(0, 120);
            setError(clean || 'Transaction failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReject = async () => {
        if (!request) return;
        try {
            if (onReject) await onReject(request);
        } finally {
            window.close();
        }
    };

    if (!request) {
        return (
            <div className="da-loading">
                <span className="da-spinner" />
            </div>
        );
    }

    // Derive network info from tx chainId or networkSetting or typedData domain
    let typedDataChainId: number | null = null;
    if (request.action === 'ethSignTypedData' && request.params?.typedData) {
        try {
            const parsed = typeof request.params.typedData === 'string'
                ? JSON.parse(request.params.typedData)
                : request.params.typedData;
            if (parsed?.domain?.chainId) {
                typedDataChainId = Number(parsed.domain.chainId);
            }
        } catch (e) {
            console.warn('Failed to parse typedData chainId', e);
        }
    }

    const txChainId = request.params?.chainId || request.params?.txParams?.chainId || typedDataChainId;
    const txNetwork = txChainId ? resolveNetworkByChainId(Number(txChainId)) : null;
    const netSetting = request.params?.networkSetting || sessionNetSetting;
    const settingNetwork = netSetting ? resolveNetwork(netSetting) : null;
    const chainColors: Record<string, string> = { sui: '#6FB9FF', solana: '#14F195', bitcoin: '#F7931A', octra: '#00D4FF' };
    const headerNetLabel = txNetwork?.displayName
        ?? settingNetwork?.displayName
        ?? (requestChain === 'sui' ? 'Sui'
            : requestChain === 'solana' ? 'Solana'
            : requestChain === 'bitcoin' ? 'Bitcoin'
            : netSetting === 'sepolia' ? 'Sepolia'
            : netSetting === 'ethereum' ? 'Ethereum'
            : netSetting === 'octra' ? 'Octra'
            : txChainId ? `Chain ${txChainId}`
            : 'Ethereum');
    const headerNetColor = txNetwork?.badgeColor
        ?? settingNetwork?.badgeColor
        ?? (requestChain && chainColors[requestChain] ? chainColors[requestChain]
            : netSetting === 'sepolia' ? '#8B5CF6'
            : netSetting === 'octra' ? '#00D4FF'
            : '#627EEA');

    // From address chip — clickable to open wallet picker
    const fromChip = () => {
        const activeWallet = wallets.find(w => w.address === selectedOctraAddr);
        const displayAddr = getDisplayAddress(selectedOctraAddr);
        const label = activeWallet?.name ?? truncate(displayAddr, 8, 6);
        return (
            <button
                className="da-from-chip"
                onClick={() => wallets.length > 1 && setShowPicker(true)}
                title={displayAddr}
                style={{ cursor: wallets.length > 1 ? 'pointer' : 'default' }}
            >
                <span className="da-from-dot" />
                <span className="da-from-label">{label}</span>
                <span className="da-from-addr">{truncate(displayAddr, 6, 4)}</span>
                {wallets.length > 1 && <span className="da-from-chevron">›</span>}
            </button>
        );
    };

    const renderBody = () => {
        switch (request.action) {
            case 'connect':
                return (
                    <ConnectApproval
                        request={request}
                        wallets={wallets}
                        selectedOctraAddr={selectedOctraAddr}
                        getDisplayAddress={getDisplayAddress}
                        onWalletSelectClick={() => setShowPicker(true)}
                    />
                );

            case 'ethPersonalSign':
            case 'signMessage':
            case 'ethSignTypedData':
                return (
                    <MessageApproval
                        request={request}
                        wallets={wallets}
                        selectedOctraAddr={selectedOctraAddr}
                        getDisplayAddress={getDisplayAddress}
                        fromChip={fromChip}
                    />
                );

            case 'ethSendTransaction':
            case 'sendTransaction':
            case 'signTransaction':
                return (
                    <TransactionApproval
                        request={request}
                        wallets={wallets}
                        selectedOctraAddr={selectedOctraAddr}
                        getDisplayAddress={getDisplayAddress}
                        fromChip={fromChip}
                        feeEstimates={feeEstimates}
                        feeSpeed={feeSpeed}
                        customFeeGwei={customFeeGwei}
                        evmGasOpts={evmGasOpts}
                        ethPriceUsd={ethPriceUsd}
                        isLoadingFee={isLoadingFee}
                        decodedMethod={decodedMethod}
                        onFeeRowClick={() => setShowFeePopup(true)}
                        gweiToWei={gweiToWei}
                    />
                );

            case 'addNetwork':
            case 'switchNetwork':
                return (
                    <NetworkApproval
                        request={request}
                        isLoading={isLoading}
                        handleApprove={handleApprove}
                        setShowRejectModal={setShowRejectModal}
                    />
                );

            default:
                return (
                    <div className="da-body-content">
                        <div className="da-tx-title">Unknown Request</div>
                        <div className="da-site-origin small">{request.action}</div>
                    </div>
                );
        }
    };

    return (
        <div className="da-wrap">
            {/* Wallet picker overlay */}
            {showPicker && (
                <WalletPicker
                    wallets={wallets}
                    selectedOctraAddr={selectedOctraAddr}
                    isEvmAction={isEvmAction}
                    onSelect={handleWalletSelect}
                    onClose={() => setShowPicker(false)}
                />
            )}

            {/* Fee Selection Mini Popup */}
            {showFeePopup && feeEstimates && (
                <div className="fee-popup-overlay" onClick={() => setShowFeePopup(false)}>
                    <div className="fee-popup" onClick={e => e.stopPropagation()}>
                        <div className="fee-popup-header">
                            <span className="fee-popup-title">Network Fee</span>
                            <button className="fee-popup-close" onClick={() => setShowFeePopup(false)}>
                                ✕
                            </button>
                        </div>
                        <div className="fee-popup-options">
                            {([
                                { key: 'slow',   label: 'Slow',   desc: 'Lower priority',   amount: feeEstimates.low    },
                                { key: 'normal', label: 'Normal', desc: 'Recommended',       amount: feeEstimates.medium },
                                { key: 'fast',   label: 'Fast',   desc: 'Higher priority',   amount: feeEstimates.high   },
                            ] as const).map(({ key, label, desc, amount }) => {
                                const usd = ethPriceUsd ? amount * ethPriceUsd : null;
                                let gweiStr = '';
                                if (evmGasOpts && (key === 'slow' || key === 'normal' || key === 'fast')) {
                                    const gweiVal = Number(evmGasOpts[key].maxFeePerGas) / 1e9;
                                    gweiStr = `${gweiVal.toFixed(2)} Gwei`;
                                }
                                return (
                                    <button
                                        key={key}
                                        className={`fee-popup-option ${feeSpeed === key ? 'active' : ''}`}
                                        onClick={() => { setFeeSpeed(key); setShowFeePopup(false); }}
                                    >
                                        <div className="fee-popup-option-info">
                                            <span className="fee-popup-option-label">{label}</span>
                                            <span className="fee-popup-option-desc">{desc}</span>
                                        </div>
                                        <div className="fee-popup-option-value">
                                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <div>{amount.toFixed(6)} ETH</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                                    {gweiStr ? `${gweiStr} ` : ''}
                                                    {usd !== null && `(≈ $${usd.toFixed(2)})`}
                                                </div>
                                            </div>
                                            {feeSpeed === key && <span className="fee-popup-tick">✓</span>}
                                        </div>
                                    </button>
                                );
                            })}
                            
                            <div className={`fee-popup-option ${feeSpeed === 'custom' ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'default' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: feeSpeed === 'custom' ? '8px' : '0' }} onClick={() => setFeeSpeed('custom')}>
                                    <div className="fee-popup-option-info">
                                        <span className="fee-popup-option-label">Custom</span>
                                        <span className="fee-popup-option-desc">Set your own gas price</span>
                                    </div>
                                    <div className="fee-popup-option-value">
                                        {feeSpeed === 'custom' && <span className="fee-popup-tick">✓</span>}
                                    </div>
                                </div>
                                {feeSpeed === 'custom' && (() => {
                                    const customWei = evmGasOpts ? gweiToWei(customFeeGwei || '0') : 0n;
                                    const customEth = evmGasOpts ? Number(customWei * evmGasOpts.gasLimit) / 1e18 : 0;
                                    const customUsd = customEth && ethPriceUsd ? customEth * ethPriceUsd : 0;
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-primary)', padding: '8px', borderRadius: '8px' }}>
                                                <input 
                                                    type="number" 
                                                    value={customFeeGwei} 
                                                    onChange={(e) => setCustomFeeGwei(e.target.value)} 
                                                    style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '14px' }}
                                                    placeholder="Gas Price in Gwei"
                                                />
                                                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Gwei</span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                                                {customEth.toFixed(6)} ETH {customUsd > 0 ? `(≈ $${customUsd.toFixed(2)})` : ''}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="da-header">
                <QiubitLogo size={20} />
                <span className="da-header-name">Qiubit</span>
                <span className="da-net-chip" style={{ color: headerNetColor, background: headerNetColor + '1a' }}>
                    {headerNetLabel}
                </span>
            </div>

            {/* Body */}
            <div className="da-body">
                {renderBody()}
            </div>

            {/* Inline error */}
            {error && (
                <div className="da-error">
                    <AlertIcon size={12} />
                    <span>{error}</span>
                </div>
            )}

            {/* Footer — hidden for addNetwork */}
            {request.action !== 'addNetwork' && (
                <div className="da-footer">
                    <button className="da-btn-reject" onClick={() => setShowRejectModal(true)} disabled={isLoading}>
                        Reject
                    </button>
                    <button className="da-btn-approve" onClick={handleApprove} disabled={isLoading}>
                        {isLoading ? <span className="da-spinner" /> : 'Approve'}
                    </button>
                </div>
            )}

            <ConfirmModal
                isOpen={showRejectModal}
                onConfirm={handleReject}
                onCancel={() => setShowRejectModal(false)}
                title="Reject Request?"
                message={`Reject this request from ${request.origin}?`}
                confirmText="Reject"
                cancelText="Cancel"
            />
        </div>
    );
}

export default DappApproval;
