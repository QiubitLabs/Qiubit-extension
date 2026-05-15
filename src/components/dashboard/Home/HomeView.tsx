import { useState, useEffect, useMemo } from 'react';
import { PlusIcon } from '../../shared/Icons';
import './HomeView.css';
import { TokenItem } from '../TokenItem';
import { getMultipleTokenPrices, getCachedPrices, formatUsd } from '../../../services/network/PriceService';
import { AddCustomTokenModal } from './AddCustomTokenModal';
import { Wallet, Token } from '../../../types';

interface HomeViewProps {
    wallet: Wallet;
    balance: number;
    transactions: any[];
    onCopyAddress: () => void;
    copied: boolean;

    onTokenClick: (token: Token) => void;
    isBalanceHidden: boolean;
    onToggleBalance: () => void;
    allTokens: Token[];
    isLoadingTokens: boolean;
    onRefresh: () => void;
}

export function HomeView({
    wallet,
    balance,
    onTokenClick,
    isBalanceHidden,
    onToggleBalance,
    allTokens,
    isLoadingTokens,
    onRefresh,
}: HomeViewProps) {
    const [activeTab, setActiveTab] = useState('crypto');
    const [showAddTokenModal, setShowAddTokenModal] = useState(false);


    // Removed: fetchEncryptedBalance useEffect
    // Now using 3-minute auto-refresh timer from App.tsx to prevent RPC throttling

    // Use only Public Balance for Home View as requested
    const displayBalance = balance;

    // Aggregated Total USD Value
    const [totalUsdValue, setTotalUsdValue] = useState(0);

    // Initialize from cache so prices show instantly (no flash of $0) on wallet switch
    const [priceMap, setPriceMap] = useState<Map<string, { price: number; change24h: number }>>(() => getCachedPrices());

    // Refresh prices when token list changes — PriceService has its own 5min TTL cache
    // so re-calling is cheap (returns cached if fresh). No standalone interval needed.
    useEffect(() => {
        let cancelled = false;
        const fetchPrices = async () => {
            const symbols = Array.from(new Set(allTokens.map(t => t.symbol)));
            if (symbols.length === 0) return;
            const prices = await getMultipleTokenPrices(symbols);
            if (cancelled) return;
            setPriceMap(prices);
        };
        fetchPrices();
        return () => { cancelled = true; };
    }, [allTokens]);

    // Compute total USD whenever balances or prices change
    useEffect(() => {
        const total = allTokens.reduce((sum, token) => {
            const sym = token.symbol === 'wOCT' ? 'OCT' : token.symbol;
            const price = priceMap.get(sym)?.price || priceMap.get(sym.toUpperCase())?.price || 0;
            const bal = typeof token.balance === 'string' ? parseFloat(token.balance) : token.balance;
            return sum + (bal * price);
        }, 0);
        setTotalUsdValue(total);
    }, [allTokens, priceMap]);

    const displayUsdValue = useMemo(() => formatUsd(totalUsdValue), [totalUsdValue]);

    // Portfolio 24h change (USD + %)
    const { portfolioChangeUsd, portfolioChangePct } = useMemo(() => {
        let changeUsd = 0;
        for (const token of allTokens) {
            const sym = token.symbol === 'wOCT' ? 'OCT' : token.symbol;
            const entry = priceMap.get(sym) ?? priceMap.get(sym.toUpperCase());
            if (!entry || !entry.change24h) continue;
            const bal = typeof token.balance === 'string' ? parseFloat(token.balance) : (token.balance || 0);
            changeUsd += bal * entry.price * (entry.change24h / 100);
        }
        const prevUsd = totalUsdValue - changeUsd;
        const pct = prevUsd > 0 ? (changeUsd / prevUsd) * 100 : 0;
        return { portfolioChangeUsd: changeUsd, portfolioChangePct: pct };
    }, [allTokens, priceMap, totalUsdValue]);

    // Asset list shows Public Balance only for Home View
    const tokens = useMemo(() => {
        // Construct Native Token immediately from props
        const nativeToken = {
            symbol: 'OCT',
            name: 'Octra',
            balance: displayBalance,
            isNative: true,
            logoType: 'native'
        };

        // If no tokens loaded yet, show at least the native token
        if (!allTokens || allTokens.length === 0) {
            return [nativeToken];
        }

        // If tokens exist, map them but ensure Native balance is synced
        const mappedTokens = allTokens.map((token: Token) => {
            if (token.isNative) {
                return { ...token, balance: displayBalance };
            }
            // Ensure non-native tokens (including EVM tokens) keep their balance
            return token;
        });

        // Guard: If backend somehow didn't return native token, prepend it
        const hasNative = mappedTokens.some((t: Token) => t.isNative);
        return hasNative ? mappedTokens : [nativeToken, ...mappedTokens];
    }, [allTokens, displayBalance]);

    const tokensWithPrices = useMemo(() => {
        return tokens.map(t => {
            const entry = priceMap.get(t.symbol) ?? priceMap.get(t.symbol.toUpperCase());
            return { ...t, price: entry?.price || 0, change24h: entry?.change24h ?? 0 };
        });
    }, [tokens, priceMap]);

    return (
        <>
            {/* Balance Card */}
            <div className="balance-card" onClick={onToggleBalance} style={{ cursor: 'pointer' }}>
                {isLoadingTokens && balance === 0 && !allTokens?.length ? (
                    <div className="flex-col items-center gap-sm">
                        <div className="skeleton" style={{ width: '120px', height: '32px', borderRadius: '6px' }} />
                        <div className="skeleton" style={{ width: '100px', height: '14px', borderRadius: '4px', marginTop: '8px' }} />
                    </div>
                ) : isBalanceHidden ? (
                    <div className="balance-amount">
                        <span className="balance-hidden">••••••</span>
                    </div>
                ) : (
                    <>
                        {/* Total Portfolio USD */}
                        <div className="balance-usd">{displayUsdValue}</div>

                        {/* 24h Change Row */}
                        {totalUsdValue > 0 && (
                            <div className="portfolio-change-row">
                                <span className={`portfolio-change-usd ${portfolioChangeUsd >= 0 ? 'positive' : 'negative'}`}>
                                    {portfolioChangeUsd >= 0 ? '+' : ''}{formatUsd(portfolioChangeUsd)}
                                </span>
                                <span className={`portfolio-change-pct ${portfolioChangePct >= 0 ? 'positive' : 'negative'}`}>
                                    {portfolioChangePct >= 0 ? '+' : ''}{portfolioChangePct.toFixed(2)}%
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>


            {/* Content Tabs - Simplified */}
            <div className="tabs">
                <button
                    className={`tab-item ${activeTab === 'crypto' ? 'active' : ''}`}
                    onClick={() => setActiveTab('crypto')}
                >
                    Crypto
                </button>
                <button
                    className={`tab-item ${activeTab === 'nft' ? 'active' : ''}`}
                    onClick={() => setActiveTab('nft')}
                >
                    NFTs
                </button>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
                {activeTab === 'crypto' && (
                    <div className="token-list-container">
                        <div className="token-list-header px-md flex justify-between items-center mb-sm">
                            <span className="text-xs text-tertiary font-medium uppercase tracking-wider">Assets</span>
                            <button
                                className="icon-btn-ghost text-accent"
                                onClick={() => setShowAddTokenModal(true)}
                                title="Add Custom Token"
                                style={{ padding: '4px' }}
                            >
                                <PlusIcon size={18} />
                            </button>
                        </div>
                        <div className="token-list px-md">
                            {/* 1. NATIVE TOKEN - ALWAYS INSTANT & SEPARATE */}
                            <TokenItem
                                key="OCT-NATIVE"
                                token={{
                                    symbol: 'OCT',
                                    name: 'Octra',
                                    balance: displayBalance,
                                    isNative: true,
                                    logoType: 'native',
                                    price: priceMap.get('OCT')?.price || 0,
                                    change24h: priceMap.get('OCT')?.change24h ?? 0
                                }}
                                onClick={() => onTokenClick({ symbol: 'OCT', name: 'Octra', isNative: true, balance: displayBalance })}
                                hideBalance={isBalanceHidden}
                            />

                            {/* 2. OTHER TOKENS (OCS01 / CUSTOM) */}
                            {tokensWithPrices.filter((t: Token) => !t.isNative).map((token: Token & { price?: number }) => (
                                <TokenItem
                                    key={token.contractAddress || token.symbol}
                                    token={token}
                                    onClick={() => onTokenClick(token)}
                                    hideBalance={isBalanceHidden}
                                />
                            ))}
                            {/* 3. SKELETON FOR OTHER ASSETS ONLY - APPEARS BELOW NATIVE */}
                            {isLoadingTokens && tokens.filter((t: Token) => !t.isNative).length === 0 && (
                                [1, 2].map((i) => (
                                    <div key={`skel-${i}`} className="flex items-center gap-sm p-sm" style={{ opacity: 0.6 }}>
                                        <div className="skeleton" style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0 }} />
                                        <div className="flex-1 flex flex-col gap-xs">
                                            <div className="skeleton" style={{ width: '40px', height: '12px' }} />
                                            <div className="skeleton" style={{ width: '30px', height: '8px' }} />
                                        </div>
                                        <div className="skeleton" style={{ width: '40px', height: '12px' }} />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'nft' && (
                    <div className="empty-state flex flex-col items-center py-3xl">
                        <div style={{ marginBottom: '16px', opacity: 0.8, color: 'var(--text-tertiary)' }}>
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
                        <p>No NFTs yet</p>
                        <span className="text-tertiary text-sm">Your NFTs will appear here</span>
                    </div>
                )}
            </div>

            {/* Add Token Modal */}
            <AddCustomTokenModal
                isOpen={showAddTokenModal}
                onClose={() => setShowAddTokenModal(false)}
                wallet={wallet}
                onSuccess={onRefresh}
            />
        </>
    );
}
