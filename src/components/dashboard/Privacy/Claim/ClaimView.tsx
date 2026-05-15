import { ClaimIcon, LockIcon } from '../../../shared/Icons';
import './ClaimView.css';

interface ClaimViewProps {
    pendingTransfers: any[];
    isSubmitting: boolean;
    onClaim: (transferId: string) => void;
}

export function ClaimView({ pendingTransfers, isSubmitting, onClaim }: ClaimViewProps) {
    return (
        <div className="claim-list-view animate-slide-in">
            <header className="view-header-minimal mb-lg">
                <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">Pending Private Transfers</h3>
            </header>
            {pendingTransfers.length === 0 ? (
                <div className="empty-state py-xl">
                    <div className="empty-icon mb-md opacity-20"><ClaimIcon size={48} /></div>
                    <p className="text-secondary text-sm">No pending transfers to claim.</p>
                </div>
            ) : (
                <div className="claim-items-list">
                    {pendingTransfers.map((transfer: any) => (
                        <div key={transfer.id} className="claim-item-card">
                            <div className="claim-item-info">
                                <div className="text-xs text-tertiary mb-xs font-mono">From: {transfer.from?.slice(0, 10)}...</div>
                                <div className="font-mono text-sm flex items-center gap-xs text-primary">
                                    <LockIcon size={14} className="text-accent" /> Encrypted Fund
                                </div>
                            </div>
                            <button
                                className="btn-claim-action"
                                onClick={() => onClaim(transfer.id)}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? '...' : 'Claim'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
