import { formatAmount } from '../../../../utils/crypto';
import { UnshieldIcon, QiubitTokenLogo, CheckIcon } from '../../../shared/Icons';
import './UnshieldView.css';

interface UnshieldViewProps {
    activeView: string;
    tokenBalances: any[];
    selectedToken: any;
    formData: { amount: string };
    isSubmitting: boolean;
    onTokenSelect: (token: any) => void;
    onAmountChange: (value: string) => void;
    onSetMax: (value: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
}

export function UnshieldView({
    activeView,
    tokenBalances,
    selectedToken,
    formData,
    isSubmitting,
    onTokenSelect,
    onAmountChange,
    onSetMax,
    onSubmit
}: UnshieldViewProps) {
    const isList = activeView === 'unshield_list';
    const displayTokens = tokenBalances.filter((t: any) => t.encryptedBalance > 0);

    if (isList) {
        return (
            <div className="token-list-view animate-slide-in">
                <header className="view-header-minimal mb-lg">
                    <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">Select Token to Unshield</h3>
                </header>
                {displayTokens.length === 0 ? (
                    <div className="empty-state py-xl">
                        <p className="text-secondary">No eligible tokens found for unshielding.</p>
                    </div>
                ) : (
                    <div className="token-items-grid">
                        {displayTokens.map((token: any) => (
                            <button
                                key={token.symbol}
                                className="token-select-item"
                                onClick={() => onTokenSelect(token)}
                            >
                                <div className="token-icon-wrapper">
                                    {token.logoUrl ? (
                                        <img src={token.logoUrl} alt={token.symbol} style={{ width: 26, height: 26, objectFit: 'contain' }} />
                                    ) : token.isNative ? (
                                        <QiubitTokenLogo size={26} />
                                    ) : (
                                        <UnshieldIcon size={26} />
                                    )}
                                </div>
                                <div className="token-info">
                                    <div className="token-name-row">
                                        <span className="token-sym">{token.symbol}</span>
                                        {token.verified && <CheckIcon size={12} className="text-accent" />}
                                    </div>
                                    <span className="token-name">{token.name}</span>
                                </div>
                                <div className="token-balance-col">
                                    <span className="token-bal-amount">{formatAmount(token.encryptedBalance)}</span>
                                    <span className="text-xs text-secondary">{token.symbol} (Encrypted)</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const maxAmount = selectedToken?.encryptedBalance || 0;

    return (
        <div className="action-form-view animate-slide-in unshield">
            <header className="view-header-minimal mb-lg">
                <div className="flex items-center gap-sm">
                    <UnshieldIcon size={22} className="text-secondary" />
                    <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">
                        Unshield {selectedToken?.symbol}
                    </h3>
                </div>
            </header>

            <form onSubmit={onSubmit} className="action-form">
                <div className="form-info-box mb-lg">
                    <div className="info-row">
                        <span className="info-label">Encrypted:</span>
                        <span className="info-value font-mono">
                            {formatAmount(maxAmount)} {selectedToken?.symbol}
                        </span>
                    </div>
                </div>

                <div className="form-group mb-xl">
                    <label className="form-label mb-sm">Amount</label>
                    <div className="amount-input-wrapper">
                        <input
                            type="number"
                            className="input-field amount"
                            placeholder="0.00"
                            value={formData.amount}
                            onChange={e => onAmountChange(e.target.value)}
                            step="0.000001"
                            min="0.000001"
                            max={maxAmount}
                            required
                            disabled={isSubmitting}
                        />
                        <button
                            type="button"
                            className="max-btn-link"
                            onClick={() => onSetMax(String(maxAmount))}
                        >
                            MAX
                        </button>
                    </div>
                </div>

                <button
                    type="submit"
                    className={`btn-action-submit w-full py-md rounded-xl font-semibold transition-all ${isSubmitting ? 'loading' : ''}`}
                    disabled={isSubmitting || !formData.amount}
                >
                    {isSubmitting ? 'Processing...' : `Unshield ${selectedToken?.symbol}`}
                </button>
            </form>
        </div>
    );
}
