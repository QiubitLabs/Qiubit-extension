import { useState } from 'react';
import { formatAmount } from '../../../utils/crypto';
import { ChevronLeftIcon, SearchIcon } from '../../shared/Icons';
import { TokenIcon } from '../../shared/TokenIcon';
import './TokenSelect.css';

export function TokenSelectView({ tokens, onSelect, onBack }) {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter tokens based on search
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
                    filteredTokens.map((token) => (
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
                                />
                            </div>
                            <div className="token-select-info">
                                <span className="token-select-symbol">{token.symbol}</span>
                                <span className="token-select-balance-text">{formatAmount(token.balance)}</span>
                            </div>
                            <div className="token-select-market">
                                <span className="token-market-value">$0.00</span>
                                <span className="token-market-price">-</span>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
