import { Wallet } from '../../types';
import { resolveNetworkByChainId } from '../../services/network/NetworkResolver';
import { AlertIcon } from '../shared/Icons';

interface RequestData {
    origin: string;
    icon?: string;
    action: string;
    params?: any;
    [key: string]: any;
}

interface TransactionApprovalProps {
    request: RequestData;
    wallets: Wallet[];
    selectedOctraAddr: string;
    getDisplayAddress: (addr: string) => string;
    fromChip: () => React.ReactNode;
    feeEstimates: { low: number; medium: number; high: number } | null;
    feeSpeed: 'slow' | 'normal' | 'fast' | 'custom';
    customFeeGwei: string;
    evmGasOpts: any;
    ethPriceUsd: number | null;
    isLoadingFee: boolean;
    decodedMethod: string | null;
    onFeeRowClick: () => void;
    gweiToWei: (gwei: string) => bigint;
}

function truncate(addr: string, front = 6, back = 4): string {
    if (!addr || addr.length <= front + back + 3) return addr;
    return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

export function TransactionApproval({
    request,
    wallets,
    selectedOctraAddr,
    getDisplayAddress: _getDisplayAddress,
    fromChip,
    feeEstimates,
    feeSpeed,
    customFeeGwei,
    evmGasOpts,
    ethPriceUsd,
    isLoadingFee,
    decodedMethod,
    onFeeRowClick,
    gweiToWei
}: TransactionApprovalProps) {
    const isEvmTx = request.action === 'ethSendTransaction';

    if (isEvmTx) {
        const { txParams, chainId } = request.params || {};
        const net = resolveNetworkByChainId(chainId || 1);
        const isContract = !!(txParams?.data && txParams.data !== '0x');
        const explorerBase = net?.blockExplorerUrl;
        const nativeSymbol = net?.nativeToken?.symbol ?? 'ETH';

        const ethValue = txParams?.value
            ? (Number(BigInt(txParams.value)) / 1e18).toFixed(6)
            : '0.000000';

        // Calculate current fee based on speed
        let currentFee = 0.0015;
        if (feeEstimates) {
            if (feeSpeed === 'slow') currentFee = feeEstimates.low;
            else if (feeSpeed === 'fast') currentFee = feeEstimates.high;
            else if (feeSpeed === 'custom' && evmGasOpts) {
                const customWei = gweiToWei(customFeeGwei || '0');
                currentFee = Number(customWei * evmGasOpts.gasLimit) / 1e18;
            } else {
                currentFee = feeEstimates.medium;
            }
        }

        const valueNum = parseFloat(ethValue);
        const totalCrypto = valueNum + (isLoadingFee ? 0 : currentFee);
        const valueUsd = ethPriceUsd ? valueNum * ethPriceUsd : 0;
        const feeUsd = ethPriceUsd ? currentFee * ethPriceUsd : 0;
        const totalUsd = ethPriceUsd ? totalCrypto * ethPriceUsd : 0;

        return (
            <div className="da-body-content da-tx-layout">
                <div className="da-tx-title">Confirm Transaction</div>
                <div className="da-site-origin small">{request.origin}</div>

                {/* Sender -> Recipient Visual Diagram */}
                <div className="da-tx-flow-diagram">
                    <div className="da-flow-node from">
                        <span className="da-flow-label">Pengirim</span>
                        <div className="da-flow-wallet-avatar">
                            {wallets.find(w => w.address === selectedOctraAddr)?.name?.slice(0, 1).toUpperCase() ?? 'W'}
                        </div>
                        <span className="da-flow-name">
                            {wallets.find(w => w.address === selectedOctraAddr)?.name ?? 'Wallet'}
                        </span>
                    </div>
                    <div className="da-flow-arrow">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
                            <polyline points="19 12 12 19 5 12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <div className="da-flow-node to">
                        <span className="da-flow-label">{isContract ? 'Kontrak Pintar' : 'Penerima'}</span>
                        <div className="da-flow-wallet-avatar to-avatar">
                            {isContract ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            )}
                        </div>
                        <span className="da-flow-name mono" title={txParams?.to}>
                            {txParams?.to ? truncate(txParams.to, 5, 4) : 'New Contract'}
                        </span>
                    </div>
                </div>

                {/* Transaction details card */}
                <div className="da-card">
                    <div className="da-row">
                        <span className="da-row-label">From Address</span>
                        {fromChip()}
                    </div>
                    {txParams?.to && (
                        <div className="da-row">
                            <span className="da-row-label">{isContract ? 'Contract' : 'To'}</span>
                            {explorerBase ? (
                                <a
                                    className="da-row-val mono da-link"
                                    href={`${explorerBase}/address/${txParams.to}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {truncate(txParams.to, 8, 6)}
                                </a>
                            ) : (
                                <span className="da-row-val mono">{truncate(txParams.to, 8, 6)}</span>
                            )}
                        </div>
                    )}
                    {valueNum > 0 && (
                        <div className="da-row">
                            <span className="da-row-label">Value</span>
                            <div className="da-row-val-group">
                                <span className="da-row-val">{ethValue} {nativeSymbol}</span>
                                {ethPriceUsd && valueUsd > 0 && (
                                    <div className="da-row-subval">≈ ${valueUsd.toFixed(2)}</div>
                                )}
                            </div>
                        </div>
                    )}
                    {decodedMethod && (
                        <div className="da-row">
                            <span className="da-row-label">Aksi Kontrak</span>
                            <span className="da-row-val decoded-method-val">{decodedMethod}</span>
                        </div>
                    )}
                    {isContract && !decodedMethod && txParams?.data && (
                        <div className="da-row">
                            <span className="da-row-label">Hex Data</span>
                            <span className="da-row-val mono small">{txParams.data.slice(0, 14)}…</span>
                        </div>
                    )}

                    {/* Network Fee (Interactive) */}
                    <div
                        className="da-row clickable-fee-row"
                        onClick={() => feeEstimates && onFeeRowClick()}
                        style={{ cursor: feeEstimates ? 'pointer' : 'default' }}
                    >
                        <span className="da-row-label select-fee-label">
                            Fee Jaringan <span className="da-edit-badge">Edit</span>
                        </span>
                        <div className="da-row-val-group">
                            <span className="da-row-val font-semibold" style={{ color: feeSpeed === 'custom' ? '#00D4FF' : 'var(--text-primary)' }}>
                                {isLoadingFee ? 'Estimating...' : `${currentFee.toFixed(6)} ${nativeSymbol}`}
                            </span>
                            {!isLoadingFee && ethPriceUsd && (
                                <div className="da-row-subval">
                                    ≈ ${feeUsd.toFixed(2)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Total Summary Section */}
                <div className="da-tx-total-container">
                    <div className="da-total-card">
                        <div className="da-total-header">Total Pengeluaran</div>
                        <div className="da-total-crypto">
                            {isLoadingFee ? '...' : `${totalCrypto.toFixed(6)} ${nativeSymbol}`}
                        </div>
                        {!isLoadingFee && ethPriceUsd && (
                            <div className="da-total-fiat">
                                ≈ ${totalUsd.toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Warning notice */}
                <div className="da-notice warning">
                    <AlertIcon size={14} />
                    <span>Verifikasi detail transaksi ini secara saksama. Aksi ini tidak dapat dibatalkan setelah disiarkan ke blockchain.</span>
                </div>
            </div>
        );
    }

    // Default return for non-EVM Octra transactions
    return (
        <div className="da-body-content da-tx-layout">
            <div className="da-tx-title">
                {request.action === 'sendTransaction' ? 'Send Transaction' : 'Sign Transaction'}
            </div>
            <div className="da-site-origin small">{request.origin}</div>
            
            <div className="da-card">
                <div className="da-row">
                    <span className="da-row-label">From Account</span>
                    {fromChip()}
                </div>
                <div className="da-row">
                    <span className="da-row-label">Amount</span>
                    <span className="da-row-val font-bold text-lg">{request.params?.value || '0'} OCT</span>
                </div>
            </div>
            
            <div className="da-notice warning">
                <AlertIcon size={14} />
                <span>Pastikan Anda memercayai situs asal sebelum menandatangani atau mengirimkan transaksi Octra ini.</span>
            </div>
        </div>
    );
}

export default TransactionApproval;
