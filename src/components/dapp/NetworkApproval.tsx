import { resolveNetworkByChainId } from '../../services/network/NetworkResolver';
import { AddNetworkModal } from './AddNetworkModal';
import { AlertIcon } from '../shared/Icons';

interface RequestData {
    origin: string;
    icon?: string;
    action: string;
    params?: any;
    [key: string]: any;
}

interface NetworkApprovalProps {
    request: RequestData;
    isLoading: boolean;
    handleApprove: () => void;
    setShowRejectModal: (show: boolean) => void;
}

export function NetworkApproval({
    request,
    isLoading,
    handleApprove,
    setShowRejectModal
}: NetworkApprovalProps) {
    const isAddNetwork = request.action === 'addNetwork';

    if (isAddNetwork) {
        return (
            <AddNetworkModal
                network={request.params?.networkParams}
                origin={request.origin}
                onAdd={handleApprove}
                onCancel={() => setShowRejectModal(true)}
                isLoading={isLoading}
            />
        );
    }

    // switchNetwork flow
    const chainIdDec = parseInt(request.params?.chainId ?? '0x0', 16);
    const net = resolveNetworkByChainId(chainIdDec);

    return (
        <div className="da-body-content da-network-layout">
            <div className="da-tx-title">Switch Network</div>
            <div className="da-site-origin small">{request.origin}</div>

            <div className="da-network-switch-card">
                <div className="da-site-header-card">
                    <div className="da-site-icon-container">
                        {request.icon ? (
                            <img src={request.icon} alt="" className="da-site-favicon" />
                        ) : (
                            <div className="da-site-icon-placeholder">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                </svg>
                            </div>
                        )}
                    </div>
                    <div className="da-network-switch-desc">
                        Situs ini meminta untuk memindahkan jaringan aktif dompet Anda ke:
                    </div>
                </div>

                <div className="da-card da-network-details-card">
                    <div className="da-row">
                        <span className="da-row-label">Target Jaringan</span>
                        <span className="da-row-val font-semibold" style={{ color: net?.badgeColor || 'var(--text-primary)' }}>
                            {net?.displayName ?? `Chain ${chainIdDec}`}
                        </span>
                    </div>
                    <div className="da-row">
                        <span className="da-row-label">Chain ID (Decimal)</span>
                        <span className="da-row-val">{chainIdDec}</span>
                    </div>
                    <div className="da-row">
                        <span className="da-row-label">Chain ID (Hex)</span>
                        <span className="da-row-val mono">{request.params?.chainId || '0x0'}</span>
                    </div>
                    {net?.nativeToken?.symbol && (
                        <div className="da-row">
                            <span className="da-row-label">Native Currency</span>
                            <span className="da-row-val">{net.nativeToken.symbol}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="da-notice">
                <AlertIcon size={14} />
                <span>Beralih jaringan hanya mengubah rantai aktif tempat transaksi Anda diajukan. Saldo Anda akan secara otomatis tersegregasi di bawah jaringan baru.</span>
            </div>
        </div>
    );
}

export default NetworkApproval;
