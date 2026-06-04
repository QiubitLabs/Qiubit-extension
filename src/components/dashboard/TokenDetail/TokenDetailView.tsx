import { useState, useEffect } from 'react';
import './TokenDetailView.css';
import { formatAmount, truncateAddress } from '../../../utils/crypto';
import { TokenIcon } from '../../shared/TokenIcon';
import { SendIcon, ReceiveIcon, SwapIcon } from './TokenDetailIcons';
import { TransactionDetailPage } from '../Transactions/TransactionDetailModal/TransactionDetailPage';
import { resolveNetworkForToken } from '../../../services/network/NetworkResolver';
import { Token } from '../../../types';
import { Transaction } from '../../../types';
import { getTokenPrice, getMultiplePricesByContractsMultiChain, formatUsd } from '../../../services/network/PriceService';
import { loadEvmTxHistory } from '../../../utils/storage';

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
    const [evmTxs, setEvmTxs] = useState<Transaction[]>([]);
    const [isLoadingEvm, setIsLoadingEvm] = useState(false);
    const [copied, setCopied] = useState(false);
    const [priceData, setPriceData] = useState<{ price: number; change24h: number } | null>(null);

    useEffect(() => {
        if (!token.isEVM || !evmAddress) return;
        setIsLoadingEvm(true);
        
        const net = resolveNetworkForToken(token);
        const networkId = net?.id;
        if (!networkId) {
            setIsLoadingEvm(false);
            return;
        }

        const isNativeToken = !token.contractAddress || token.contractAddress === '0x0000000000000000000000000000000000000000';

        // Load cached transaction history from local storage for this EVM network
        loadEvmTxHistory(networkId, evmAddress)
            .then((cachedTxs) => {
                const mappedCached = (cachedTxs || []).map(tx => ({
                    ...tx,
                    networkId: tx.networkId || networkId
                }));
                const filteredCached = mappedCached.filter(tx => {
                    const isSwapOrBridge = tx.type === 'swap' || (tx.type as string) === 'bridge' || (tx.description && (tx.description.toLowerCase().includes('swap') || tx.description.toLowerCase().includes('bridge')));
                    
                    if (isSwapOrBridge) {
                        const targetSymbol = token.symbol.toLowerCase();
                        const fromSym = (tx.fromTokenSymbol || tx.token || '').toLowerCase();
                        const toSym = (tx.toTokenSymbol || '').toLowerCase();
                        if (fromSym === targetSymbol || toSym === targetSymbol) {
                            return true;
                        }
                    }

                    if (isNativeToken) {
                        // Match if no contract address is set (native tx) OR if the token symbol matches POL/BNB/ETH case-insensitively
                        const isTxNative = !tx.contractAddress || tx.contractAddress === '0x0000000000000000000000000000000000000000';
                        return isTxNative || tx.token?.toLowerCase() === token.symbol.toLowerCase();
                    } else {
                        // Match ERC-20 transfers by contract address or symbol case-insensitively
                        return (tx.contractAddress && tx.contractAddress.toLowerCase() === token.contractAddress?.toLowerCase()) ||
                               (tx.token && tx.token.toLowerCase() === token.symbol.toLowerCase());
                    }
                });

                // Merge with any local pending/confirmed txs from transactions prop
                const mappedProps = transactions.map(tx => ({
                    ...tx,
                    networkId: tx.networkId || networkId
                }));
                const combined = [...mappedProps, ...filteredCached];
                const seen = new Set<string>();
                const deduped = combined.filter(tx => {
                    if (!tx.hash) return true;
                    if (seen.has(tx.hash)) return false;
                    seen.add(tx.hash);
                    return true;
                });
                
                setEvmTxs(deduped);
            })
            .catch(() => setEvmTxs([]))
            .finally(() => setIsLoadingEvm(false));
    }, [token.symbol, token.contractAddress, token.chainId, evmAddress, transactions]);

    useEffect(() => {
        const fetchPrice = async () => {
            // For EVM tokens with a contract address, query CoinGecko by contract (works for any chain)
            if (token.isEVM && token.contractAddress &&
                token.contractAddress !== '0x0000000000000000000000000000000000000000' &&
                token.chainId) {
                const map = await getMultiplePricesByContractsMultiChain([{
                    symbol: token.symbol,
                    contractAddress: token.contractAddress,
                    chainId: token.chainId,
                }]).catch(() => new Map<string, { price: number; change24h: number }>());
                const data = map.get(token.symbol);
                if (data && data.price > 0) { setPriceData(data); return; }
            }
            // Fallback: symbol-based lookup (native tokens, well-known symbols)
            const data = await getTokenPrice(token.symbol).catch(() => null);
            if (data) setPriceData(data);
        };
        fetchPrice();
    }, [token.symbol, token.contractAddress, token.chainId, token.balance]);

    const evmShowTxs = evmTxs;

    const octraTxs = transactions?.filter(tx => {
        const isSwapOrBridge = tx.type === 'swap' || (tx.type as string) === 'bridge' || (tx.description && (tx.description.toLowerCase().includes('swap') || tx.description.toLowerCase().includes('bridge')));
        if (isSwapOrBridge) {
            const targetSymbol = token.symbol.toLowerCase();
            const fromSym = (tx.fromTokenSymbol || tx.token || '').toLowerCase();
            const toSym = (tx.toTokenSymbol || '').toLowerCase();
            return fromSym === targetSymbol || toSym === targetSymbol;
        }
        return (token.isNative && !tx.token) || tx.token === token.symbol;
    }) || [];

    const labelColor: Record<string, string> = {
        'Bridge In': 'var(--color-success, #22c55e)',
        'Bridge Out': 'var(--color-warning, #f59e0b)',
        'Swap': 'var(--color-accent, #6366f1)',
        'Received': 'var(--color-success, #22c55e)',
        'Sent': 'inherit',
    };

    const network = resolveNetworkForToken(token);

    const handleCopyAddress = () => {
        if (token.contractAddress) {
            navigator.clipboard.writeText(token.contractAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const balanceNum = typeof token.balance === 'string' ? parseFloat(token.balance) : (token.balance || 0);
    const usdValue = priceData ? balanceNum * priceData.price : 0;

    // Format balance using standard US style (comma for thousands, dot for decimals)
    // Shorten decimals intelligently: if balance is very small (< 0.01), show up to 6 decimals, otherwise maximum 4 decimals.
    const maxDecimals = (balanceNum > 0 && balanceNum < 0.01) ? 6 : 4;
    const formattedBalance = balanceNum.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: maxDecimals
    });

    const formattedFiat = formatUsd(usdValue);

    return (
        <div className="td">
            {/* Header Redesigned exactly like the screenshot */}
            <div className="td-header-card">
                <button className="td-back-btn" onClick={onBack} title="Back">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>

                <div className="td-header-logo-container">
                    <TokenIcon symbol={token.symbol} logoUrl={token.logoUrl} size={42} />
                    {network && (
                        <img src={network.iconUrl} alt="" className="td-header-network-badge" />
                    )}
                </div>

                <div className="td-header-info">
                    <div className="td-header-symbol">{token.symbol}</div>
                    {token.isTestnet && (
                        <span className="td-testnet-badge">testnet</span>
                    )}
                    {token.contractAddress && token.contractAddress !== '0x0000000000000000000000000000000000000000' && (
                        <div className="td-header-address-row" onClick={handleCopyAddress}>
                            <span className="td-header-address">{truncateAddress(token.contractAddress, 6, 4)}</span>
                            <button className="td-copy-btn" title="Copy Address">
                                {copied ? 'Copied' : (
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                    </svg>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Large Balance Display */}
            <div className="td-balance-block">
                <div 
                    className="td-large-balance-amt"
                    style={{
                        fontSize: formattedBalance.length > 12 ? '24px' : (formattedBalance.length > 8 ? '28px' : '32px')
                    }}
                >
                    {formattedBalance}
                </div>
                <div className="td-fiat-val">
                    {formattedFiat}
                </div>
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
                        {!isLoadingEvm && evmShowTxs.length === 0 && (
                            <div className="td-empty">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                                <span>No transactions yet</span>
                            </div>
                        )}
                        {!isLoadingEvm && evmShowTxs.length > 0 && (
                            <div className="td-txs">
                                {evmShowTxs.map((tx, i) => (
                                    <div
                                        key={tx.hash || i}
                                        className="td-tx td-tx-clickable"
                                        onClick={() => setSelectedTx(tx)}
                                    >
                                        <div className={`td-tx-icon ${tx.type}`}>
                                            {tx.type === 'in' ? <ReceiveIcon /> : <SendIcon />}
                                        </div>
                                        <div className="td-tx-info">
                                            <span className="td-tx-type" style={{ color: labelColor[tx.description || ''] || 'inherit' }}>
                                                {tx.description || (tx.type === 'in' ? 'Received' : 'Sent')}
                                            </span>
                                            <span className="td-tx-date">
                                                {tx.type === 'in' ? 'From' : 'To'} {truncateAddress(tx.address, 4, 4)}
                                            </span>
                                        </div>
                                        <span className={`td-tx-amt ${tx.type}`}>
                                            {tx.type === 'in' ? '+' : '-'}{formatAmount(tx.amount, 6)} {tx.token || token.symbol}
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
                <div className="td-tx-detail-overlay">
                    <TransactionDetailPage
                        tx={selectedTx}
                        network="mainnet"
                        onBack={() => setSelectedTx(null)}
                    />
                </div>
            )}
        </div>
    );
}
