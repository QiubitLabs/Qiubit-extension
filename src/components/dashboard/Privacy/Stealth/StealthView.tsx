import { formatAmount } from '../../../../utils/crypto';
import { QiubitTokenLogo, CheckIcon, CloseIcon, ChevronLeftIcon, EyeOffIcon } from '../../../shared/Icons';
import { TokenIcon } from '../../../shared/TokenIcon';

interface StealthViewProps {
    activeView: string;
    wallet: any;
    tokenBalances: any[];
    selectedToken: any;
    formData: { amount: string; recipient: string };
    isSubmitting: boolean;
    onTokenSelect: (token: any) => void;
    onFormChange: (key: string, value: string) => void;
    onSetMax: (value: string) => void;
    onReview?: (e?: React.FormEvent) => void;
    onSubmit: (e?: React.FormEvent) => void;
    onBack?: () => void;
}

export function StealthView({
    activeView,
    wallet,
    tokenBalances,
    selectedToken,
    formData,
    isSubmitting,
    onTokenSelect,
    onFormChange,
    onSetMax,
    onReview,
    onSubmit,
    onBack
}: StealthViewProps) {
    const isList = activeView === 'stealth_list';
    // For Stealth, maybe we can use public balance or encrypted balance. Let's assume public tokens for now.
    const displayTokens = tokenBalances.filter((t: any) => t.balance > 0);

    if (isList) {
        return (
            <div className="token-list-view animate-slide-in">
                <header className="view-header-minimal mb-lg">
                    <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">Select Token for Stealth Transfer</h3>
                </header>
                {displayTokens.length === 0 ? (
                    <div className="empty-state py-xl">
                        <p className="text-secondary">No eligible tokens found for stealth transfer.</p>
                    </div>
                ) : (
                    <div className="token-items-grid">
                        {displayTokens.map((token: any) => (
                            <button
                                key={token.symbol}
                                className="token-select-item"
                                onClick={() => onTokenSelect(token)}
                            >
                                <div className="privacy-token-icon-wrapper">
                                    {token.isNative ? <QiubitTokenLogo size={22} /> : <EyeOffIcon size={22} />}
                                </div>
                                <div className="token-info">
                                    <div className="token-name-row">
                                        <span className="token-sym">{token.symbol}</span>
                                        {token.verified && <CheckIcon size={12} className="text-accent" />}
                                    </div>
                                    <span className="token-name">{token.name}</span>
                                </div>
                                <div className="token-balance-col">
                                    <span className="token-bal-amount">{formatAmount(token.balance)}</span>
                                    <span className="text-xs text-secondary">{token.symbol}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const maxAmount = selectedToken?.balance || 0;

    if (activeView === 'stealth_confirm') {
        const fee = 0.01; 

        return (
            <div className="confirm-tx-page animate-fade-in relative">
                <div className="flex items-center justify-between mb-xl">
                    <button className="header-icon-btn" onClick={onBack} style={{ border: 'none', background: 'transparent' }}>
                        <ChevronLeftIcon size={24} />
                    </button>
                    <div className="flex items-center justify-center gap-xs flex-1 bg-surface px-md py-1 rounded-full mx-auto" style={{ maxWidth: 'fit-content' }}>
                        <EyeOffIcon size={16} />
                        <span className="font-bold text-sm tracking-wide">Stealth {selectedToken?.symbol}</span>
                    </div>
                    <button className="header-icon-btn" onClick={onBack} style={{ border: 'none', background: 'transparent' }}>
                        <CloseIcon size={24} />
                    </button>
                </div>

                <div className="confirm-v2-title">
                    Confirm <span className="confirm-v2-title-highlight">Stealth Transfer</span>
                </div>

                <div className="confirm-v2-amount-row">
                    {selectedToken && (
                        <TokenIcon symbol={selectedToken.symbol} size={40} />
                    )}
                    <span className="confirm-v2-amount-val">{formData.amount ? parseFloat(formData.amount) : '0'}</span>
                    <span className="confirm-v2-amount-sym">{selectedToken?.symbol}</span>
                </div>

                <div className="confirm-v2-details">
                    <div className="confirm-v2-row align-top p-b-md">
                        <span className="confirm-v2-label">From</span>
                        <div className="confirm-v2-value-col">
                            <span className="confirm-v2-address">{wallet?.address}</span>
                            <span className="confirm-v2-wallet-badge">{wallet?.name || 'Wallet 01 - Akun 01'}</span>
                        </div>
                    </div>

                    <div className="confirm-v2-row align-top p-b-md border-b">
                        <span className="confirm-v2-label">To (Stealth Address)</span>
                        <div className="confirm-v2-value-col">
                            <span className="confirm-v2-address">{formData.recipient}</span>
                        </div>
                    </div>

                    <div className="confirm-v2-row align-center py-md border-b" style={{ cursor: 'pointer' }}>
                        <span className="confirm-v2-label">Network Fee</span>
                        <span className="confirm-v2-value">{fee} {selectedToken?.symbol}</span>
                    </div>
                </div>

                <div className="confirm-v2-btn-wrapper mt-auto pt-xl">
                    <button 
                        className={`confirm-v2-btn ${isSubmitting ? 'loading' : ''}`}
                        style={{ background: 'var(--accent-primary)', color: '#000', cursor: 'pointer', opacity: isSubmitting ? 0.7 : 1 }}
                        onClick={onSubmit} 
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Sending Stealthly...' : 'Confirm'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="action-form-view animate-slide-in stealth">
            <header className="view-header-minimal mb-lg">
                <div className="flex items-center gap-sm">
                    <EyeOffIcon size={18} className="text-accent" />
                    <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">
                        Stealth Transfer {selectedToken?.symbol}
                    </h3>
                </div>
            </header>

            <form onSubmit={onSubmit} className="action-form">
                <div className="form-info-box mb-lg">
                    <div className="info-row">
                        <span className="info-label">Available:</span>
                        <span className="info-value font-mono">
                            {formatAmount(maxAmount)} {selectedToken?.symbol}
                        </span>
                    </div>
                </div>

                <div className="form-group mb-lg">
                    <label className="form-label mb-sm">Recipient Address</label>
                    <input
                        type="text"
                        className="input-field"
                        placeholder="octXXX..."
                        value={formData.recipient}
                        onChange={e => onFormChange('recipient', e.target.value)}
                        required
                        disabled={isSubmitting}
                    />
                </div>

                <div className="form-group mb-xl">
                    <label className="form-label mb-sm">Amount</label>
                    <div className="amount-input-wrapper">
                        <input
                            type="number"
                            className="input-field amount"
                            placeholder="0.00"
                            value={formData.amount}
                            onChange={e => onFormChange('amount', e.target.value)}
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
                    type={onReview ? 'button' : 'submit'}
                    onClick={(e) => onReview ? onReview(e) : onSubmit(e)}
                    className={`btn-action-submit w-full py-md rounded-xl font-semibold transition-all ${isSubmitting ? 'loading' : ''}`}
                    disabled={isSubmitting || !formData.amount || !formData.recipient}
                >
                    {isSubmitting ? 'Processing...' : `Review Stealth Transfer`}
                </button>
            </form>
        </div>
    );
}
