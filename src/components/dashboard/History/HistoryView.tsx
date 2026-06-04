import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import './HistoryView.css';
import './HistoryTabs.css';

import { ChevronLeftIcon } from '../../shared/Icons';
import { TransactionItem } from '../Transactions';
import { TransactionDetailPage } from '../Transactions/TransactionDetailModal/TransactionDetailPage';
import { Transaction, Settings, Token } from '../../../types';
import { getAllNetworks, resolveNetwork } from '../../../services/network/NetworkResolver';
import { loadEvmTxHistory, saveEvmTxHistory } from '../../../utils/storage';

type TxWithNetwork = Transaction & { _network: string };

interface HistoryViewProps {
    transactions: Transaction[];
    address: string;
    evmAddress?: string;
    settings: Settings;
    onBack: () => void;
    isLoading: boolean;
    onLoadMore: () => void;
    hasMore: boolean;
    isLoadingMore: boolean;
    tokens?: Token[];
}

function TransactionSkeleton() {
    return (
        <div className="tx-skeleton">
            <div className="tx-skeleton-main">
                <div className="tx-skeleton-icon"></div>
                <div className="tx-skeleton-info">
                    <div className="tx-skeleton-title"></div>
                    <div className="tx-skeleton-subtitle"></div>
                </div>
            </div>
            <div className="tx-skeleton-side">
                <div className="tx-skeleton-amount"></div>
                <div className="tx-skeleton-time"></div>
            </div>
        </div>
    );
}

