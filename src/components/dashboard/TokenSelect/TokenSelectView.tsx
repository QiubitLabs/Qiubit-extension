import { useState, useEffect } from 'react';
import { formatAmount } from '../../../utils/crypto';
import { getCachedPrices, getMultipleTokenPrices, formatUsd, formatPrice } from '../../../services/network/PriceService';
import { ChevronLeftIcon, SearchIcon } from '../../shared/Icons';
import { TokenIcon } from '../../shared/TokenIcon';
import './TokenSelect.css';
import { Token } from '../../../types';

interface TokenSelectViewProps {
    tokens: Token[];
    onSelect: (token: Token) => void;
    onBack: () => void;
}

export function TokenSelectView({ tokens, onSelect, onBack }: TokenSelectViewProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [priceMap, setPriceMap] = useState<Map<string, { price: number; change24h: number }>>(
        () => getCachedPrices()
    );

    useEffect(() => {
        const symbols = tokens.map(t => t.symbol);
        getMultipleTokenPrices(symbols).then(map => {
            if (map.size > 0) setPriceMap(prev => new Map([...prev, ...map]));
        });
    }, [tokens]);

    const filteredTokens = tokens.filter(token =>
        token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        token.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="token-select-view animate-fade-in">
            <div className="flex items-center gap-md mb-lg">
                <button className="header-icon-btn" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <h2 className="text-lg font-semibold">Select Token</h2>
            </div>

            {/* Search Input */}
            <div className="token-search">
                <div className="token-search-input">
                    <SearchIcon size={16} className="token-search-icon" />
                    <input
                        type="text"
                        placeholder="Search tokens..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            <div className="token-select-list">
                {filteredTokens.length === 0 ? (
                    <div className="token-select-empty">
                        <p>No tokens found</p>
                    </div>
                ) : (
                    filteredTokens.map((token) => {
                        const priceData = token.isTestnet ? null : priceMap.get(token.symbol);
                        const price = priceData?.price ?? 0;
                        const bal = typeof token.balance === 'string' ? parseFloat(token.balance) : token.balance;
                        const usdValue = price * bal;

                        return (
                            <button
                                key={token.symbol}
                                className="token-select-item"
                                onClick={() => onSelect(token)}
                            >
                                <div className="token-select-icon">
                                    <TokenIcon
                                        symbol={token.symbol}
                                        logoUrl={token.logoUrl}
                                        size={32}
                                        contractAddress={token.contractAddress}
                                        chainId={token.chainId}
                                    />
                                </div>
                                <div className="token-select-info">
                                    <span className="token-select-symbol">{token.symbol}</span>
                                    <span className="token-select-balance-text">{formatAmount(token.balance)}</span>
                                </div>
                                <div className="token-select-market">
                                    <span className="token-market-value">{formatUsd(usdValue)}</span>
                                    <span className="token-market-price">{formatPrice(price)}</span>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}
