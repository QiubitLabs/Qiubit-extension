import { useState } from 'react';
import { formatAmount, truncateAddress } from '../../../utils/crypto';
import { TokenIcon } from '../../shared/TokenIcon';
import { SendIcon, ReceiveIcon, SwapIcon } from './TokenDetailIcons';
import { TransactionDetailModal } from '../Transactions';
import './TokenDetailView.css';

export function TokenDetailView({ token, onBack, onSend, onReceive, transactions }) {
    const [selectedTx, setSelectedTx] = useState(null);

    const tokenTxs = transactions?.filter(tx =>
        (token.isNative && !tx.token) || tx.token === token.symbol
    ) || [];

    return (
        <div className="td">
            {/* Header */}
            <header className="td-nav">
                <button className="td-back" onClick={onBack}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
                <span className="td-nav-title">{token.symbol}</span>
                <div style={{ width: 18 }} />
            </header>

            {/* Token Hero */}
            <div className="td-hero">
                <TokenIcon symbol={token.symbol} logoUrl={token.logoUrl} size={48} />
                <div className="td-token-name">{token.name}</div>
            </div>

            {/* Balance */}
            <div className="td-balance">
                <span className="td-balance-amt">{formatAmount(token.balance, 6)}</span>
                <span className="td-balance-sym">{token.symbol}</span>
            </div>

            {/* Actions - OKX/Phantom style */}
            <div className="td-actions">
                <button className="td-action" onClick={() => onSend(token)}>
                    <div className="td-action-icon"><SendIcon /></div>
                    <span>Send</span>
                </button>
                <button className="td-action" onClick={() => onReceive(token)}>
                    <div className="td-action-icon"><ReceiveIcon /></div>
                    <span>Receive</span>
                </button>
                <button className="td-action" disabled>
                    <div className="td-action-icon"><SwapIcon /></div>
                    <span>Swap</span>
                </button>
            </div>

            {/* Transactions */}
            <div className="td-section">
                <div className="td-section-title">Transactions</div>
                {tokenTxs.length === 0 ? (
                    <div className="td-empty">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                        <span>No transactions yet</span>
                    </div>
                ) : (
                    <div className="td-txs">
                        {tokenTxs.slice(0, 10).map((tx, i) => {
                            const isIncoming = tx.type === 'in';
                            const displayAddress = truncateAddress(tx.address, 4, 4);
                            const addressSubtitle = isIncoming ? `From ${displayAddress}` : `To ${displayAddress}`;

                            return (
                                <div
                                    key={i}
                                    className="td-tx td-tx-clickable"
                                    onClick={() => setSelectedTx(tx)}
                                >
                                    <div className={`td-tx-icon ${tx.type}`}>
                                        {isIncoming ? <ReceiveIcon /> : <SendIcon />}
                                    </div>
                                    <div className="td-tx-info">
                                        <span className="td-tx-type">{isIncoming ? 'Received' : 'Sent'}</span>
                                        <span className="td-tx-date">{addressSubtitle}</span>
                                    </div>
                                    <span className={`td-tx-amt ${tx.type}`}>
                                        {isIncoming ? '+' : '-'}{formatAmount(tx.amount, 6)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Transaction Detail Modal */}
            {selectedTx && (
                <TransactionDetailModal
                    tx={selectedTx}
                    network="mainnet"
                    onClose={() => setSelectedTx(null)}
                />
            )}
        </div>
    );
}