export function HistoryView({
    transactions,
    address: _address,
    evmAddress,
    settings,
    onBack,
    isLoading,
    onLoadMore,
    hasMore,
    isLoadingMore,
    tokens,
}: HistoryViewProps) {
    const EVM_HISTORY_NETS = useMemo(() => {
        const allNets = getAllNetworks();
        return Object.entries(allNets)
            .filter(([, n]) => n.isEVM)
            .map(([id, n]) => ({
                id,
                label: n.displayName,
                color: n.badgeColor ?? '#627EEA',
                nativeSymbol: n.nativeToken?.symbol ?? 'ETH',
            }));
    }, []);

    const [filter, setFilter] = useState('all');
    const [networkFilter, setNetworkFilter] = useState<'all' | string>('all');
    const [selectedTx, setSelectedTx] = useState<TxWithNetwork | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [, setIsEvmLoading] = useState(false);
    // Map<networkId, Transaction[]> — one entry per EVM chain
    const [evmTxsByNetwork, setEvmTxsByNetwork] = useState<Map<string, Transaction[]>>(new Map());
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    // Track hashes whose receipts have been resolved (confirmed or failed) — stop checking them
    const settledEvmHashes = useRef<Set<string>>(new Set());

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current || isLoading || isLoadingMore || !hasMore) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 50) onLoadMore();
    }, [isLoading, isLoadingMore, hasMore, onLoadMore]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    const network = settings?.network || 'all';



    // Load EVM tx history from local storage only — no external API calls.
    // Runs on mount, address/network change, and polls every 3 seconds to keep UI automatically in sync.
    useEffect(() => {
        if (!evmAddress) { setEvmTxsByNetwork(new Map()); return; }
        if (network === 'octra') return;

        let cancelled = false;

        const loadAll = async (showLoading = false) => {
            if (showLoading) setIsEvmLoading(true);
            try {
                for (const net of EVM_HISTORY_NETS) {
                    const cached = await loadEvmTxHistory(net.id, evmAddress);
                    if (!cancelled) {
                        setEvmTxsByNetwork(prev => {
                            const current = prev.get(net.id);
                            if (JSON.stringify(current) === JSON.stringify(cached)) {
                                return prev;
                            }
                            const next = new Map(prev);
                            next.set(net.id, cached);
                            return next;
                        });
                    }
                }
            } finally {
                if (showLoading && !cancelled) setIsEvmLoading(false);
            }
        };

        // Load initially
        loadAll(true);

        // Poll every 3 seconds to auto-render new transactions saved to local storage
        const pollInterval = setInterval(() => {
            loadAll(false);
        }, 3000);

        return () => {
            cancelled = true;
            clearInterval(pollInterval);
        };
    }, [evmAddress, network, EVM_HISTORY_NETS]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reconcile EVM pending txs: check receipts and update status to confirmed/failed.
    // Runs whenever evmTxsByNetwork changes; settled hashes are skipped to avoid RPC spam.
    useEffect(() => {
        if (!evmAddress) return;

        const reconcile = async () => {
            for (const [netId, txs] of evmTxsByNetwork) {
                const pending = txs.filter(
                    tx => tx.status === 'pending' && tx.hash && !settledEvmHashes.current.has(tx.hash)
                );
                if (pending.length === 0) continue;

                try {
                    const { getEvmProviderForNetwork } = await import('../../../utils/evmProvider');
                    const provider = getEvmProviderForNetwork(netId);

                    for (const tx of pending) {
                        if (!tx.hash) continue;
                        try {
                            const receipt = await provider.getTransactionReceipt(tx.hash);
                            if (receipt !== null) {
                                settledEvmHashes.current.add(tx.hash);
                                const newStatus = receipt.status === 1 ? 'confirmed' : 'failed';
                                await saveEvmTxHistory(netId, evmAddress, [{
                                    ...tx,
                                    status: newStatus as Transaction['status'],
                                }]);
                            }
                            // No receipt yet → leave unsettled so the next poll retries
                        } catch {
                            settledEvmHashes.current.add(tx.hash); // stop retrying on RPC error
                        }
                    }
                } catch { /* provider unavailable for this network */ }
            }
        };

        reconcile();
    }, [evmTxsByNetwork, evmAddress]); // eslint-disable-line react-hooks/exhaustive-deps

    const contractToSymbol = useMemo(() => {
        const map = new Map<string, string>();
        if (!tokens) return map;
        for (const t of tokens) {
            if (t.contractAddress && t.contractAddress !== '0x0000000000000000000000000000000000000000') {
                map.set(t.contractAddress.toLowerCase(), t.symbol);
            }
        }
        return map;
    }, [tokens]);

    const allTransactions = useMemo((): TxWithNetwork[] => {
        const isOctOnly = network === 'octra';
        const isEvmOnly = !isOctOnly && resolveNetwork(network)?.isEVM;

        // Non-EVM transactions (Octra, Solana, Sui, Bitcoin) — hide when on any specific EVM network
        const nonEvmTxList: TxWithNetwork[] = (isEvmOnly ? [] : transactions)
            .map(tx => ({
                ...tx,
                _network: tx.networkId || 'octra',
                networkId: tx.networkId || 'octra'
            }));

        // All EVM network transactions merged from the map
        const evmTxList: TxWithNetwork[] = [];
        if (!isOctOnly) {
            evmTxsByNetwork.forEach((txs, netId) => {
                const evmNet = EVM_HISTORY_NETS.find(n => n.id === netId);
                const nativeSymbol = evmNet?.nativeSymbol ?? 'ETH';
                txs.forEach(tx => evmTxList.push({
                    ...tx,
                    _network: netId,
                    networkId: tx.networkId || netId,
                    token: tx.token || nativeSymbol,
                }));
            });
        }

        const combined = [...nonEvmTxList, ...evmTxList];
        const seen = new Set<string>();
        return combined
            .filter(tx => {
                if (!tx.hash) return true;
                if (seen.has(tx.hash)) return false;
                seen.add(tx.hash);
                return true;
            })
            .sort((a, b) => {
                const aT = typeof a.timestamp === 'string' ? parseInt(a.timestamp) : (a.timestamp as number);
                const bT = typeof b.timestamp === 'string' ? parseInt(b.timestamp) : (b.timestamp as number);
                return bT - aT;
            })
            .map(tx => {
                if (tx.contractAddress) {
                    const sym = contractToSymbol.get(tx.contractAddress.toLowerCase());
                    if (sym) return { ...tx, token: sym };
                }
                return tx;
            });
    }, [transactions, evmTxsByNetwork, network, contractToSymbol]);

    // All dynamic wallet networks listed dynamically for the filter dropdown
    const availableNetworks = useMemo((): string[] => {
        const order = ['octra', 'solana', 'sui', 'bitcoin', ...EVM_HISTORY_NETS.map(n => n.id)];
        if (network !== 'all') {
            return order.filter(id => id === network);
        }
        return order;
    }, [EVM_HISTORY_NETS, network]);

    const filteredTransactions = useMemo(() => {
        return allTransactions.filter(tx => {
            if (networkFilter !== 'all' && tx._network !== networkFilter) return false;
            if (filter === 'all') return true;
            if (filter === 'pending') return tx.status === 'pending';
            if (filter === 'sent') return tx.type === 'out' || tx.type === 'shield' || tx.type === 'private' || tx.type === 'swap';
            if (filter === 'received') return tx.type === 'in' || tx.type === 'unshield' || tx.type === 'claim';
            return true;
        });
    }, [allTransactions, filter, networkFilter]);

    const pendingCount = useMemo(() => {
        return allTransactions.filter(tx => tx.status === 'pending').length;
    }, [allTransactions]);

    // Get display metadata for a network (label + color)
    const getNetworkMeta = (netId: string) => {
        if (netId === 'octra') return { label: 'Octra', color: '#00D4FF' };
        if (netId === 'solana') return { label: 'Solana', color: '#14F195' };
        if (netId === 'sui') return { label: 'Sui', color: '#6FB9FF' };
        if (netId === 'bitcoin') return { label: 'Bitcoin', color: '#F7931A' };
        const evmNet = EVM_HISTORY_NETS.find(n => n.id === netId);
        return evmNet ? { label: evmNet.label, color: evmNet.color } : { label: netId, color: '#888' };
    };

    if (selectedTx) {
        return (
            <TransactionDetailPage
                tx={selectedTx}
                network={settings?.network || 'mainnet'}
                onBack={() => setSelectedTx(null)}
            />
        );
    }

    return (
        <div className="animate-fade-in">
            <div className="flex items-center gap-md mb-xl">
                <button className="header-icon-btn" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <h2 className="text-lg font-semibold" style={{ flex: 1 }}>Transaction History</h2>
            </div>

            {/* Type Filter Tabs & Dropdown */}
            <div className="flex items-center justify-between mb-lg" style={{ position: 'relative' }}>
                <div className="tab-pills" style={{ marginBottom: 0 }}>
                    <button className={`tab-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                        All
                    </button>
                    <button className={`tab-pill ${filter === 'sent' ? 'active' : ''}`} onClick={() => setFilter('sent')}>
                        Sent
                    </button>
                    <button className={`tab-pill ${filter === 'received' ? 'active' : ''}`} onClick={() => setFilter('received')}>
                        Received
                    </button>
                    {pendingCount > 0 && (
                        <button
                            className={`tab-pill tab-pill-pending ${filter === 'pending' ? 'active' : ''}`}
                            onClick={() => setFilter('pending')}
                        >
                            Pending ({pendingCount})
                        </button>
                    )}
                </div>

                {availableNetworks.length > 1 && (
                    <div style={{ position: 'relative' }} ref={dropdownRef}>
                        <button 
                            className="network-select-trigger-text"
                            onClick={() => setShowDropdown(!showDropdown)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '4px 8px',
                                transition: 'color 0.2s'
                            }}
                        >
                            <span>{networkFilter === 'all' ? 'All networks' : getNetworkMeta(networkFilter).label}</span>
                            <svg 
                                width="12" 
                                height="12" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2.5" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                                style={{ transform: showDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>

                        {showDropdown && (
                            <div 
                                className="network-dropdown-list animate-fade-in"
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: '8px',
                                    background: '#151515',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '10px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                    zIndex: 100,
                                    minWidth: '150px',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    padding: '4px 0',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}
                            >
                                <button
                                    onClick={() => { setNetworkFilter('all'); setShowDropdown(false); }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '8px 16px',
                                        textAlign: 'left',
                                        color: networkFilter === 'all' ? '#ffffff' : 'var(--text-secondary)',
                                        fontSize: '13px',
                                        fontWeight: networkFilter === 'all' ? 700 : 500,
                                        cursor: 'pointer',
                                        width: '100%',
                                        display: 'block'
                                    }}
                                >
                                    All networks
                                </button>

                                {availableNetworks.map(netId => {
                                    const meta = getNetworkMeta(netId);
                                    const isActive = networkFilter === netId;
                                    return (
                                        <button
                                            key={netId}
                                            onClick={() => { setNetworkFilter(netId); setShowDropdown(false); }}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                padding: '8px 16px',
                                                textAlign: 'left',
                                                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                                                fontSize: '13px',
                                                fontWeight: isActive ? 700 : 500,
                                                cursor: 'pointer',
                                                width: '100%',
                                                display: 'block'
                                            }}
                                        >
                                            {meta.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Loading State */}
            {isLoading && filteredTransactions.length === 0 ? (
                <div className="tx-section">
                    <div className="tx-list">
                        <TransactionSkeleton />
                        <TransactionSkeleton />
                        <TransactionSkeleton />
                    </div>
                </div>
            ) : filteredTransactions.length === 0 ? (
                <div className="tx-empty py-3xl flex flex-col items-center">
                    <div style={{ margin: '0 0 16px 0', opacity: 0.8, color: 'var(--text-tertiary)' }}>
                        <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <ellipse className="ghost-shadow" cx="50" cy="92" rx="20" ry="3" fill="currentColor" fillOpacity="0.2" />
                            <g className="ghost-body">
                                <path d="M50 15C30 15 15 35 15 60V85L22 78L29 85L36 78L43 85L50 78L57 85L64 78L71 85L78 78L85 85V60C85 35 70 15 50 15Z"
                                    fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                <circle cx="38" cy="45" r="4" fill="currentColor" fillOpacity="0.8" />
                                <circle cx="62" cy="45" r="4" fill="currentColor" fillOpacity="0.8" />
                                <ellipse cx="50" cy="58" rx="3" ry="4" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M15 55C10 55 5 45 10 40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                <path d="M85 55C90 55 95 45 90 40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </g>
                        </svg>
                    </div>
                    <p className="text-tertiary">
                        {filter === 'pending' ? 'No pending transactions' : 'No transactions found'}
                    </p>
                    {(filter !== 'all' || networkFilter !== 'all') && (
                        <p className="text-xs text-tertiary mt-sm">Try changing the filter</p>
                    )}
                </div>
            ) : (
                <div className="tx-section history-scroll-container" ref={scrollContainerRef}>
                    <div className="tx-list">
                        {filteredTransactions.map((tx, index) => (
                            <TransactionItem
                                key={tx.hash || index}
                                tx={tx}
                                onClick={() => setSelectedTx(tx)}
                            />
                        ))}
                    </div>
                    {isLoadingMore && (
                        <div className="tx-load-more">
                            <TransactionSkeleton />
                        </div>
                    )}
                    {!hasMore && filteredTransactions.length > 5 && (
                        <div className="tx-end">
                            <p>End of history</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
