import { formatAmount } from '../../../utils/crypto';
import { TokenIcon } from '../../shared/TokenIcon';
import './TokenItem.css';

export function TokenItem({ token, onClick, hideBalance }) {
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
                <div className="token-item-value-fiat">{hideBalance ? '****' : '$0.00'}</div>
                <div className="token-item-price">-</div>
            </div>
        </div>
    );
}
