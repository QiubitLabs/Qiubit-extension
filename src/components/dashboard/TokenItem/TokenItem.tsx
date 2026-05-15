import { formatAmount } from '../../../utils/crypto';
import { formatUsd, formatPrice } from '../../../services/network/PriceService';
import { TokenIcon } from '../../shared/TokenIcon';
import { Token } from '../../../types';
import './TokenItem.css';

interface TokenItemProps {
    token: Token & { price?: number; change24h?: number };
    onClick?: (token: Token) => void;
    hideBalance?: boolean;
}

export function TokenItem({ token, onClick, hideBalance }: TokenItemProps) {
    const price = token.price || 0;
    const usdValue = price * (typeof token.balance === 'string' ? parseFloat(token.balance) : token.balance);
    const change = token.change24h ?? 0;
    const changeColor = change > 0 ? '#00C853' : change < 0 ? '#FF5252' : 'var(--text-tertiary)';

    // Format: "$0.0521 (3.2%)" or just "$0.0521" if no change data
    const priceStr = price > 0 ? formatPrice(price) : null;
    const changeStr = change !== 0 ? `${change > 0 ? '+' : ''}${change.toFixed(2)}%` : null;
    const priceChangeText = priceStr
        ? changeStr ? `${priceStr} (${changeStr})` : priceStr
        : changeStr ?? '-';

    return (
        <div className="token-item" onClick={onClick ? () => onClick(token) : undefined}>
            <div className="token-item-icon">
                <TokenIcon
                    symbol={token.symbol}
                    logoUrl={token.logoUrl}
                    size={28}
                />
            </div>

            {/* Left: Info */}
            <div className="token-item-info">
                <div className="token-item-symbol">{token.symbol}</div>
                <div className="token-item-balance-text">
                    {hideBalance ? '****' : formatAmount(token.balance)}
                </div>
            </div>

            {/* Right: Market Data */}
            <div className="token-item-market">
                <div className="token-item-value-fiat">{hideBalance ? '****' : formatUsd(usdValue)}</div>
                <div className="token-item-price" style={{ color: changeColor, fontSize: 11 }}>{priceChangeText}</div>
            </div>
        </div>
    );
}
