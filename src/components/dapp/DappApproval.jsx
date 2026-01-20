/**
 * DApp Approval Components
 * Simple and professional UI for dApp connection and signing approvals
 */

import { useState, useEffect } from 'react';
import './DappApproval.css';
import { CheckIcon, AlertIcon, GlobeIcon, SignatureIcon } from '../shared/Icons';

/**
 * Connect Approval Component
 */
export function ConnectApproval({ request, onApprove, onReject }) {
    const [loading, setLoading] = useState(false);

    const handleApprove = async () => {
        setLoading(true);
        try {
            await onApprove();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dapp-approval">
            <div className="dapp-approval-header">
                <div className="dapp-icon">
                    {request.favicon ? (
                        <img src={request.favicon} alt="" onError={(e) => e.target.style.display = 'none'} />
                    ) : (
                        <GlobeIcon size={24} />
                    )}
                </div>
                <div className="dapp-info">
                    <div className="dapp-title">{request.title || 'Unknown dApp'}</div>
                    <div className="dapp-origin">{request.origin}</div>
                </div>
            </div>

            <div className="approval-message">
                <p><strong>Authorize connection?</strong></p>
                <p className="text-secondary text-sm">This site is requesting access to your wallet.</p>
            </div>

            <div className="approval-permissions">
                <div className="permission-item">
                    <CheckIcon size={14} />
                    <span>View your public address</span>
                </div>
                <div className="permission-item">
                    <CheckIcon size={14} />
                    <span>View your public balance</span>
                </div>
                <div className="permission-item">
                    <CheckIcon size={14} />
                    <span>Request approval for transactions</span>
                </div>
            </div>

            <div className="approval-actions">
                <button
                    className="btn-reject"
                    onClick={onReject}
                    disabled={loading}
                >
                    Cancel
                </button>
                <button
                    className="btn-approve"
                    onClick={handleApprove}
                    disabled={loading}
                >
                    {loading ? 'Authorizing...' : 'Authorize'}
                </button>
            </div>
        </div>
    );
}

/**
 * Sign Message Approval Component
 */
export function SignApproval({ request, onApprove, onReject }) {
    const [loading, setLoading] = useState(false);

    const handleApprove = async () => {
        setLoading(true);
        try {
            await onApprove();
        } finally {
            setLoading(false);
        }
    };

    // Format message for display
    const formatMessage = (payload) => {
        if (!payload) return 'No message';
        if (typeof payload === 'string') return payload;
        return payload.message || JSON.stringify(payload, null, 2);
    };

    return (
        <div className="dapp-approval">
            <div className="dapp-approval-header">
                <div className="dapp-icon">
                    {request.favicon ? (
                        <img src={request.favicon} alt="" onError={(e) => e.target.style.display = 'none'} />
                    ) : (
                        <SignatureIcon size={24} />
                    )}
                </div>
                <div className="dapp-info">
                    <div className="dapp-title">Sign Message</div>
                    <div className="dapp-origin">{request.origin}</div>
                </div>
            </div>

            <div className="message-preview">
                <div className="message-label">Message to sign:</div>
                <div className="message-content">
                    {formatMessage(request.payload)}
                </div>
            </div>

            {request.payload?.domain && (
                <div className="message-meta">
                    <div className="meta-item">
                        <span className="meta-label">Domain:</span>
                        <span className="meta-value">{request.payload.domain}</span>
                    </div>
                    {request.payload.expiresAt && (
                        <div className="meta-item">
                            <span className="meta-label">Expires:</span>
                            <span className="meta-value">
                                {new Date(request.payload.expiresAt).toLocaleString()}
                            </span>
                        </div>
                    )}
                </div>
            )}

            <div className="approval-warning">
                <AlertIcon size={14} />
                <span>Only sign messages from sites you trust</span>
            </div>

            <div className="approval-actions">
                <button
                    className="btn-reject"
                    onClick={onReject}
                    disabled={loading}
                >
                    Reject
                </button>
                <button
                    className="btn-approve"
                    onClick={handleApprove}
                    disabled={loading}
                >
                    {loading ? 'Signing...' : 'Sign'}
                </button>
            </div>
        </div>
    );
}

/**
 * Transaction Approval Component
 */
export function TransactionApproval({ request, onApprove, onReject, mode = 'send' }) {
    const [loading, setLoading] = useState(false);
    const [fee, setFee] = useState(null);

    // Fetch fee estimate
    useEffect(() => {
        const fetchFee = async () => {
            try {
                const est = await chrome.runtime.sendMessage({ type: 'GET_FEE_ESTIMATE' });
                if (est && est.medium) {
                    setFee(est.medium);
                }
            } catch (err) {
                console.warn('Failed to fetch fee:', err);
            }
        };
        fetchFee();
    }, []);

    const handleApprove = async () => {
        setLoading(true);
        try {
            await onApprove();
        } finally {
            setLoading(false);
        }
    };

    const tx = request.transaction || {};
    const amountOct = tx.amount ? (parseFloat(tx.amount) / 1000000).toFixed(6) : '0';
    const isSend = mode === 'send';

    return (
        <div className="dapp-approval">
            <div className="dapp-approval-header">
                <div className="dapp-icon tx-icon">
                    <span>TX</span>
                </div>
                <div className="dapp-info">
                    <div className="dapp-title">{isSend ? 'Confirm Transaction' : 'Sign Transaction'}</div>
                    <div className="dapp-origin">{request.origin}</div>
                </div>
            </div>

            <div className="tx-details">
                <div className="tx-amount">
                    <span className="amount-value">{amountOct}</span>
                    <span className="amount-unit">OCT</span>
                </div>

                <div className="tx-flow">
                    <div className="tx-address">
                        <span className="address-label">From</span>
                        <span className="address-value">{tx.from?.slice(0, 12)}...{tx.from?.slice(-8)}</span>
                    </div>
                    <div className="tx-arrow">-&gt;</div>
                    <div className="tx-address">
                        <span className="address-label">To</span>
                        <span className="address-value">{tx.to_?.slice(0, 12)}...{tx.to_?.slice(-8)}</span>
                    </div>
                </div>

                <div className="tx-details-row">
                    <span className="text-secondary">Network Fee</span>
                    <span>{fee ? `~${fee} OCT` : 'Validating...'}</span>
                </div>

                {tx.message && (
                    <div className="tx-memo">
                        <span className="memo-label">Memo:</span>
                        <span className="memo-value">{tx.message}</span>
                    </div>
                )}
            </div>

            <div className="approval-warning">
                <AlertIcon size={14} />
                <span>{isSend ? 'This action cannot be undone' : 'Signature will be shared with the site'}</span>
            </div>

            <div className="approval-actions">
                <button
                    className="btn-reject"
                    onClick={onReject}
                    disabled={loading}
                >
                    Reject
                </button>
                <button
                    className="btn-approve btn-send"
                    onClick={handleApprove}
                    disabled={loading}
                >
                    {loading ? (isSend ? 'Sending...' : 'Signing...') : (isSend ? 'Confirm & Send' : 'Sign Only')}
                </button>
            </div>
        </div>
    );
}

/**
 * Connected Sites List
 */
export function ConnectedSites({ connections, onDisconnect }) {
    if (!connections || connections.length === 0) {
        return (
            <div className="connected-sites-empty">
                <p>No connected sites</p>
            </div>
        );
    }

    return (
        <div className="connected-sites">
            {connections.map((conn) => (
                <div key={conn.origin} className="connected-site-item">
                    <div className="site-icon">
                        {conn.favicon ? (
                            <img src={conn.favicon} alt="" onError={(e) => e.target.style.display = 'none'} />
                        ) : (
                            <GlobeIcon size={20} />
                        )}
                    </div>
                    <div className="site-info">
                        <div className="site-title">{conn.title || conn.origin}</div>
                        <div className="site-origin">{conn.origin}</div>
                    </div>
                    <button
                        className="btn-disconnect"
                        onClick={() => onDisconnect(conn.origin)}
                    >
                        Disconnect
                    </button>
                </div>
            ))}
        </div>
    );
}
/**
 * Main Approval Screen Wrapper
 */
export function DappApprovalScreen({ approvalId, sessionKey }) {
    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch request details
    useEffect(() => {
        const fetchRequest = async () => {
            try {
                // Get all pending approvals
                const requests = await chrome.runtime.sendMessage({ type: 'GET_PENDING_APPROVALS' });
                const found = requests.find(r => r.id === approvalId);

                if (found) {
                    setRequest(found);
                } else {
                    setError('Request not found or expired');
                }
            } catch (err) {
                setError('Failed to load request');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchRequest();
    }, [approvalId]);

    const handleResolve = async (decision) => {
        try {
            await chrome.runtime.sendMessage({
                type: 'RESOLVE_APPROVAL',
                data: {
                    id: approvalId,
                    decision: decision, // 'approved' | 'rejected'
                    sessionKey: sessionKey, // PASS THE KEY!
                    result: decision === 'approved' ? { allowed: true } : null
                }
            });
            // Give a tiny buffer for message passing before killing the window
            setTimeout(() => window.close(), 100);
        } catch (err) {
            console.error('Failed to resolve:', err);
            // Even if failed, try to close to avoid stuck popup
            window.close();
        }
    };

    if (loading) return <div className="dapp-loading">Loading request...</div>;
    if (error) return <div className="dapp-error">{error}</div>;
    if (!request) return null;

    // Render appropriate component
    if (request.type === 'connect') {
        return (
            <ConnectApproval
                request={request}
                onApprove={() => handleResolve('approved')}
                onReject={() => handleResolve('rejected')}
            />
        );
    }

    if (request.type === 'signMessage') {
        // Ensure payload is accessible at top level for the component
        const reqWithPayload = {
            ...request,
            payload: request.params?.payload || request.params
        };
        return (
            <SignApproval
                request={reqWithPayload}
                onApprove={() => handleResolve('approved')}
                onReject={() => handleResolve('rejected')}
            />
        );
    }

    if (request.type === 'signTransaction' || request.type === 'sendTransaction') {
        // Map params to expected prop format if needed
        const reqWithTx = {
            ...request,
            transaction: request.params.transaction || request.params
        };
        return (
            <TransactionApproval
                request={reqWithTx}
                mode={request.type === 'sendTransaction' ? 'send' : 'sign'}
                onApprove={() => handleResolve('approved')}
                onReject={() => handleResolve('rejected')}
            />
        );
    }

    return <div>Unknown request type: {request.type}</div>;
}
