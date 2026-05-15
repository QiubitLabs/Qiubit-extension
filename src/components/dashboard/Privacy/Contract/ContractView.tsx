import { ContractIcon } from '../../../shared/Icons';

interface ContractViewProps {
    activeView: string;
    wallet: any;
    formData: { amount: string; recipient: string; contractData: string };
    isSubmitting: boolean;
    onFormChange: (key: string, value: string) => void;
    onSubmit: (e?: React.FormEvent) => void;
    onBack?: () => void;
}

export function ContractView({
    activeView: _activeView,
    wallet: _wallet,
    formData,
    isSubmitting,
    onFormChange,
    onSubmit,
    onBack: _onBack
}: ContractViewProps) {
    return (
        <div className="action-form-view animate-slide-in contract">
            <header className="view-header-minimal mb-lg">
                <div className="flex items-center gap-sm">
                    <ContractIcon size={18} className="text-accent" />
                    <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider">
                        Smart Contract Management
                    </h3>
                </div>
            </header>

            <form onSubmit={onSubmit} className="action-form">
                <div className="form-info-box mb-lg">
                    <div className="info-row">
                        <span className="info-label">Action:</span>
                        <span className="info-value font-mono">
                            Call FHE Contract
                        </span>
                    </div>
                </div>

                <div className="form-group mb-lg">
                    <label className="form-label mb-sm">Contract Address</label>
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
                    <label className="form-label mb-sm">Contract Data (Hex)</label>
                    <div className="amount-input-wrapper">
                        <textarea
                            className="input-field amount"
                            placeholder="0x..."
                            value={formData.contractData || ''}
                            onChange={e => onFormChange('contractData', e.target.value)}
                            rows={3}
                            required
                            disabled={isSubmitting}
                            style={{ resize: 'none', height: '80px', padding: '12px' }}
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className={`btn-action-submit w-full py-md rounded-xl font-semibold transition-all ${isSubmitting ? 'loading' : ''}`}
                    disabled={isSubmitting || !formData.recipient || !formData.contractData}
                >
                    {isSubmitting ? 'Executing...' : `Execute Contract`}
                </button>
            </form>
        </div>
    );
}
