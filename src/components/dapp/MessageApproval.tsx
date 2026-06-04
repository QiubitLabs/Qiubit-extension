import { ethers } from 'ethers';
import { Wallet } from '../../types';
import { AlertIcon } from '../shared/Icons';

interface RequestData {
    origin: string;
    icon?: string;
    action: string;
    params?: any;
    [key: string]: any;
}

interface MessageApprovalProps {
    request: RequestData;
    wallets: Wallet[];
    selectedOctraAddr: string;
    getDisplayAddress: (addr: string) => string;
    fromChip: () => React.ReactNode;
}

function truncate(addr: string, front = 6, back = 4): string {
    if (!addr || addr.length <= front + back + 3) return addr;
    return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

// Helper to parse Typed Data and display it in a neat structured table
function renderTypedDataNode(data: any): React.ReactNode {
    if (data === null || data === undefined) return <span className="da-td-val-null">null</span>;
    
    if (typeof data === 'object') {
        return (
            <div className="da-td-nested-object">
                {Object.entries(data).map(([key, val]) => (
                    <div key={key} className="da-td-object-row">
                        <span className="da-td-key">{key}:</span>
                        <span className="da-td-val">{renderTypedDataNode(val)}</span>
                    </div>
                ))}
            </div>
        );
    }
    
    if (typeof data === 'boolean') {
        return <span className={`da-td-val-bool ${data ? 'true' : 'false'}`}>{String(data)}</span>;
    }
    
    if (typeof data === 'number') {
        return <span className="da-td-val-num">{data}</span>;
    }
    
    const strVal = String(data);
    if (strVal.startsWith('0x') && strVal.length === 42) {
        return <span className="da-td-val-addr mono" title={strVal}>{truncate(strVal, 8, 6)}</span>;
    }
    if (strVal.startsWith('oct') && strVal.length >= 40) {
        return <span className="da-td-val-addr mono" title={strVal}>{truncate(strVal, 8, 6)}</span>;
    }
    
    return <span className="da-td-val-str">"{strVal}"</span>;
}

export function MessageApproval({
    request,
    wallets: _wallets,
    selectedOctraAddr: _selectedOctraAddr,
    getDisplayAddress: _getDisplayAddress,
    fromChip
}: MessageApprovalProps) {
    const isTypedData = request.action === 'ethSignTypedData';
    
    // Message decoding logic
    let displayMsg = '';
    let typedDataDomain: any = null;
    let typedDataMessage: any = null;
    let typedPrimaryType = '';

    if (request.action === 'ethPersonalSign') {
        const { message } = request.params || {};
        displayMsg = message || '';
        try {
            if (message?.startsWith('0x')) {
                displayMsg = new TextDecoder().decode(ethers.getBytes(message));
            }
        } catch {
            // Keep raw message if decoding fails
        }
    } else if (request.action === 'signMessage') {
        displayMsg = request.params?.message || '';
    } else if (isTypedData) {
        const { typedData } = request.params || {};
        try {
            const parsed = typeof typedData === 'string' ? JSON.parse(typedData) : typedData;
            typedDataDomain = parsed?.domain || null;
            typedDataMessage = parsed?.message || null;
            typedPrimaryType = parsed?.primaryType || '';
        } catch (err) {
            console.warn('Failed to parse EIP-712 typed data:', err);
        }
    }

    return (
        <div className="da-body-content da-message-layout">
            <div className="da-tx-title">
                {isTypedData ? 'Sign Typed Data' : 'Sign Message'}
            </div>
            <div className="da-site-origin small">{request.origin}</div>

            {/* Account Card */}
            <div className="da-card da-account-card">
                <div className="da-row">
                    <span className="da-row-label">From Account</span>
                    {fromChip()}
                </div>
            </div>

            {/* Content Container */}
            {isTypedData ? (
                <div className="da-typed-data-container">
                    {/* Domain specifications */}
                    {typedDataDomain && (
                        <div className="da-card da-typed-domain-card">
                            <div className="da-card-header-label">Domain Info</div>
                            {typedDataDomain.name && (
                                <div className="da-row">
                                    <span className="da-row-label">Dapp Name</span>
                                    <span className="da-row-val">{typedDataDomain.name}</span>
                                </div>
                            )}
                            {typedDataDomain.version && (
                                <div className="da-row">
                                    <span className="da-row-label">Version</span>
                                    <span className="da-row-val">{typedDataDomain.version}</span>
                                </div>
                            )}
                            {typedDataDomain.chainId && (
                                <div className="da-row">
                                    <span className="da-row-label">Chain ID</span>
                                    <span className="da-row-val">{String(typedDataDomain.chainId)}</span>
                                </div>
                            )}
                            {typedDataDomain.verifyingContract && (
                                <div className="da-row">
                                    <span className="da-row-label">Contract</span>
                                    <span className="da-row-val mono" title={typedDataDomain.verifyingContract}>
                                        {truncate(typedDataDomain.verifyingContract, 8, 6)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Primary Type Badge */}
                    {typedPrimaryType && (
                        <div className="da-typed-primary-type-row">
                            <span className="da-section-label">Aksi Kontrak (Primary Type):</span>
                            <span className="da-primary-type-badge">{typedPrimaryType}</span>
                        </div>
                    )}

                    {/* Typed Message Details */}
                    {typedDataMessage && (
                        <div className="da-message-box da-typed-message-box">
                            <div className="da-message-label">Payload Data</div>
                            <div className="da-typed-structured-viewer">
                                {renderTypedDataNode(typedDataMessage)}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Monospace message box for standard text signature */
                <div className="da-message-box">
                    <div className="da-message-label">Message Text</div>
                    <div className="da-message-content da-scrollable-content">
                        {displayMsg || 'No message content provided'}
                    </div>
                </div>
            )}

            {/* Warning Box */}
            <div className="da-notice warning da-message-warning">
                <AlertIcon size={14} />
                <span>
                    {isTypedData
                        ? 'Tanda tangan data terstruktur ini dapat memicu otorisasi aksi on-chain (seperti transaksi tanpa gas atau persetujuan token). Hanya setujui jika Anda memahami efeknya.'
                        : 'Menandatangani pesan ini membuktikan bahwa Anda memiliki alamat dompet ini. Jangan pernah menandatangani pesan acak atau mencurigakan.'}
                </span>
            </div>
        </div>
    );
}

export default MessageApproval;
