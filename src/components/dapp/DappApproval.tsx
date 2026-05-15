/**
 * Dapp Approval Component
 * Displays a popup for approving Dapp connections and transactions.
 */

import { useState, useEffect } from 'react';
import { QiubitLogo, CheckCircleIcon, ShieldIcon, AlertIcon, LinkIcon } from '../shared/Icons';
import { ConfirmModal } from '../shared';

interface RequestData {
    origin: string;
    icon?: string;
    action: 'connect' | 'signMessage' | 'signTransaction' | 'sendTransaction';
    params?: any;
    [key: string]: any;
}

interface DappApprovalProps {
    request?: RequestData; // Added request prop
    onApprove?: (request: RequestData) => Promise<void>;
    onReject?: (request: RequestData) => Promise<void>;
    approvalId?: string;
    sessionKey?: string | null;
}

export function DappApproval({ request: propRequest, onApprove, onReject }: DappApprovalProps) {
    const [request, setRequest] = useState<RequestData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);

    useEffect(() => {
        if (propRequest) {
            setRequest(propRequest);
        }
    }, [propRequest]);

    const handleApprove = async () => {
        if (!request) return;

        setIsLoading(true);
        setError('');

        try {
            if (onApprove) {
                await onApprove(request);
            }
            // Close window or redirect back
            window.close();
        } catch (err: any) {
            setError(err.message || 'Failed to approve request');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReject = async () => {
        if (!request) return;

        try {
            if (onReject) {
                await onReject(request);
            }
            window.close();
        } catch (err: any) {
            console.error('Error rejecting request:', err);
            window.close();
        }
    };

    if (!request) {
        return (
            <div className="dapp-approval-loading">
                <span className="loading-spinner" />
                <p>Loading request...</p>
            </div>
        );
    }

    const renderContent = () => {
        switch (request.action) {
            case 'connect':
                return (
                    <div className="dapp-request-content">
                        <div className="dapp-icon-large">
                            {request.icon ? (
                                <img src={request.icon} alt="Dapp Icon" />
                            ) : (
                                <LinkIcon size={48} />
                            )}
                        </div>
                        <h2 className="dapp-request-title">Connect to Site</h2>
                        <p className="dapp-request-origin">{request.origin}</p>

                        <div className="dapp-permissions">
                            <h3>This site is requesting access to:</h3>
                            <ul className="dapp-permissions-list">
                                <li>
                                    <CheckCircleIcon size={20} className="permission-check" />
                                    <span>View your wallet address</span>
                                </li>
                                <li>
                                    <CheckCircleIcon size={20} className="permission-check" />
                                    <span>View your account balance</span>
                                </li>
                                <li>
                                    <CheckCircleIcon size={20} className="permission-check" />
                                    <span>Request approval for transactions</span>
                                </li>
                            </ul>
                        </div>

                        <div className="dapp-warning">
                            <ShieldIcon size={16} />
                            <p>Only connect to sites you trust.</p>
                        </div>
                    </div>
                );

            case 'signMessage':
                return (
                    <div className="dapp-request-content">
                        <div className="dapp-icon-medium">
                            {request.icon ? (
                                <img src={request.icon} alt="Dapp Icon" />
                            ) : (
                                <LinkIcon size={32} />
                            )}
                        </div>
                        <h2 className="dapp-request-title">Sign Message</h2>
                        <p className="dapp-request-origin">{request.origin}</p>

                        <div className="message-box">
                            <h3>Message:</h3>
                            <div className="message-content">
                                {request.params?.message || 'No message content provided'}
                            </div>
                        </div>

                        <div className="dapp-warning warning-orange">
                            <AlertIcon size={16} />
                            <p>Signing this message simply proves you own this wallet address.</p>
                        </div>
                    </div>
                );

            case 'sendTransaction':
            case 'signTransaction':
                return (
                    <div className="dapp-request-content">
                        <div className="dapp-icon-medium">
                            {request.icon ? (
                                <img src={request.icon} alt="Dapp Icon" />
                            ) : (
                                <LinkIcon size={32} />
                            )}
                        </div>
                        <h2 className="dapp-request-title">
                            {request.action === 'sendTransaction' ? 'Send Transaction' : 'Sign Transaction'}
                        </h2>
                        <p className="dapp-request-origin">{request.origin}</p>

                        <div className="transaction-details">
                            {/* Placeholder for transaction visualization */}
                            <div className="detail-row">
                                <span className="label">Estimated Fee:</span>
                                <span className="value">~0.001 OCT</span>
                            </div>
                            <div className="detail-row">
                                <span className="label">Total:</span>
                                <span className="value">{request.params?.value || '0'} OCT + Fee</span>
                            </div>
                        </div>
                    </div>
                );

            default:
                return (
                    <div className="dapp-request-content">
                        <h2 className="dapp-request-title">Unknown Request</h2>
                        <p>The application is requesting an unknown action: {request.action}</p>
                    </div>
                );
        }
    };

    return (
        <div className="dapp-approval-container animate-fade-in">
            <div className="dapp-approval-header">
                <QiubitLogo size={24} />
                <span>Qiubit</span>
            </div>

            <div className="dapp-approval-body">
                {renderContent()}
            </div>

            {error && (
                <div className="dapp-approval-error">
                    <p>{error}</p>
                </div>
            )}

            <div className="dapp-approval-footer">
                <button
                    className="btn btn-ghost"
                    onClick={() => setShowRejectModal(true)}
                    disabled={isLoading}
                >
                    Reject
                </button>
                <button
                    className="btn btn-primary"
                    onClick={handleApprove}
                    disabled={isLoading}
                >
                    {isLoading ? <span className="loading-spinner" /> : 'Approve'}
                </button>
            </div>

            <ConfirmModal
                isOpen={showRejectModal}
                onConfirm={handleReject}
                onCancel={() => setShowRejectModal(false)}
                title="Reject Request?"
                message={`Are you sure you want to reject this request from ${request.origin}?`}
                confirmText="Reject"
                cancelText="Cancel"
            />
        </div>
    );
}

export default DappApproval;
