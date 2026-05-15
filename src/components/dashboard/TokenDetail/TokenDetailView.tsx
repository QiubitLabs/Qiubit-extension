import { useState, useEffect } from 'react';
import './TokenDetailView.css';
import { formatAmount, truncateAddress } from '../../../utils/crypto';
import { TokenIcon } from '../../shared/TokenIcon';
import { SendIcon, ReceiveIcon, SwapIcon } from './TokenDetailIcons';
import { TransactionDetailModal } from '../Transactions/TransactionDetailModal/TransactionDetailModal';
import { Token } from '../../../types';
import { Transaction } from '../../../types';

const ETH_BRIDGE = '0xe7ed69b852fd2a1406080b26a37e8e04e7da4cae';
const WOCT_ADDR = '0x4647e1fe715c9e23959022c2416c71867f5a6e80';

interface EvmTx {
    hash: string;
    type: 'in' | 'out';
    label: 'Received' | 'Sent' | 'Bridge In' | 'Bridge Out' | 'Swap';
    address: string;
    amount: string;
    asset: string;
    timestamp: number;
}

async function fetchEvmTransfers(evmAddress: string, token: Token): Promise<EvmTx[]> {
    const rpcUrl = import.meta.env.VITE_ETH_RPC_URL;
    if (!rpcUrl || !evmAddress) return [];

    const fetchSide = async (direction: 'in' | 'out') => {
        const params: any = {
            toBlock: 'latest',
            maxCount: '0x14',
            withMetadata: true,
            excludeZeroValue: true,
        };

        if (token.symbol === 'ETH') {
            params.category = ['external'];
        } else {
            params.category = ['erc20'];
            params.contractAddresses = [
                token.contractAddress || WOCT_ADDR
            ];
        }

        if (direction === 'in') {
            params.toAddress = evmAddress;
            params.fromBlock = '0x0';
        } else {
            params.fromAddress = evmAddress;
            params.fromBlock = '0x0';
        }

        const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1,
                method: 'alchemy_getAssetTransfers',
                params: [params]
            })
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data?.result?.transfers || []) as any[];
    };

    const [incoming, outgoing] = await Promise.all([
        fetchSide('in').catch(() => []),
        fetchSide('out').catch(() => []),
    ]);

    const toEvmTx = (raw: any, direction: 'in' | 'out'): EvmTx => {
        const from = (raw.from || '').toLowerCase();
        const to = (raw.to || '').toLowerCase();
        const isBridgeAddr = from === ETH_BRIDGE || to === ETH_BRIDGE;
        const isLiFi = from.startsWith('0x1231deb6') || to.startsWith('0x1231deb6');

        let label: EvmTx['label'];
        if (isBridgeAddr) {
            label = direction === 'in' ? 'Bridge In' : 'Bridge Out';
        } else if (isLiFi) {
            label = 'Swap';
        } else {
            label = direction === 'in' ? 'Received' : 'Sent';
        }

        const counterparty = direction === 'in' ? raw.from : raw.to;
        const ts = raw.metadata?.blockTimestamp
            ? new Date(raw.metadata.blockTimestamp).getTime()
            : Date.now();

        return {
            hash: raw.hash,
            type: direction,
            label,
            address: counterparty || '',
            amount: raw.value != null ? String(raw.value) : '0',
            asset: raw.asset || token.symbol,
            timestamp: ts,
        };
    };

    const all: EvmTx[] = [
        ...incoming.map((r: any) => toEvmTx(r, 'in')),
        ...outgoing.map((r: any) => toEvmTx(r, 'out')),
    ];

    // Deduplicate by hash (same tx can appear in both sides if self-send)
    const seen = new Set<string>();
    return all
        .filter(tx => {
            if (seen.has(tx.hash)) return false;
            seen.add(tx.hash);
            return true;
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
}

interface TokenDetailViewProps {
    token: Token;
    evmAddress?: string;
    onBack: () => void;
    onSend: (token: Token) => void;
    onShowQR: (token: Token) => void;
    transactions: Transaction[];
}

export function TokenDetailView({ token, evmAddress, onBack, onSend, onShowQR, transactions }: TokenDetailViewProps) {
    const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
    const [evmTxs, setEvmTxs] = useState<EvmTx[]>([]);
    const [isLoadingEvm, setIsLoadingEvm] = useState(false);

    useEffect(() => {
        if (!token.isEVM || !evmAddress) return;
        setIsLoadingEvm(true);
        fetchEvmTransfers(evmAddress, token)
            .then(setEvmTxs)
            .catch(() => setEvmTxs([]))
            .finally(() => setIsLoadingEvm(false));
    }, [token.symbol, evmAddress]);

    const octraTxs = transactions?.filter(tx =>
        (token.isNative && !tx.token) || tx.token === token.symbol
    ) || [];

    const labelColor: Record<string, string> = {
        'Bridge In': 'var(--color-success, #22c55e)',
        'Bridge Out': 'var(--color-warning, #f59e0b)',
        'Swap': 'var(--color-accent, #6366f1)',
        'Received': 'var(--color-success, #22c55e)',
        'Sent': 'inherit',
    };

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

            {/* Actions */}
            <div className="td-actions">
                <button className="td-action" onClick={() => onSend(token)}>
                    <div className="td-action-icon"><SendIcon /></div>
                    <span>Send</span>
                </button>
                <button className="td-action" onClick={() => onShowQR(token)}>
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

                {/* EVM token history */}
                {token.isEVM && (
                    <>
                        {isLoadingEvm && (
                            <div className="td-empty">
                                <span style={{ opacity: 0.5, fontSize: '13px' }}>Loading...</span>
                            </div>
                        )}
                        {!isLoadingEvm && evmTxs.length === 0 && (
                            <div className="td-empty">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                                <span>No transactions yet</span>
                            </div>
                        )}
                        {!isLoadingEvm && evmTxs.length > 0 && (
                            <div className="td-txs">
                                {evmTxs.map((tx, i) => (
                                    <div key={tx.hash || i} className="td-tx">
                                        <div className={`td-tx-icon ${tx.type}`}>
                                            {tx.type === 'in' ? <ReceiveIcon /> : <SendIcon />}
                                        </div>
                                        <div className="td-tx-info">
                                            <span className="td-tx-type" style={{ color: labelColor[tx.label] }}>
                                                {tx.label}
                                            </span>
                                            <span className="td-tx-date">
                                                {truncateAddress(tx.address, 4, 4)}
                                            </span>
                                        </div>
                                        <span className={`td-tx-amt ${tx.type}`}>
                                            {tx.type === 'in' ? '+' : '-'}{Number(tx.amount).toFixed(6)} {tx.asset}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Native OCT history */}
                {!token.isEVM && (
                    <>
                        {octraTxs.length === 0 ? (
                            <div className="td-empty">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                                <span>No transactions yet</span>
                            </div>
                        ) : (
                            <div className="td-txs">
                                {octraTxs.slice(0, 20).map((tx, i) => {
                                    const isIncoming = tx.type === 'in';
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
                                                <span className="td-tx-date">
                                                    {isIncoming ? 'From' : 'To'} {truncateAddress(tx.address, 4, 4)}
                                                </span>
                                            </div>
                                            <span className={`td-tx-amt ${tx.type}`}>
                                                {isIncoming ? '+' : '-'}{formatAmount(tx.amount, 6)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

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
