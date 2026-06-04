import '../NetworkFeeSheet/NetworkFeeSheet.css';
import { CloseIcon, CheckIcon } from '../../shared/Icons';

export type OctraFeeSpeed = 'slow' | 'normal' | 'fast' | 'custom';

export interface OctraFeeEstimates {
    slow: number;
    medium: number;
    fast: number;
}

interface OctraFeeSheetProps {
    show: boolean;
    onClose: () => void;
    feeSpeed: OctraFeeSpeed;
    setFeeSpeed: (speed: OctraFeeSpeed) => void;
    feeEstimates: OctraFeeEstimates;
    customFee: string;
    setCustomFee: (v: string) => void;
}

const SPEED_META = [
    { key: 'slow'   as const, label: 'Slow',   desc: 'Lower priority',  amount: (e: OctraFeeEstimates) => e.slow   },
    { key: 'normal' as const, label: 'Normal', desc: 'Recommended',      amount: (e: OctraFeeEstimates) => e.medium },
    { key: 'fast'   as const, label: 'Fast',   desc: 'Higher priority',  amount: (e: OctraFeeEstimates) => e.fast   },
];

export function OctraFeeSheet({
    show,
    onClose,
    feeSpeed,
    setFeeSpeed,
    feeEstimates,
    customFee,
    setCustomFee,
}: OctraFeeSheetProps) {
    if (!show) return null;

    return (
        <div className="nfs-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="nfs-header">
                <span className="nfs-title">Network Fee (OCT)</span>
                <button className="nfs-close" onClick={onClose} aria-label="Close">
                    <CloseIcon size={14} />
                </button>
            </div>

            <div className="nfs-body">
                {SPEED_META.map(({ key, label, desc, amount }) => (
                    <button
                        key={key}
                        className={`nfs-option ${feeSpeed === key ? 'active' : ''}`}
                        onClick={() => { setFeeSpeed(key); onClose(); }}
                    >
                        <div className="nfs-meta">
                            <span className="nfs-name">{label}</span>
                            <span className="nfs-desc">{desc}</span>
                        </div>
                        <div className="nfs-pricing">
                            <span className="nfs-price-primary">{amount(feeEstimates).toFixed(4)} OCT</span>
                        </div>
                        <div className="nfs-check">
                            {feeSpeed === key && <CheckIcon size={11} />}
                        </div>
                    </button>
                ))}

                <button
                    className={`nfs-option ${feeSpeed === 'custom' ? 'active' : ''}`}
                    onClick={() => setFeeSpeed('custom')}
                >
                    <div className="nfs-meta">
                        <span className="nfs-name">Custom</span>
                        <span className="nfs-desc">Set your own fee</span>
                    </div>
                    <div className="nfs-check">
                        {feeSpeed === 'custom' && <CheckIcon size={11} />}
                    </div>
                </button>

                {feeSpeed === 'custom' && (
                    <div className="nfs-custom-wrap">
                        <div className="nfs-custom-row">
                            <input
                                type="number"
                                className="nfs-custom-input"
                                value={customFee}
                                onChange={(e) => setCustomFee(e.target.value)}
                                placeholder="0.02"
                                step="0.001"
                                min="0.001"
                                autoFocus
                            />
                            <span className="nfs-custom-suffix">OCT</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
