import { useState, useEffect } from 'react';
import { ChevronLeftIcon, LockIcon, CheckIcon } from '../../shared/Icons';
import { AUTO_LOCK_DURATIONS, type AutoLockDuration, SessionService } from '../../../services/core/SessionService';
import './AutoLockSettings.css';

const LOCK_OPTIONS: { key: AutoLockDuration; label: string }[] = [
    { key: '3min', label: '3 minutes' },
    { key: '5min', label: '5 minutes' },
    { key: '10min', label: '10 minutes' },
    { key: '15min', label: '15 minutes' },
];

interface AutoLockSettingsProps {
    onBack: () => void;
}

export function AutoLockSettings({ onBack }: AutoLockSettingsProps) {
    const [selected, setSelected] = useState<AutoLockDuration>('5min');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Resolve current duration to the closest key
        const currentMs = SessionService.getAutoLockDuration();
        const match = (Object.entries(AUTO_LOCK_DURATIONS) as [AutoLockDuration, number][])
            .find(([, ms]) => ms === currentMs);
        if (match) setSelected(match[0]);
    }, []);

    const handleSelect = async (key: AutoLockDuration) => {
        if (key === selected) {
            onBack();
            return;
        }
        setSaving(true);
        setSelected(key);
        try {
            await SessionService.setAutoLockDuration(key);
            onBack();
        } catch (e) {
            console.error('Failed to set auto-lock:', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Auto-Lock</span>
                </div>
            </header>

            <div className="wallet-content animate-fade-in" style={{ paddingBottom: 0 }}>
                <div className="al-description">
                    <LockIcon size={16} />
                    <span>Wallet will automatically lock after closing if idle for the selected duration.</span>
                </div>

                <div className="al-options">
                    {LOCK_OPTIONS.map(({ key, label }) => (
                        <button
                            key={key}
                            className={`al-option ${selected === key ? 'active' : ''}`}
                            onClick={() => handleSelect(key)}
                            disabled={saving}
                        >
                            <span className="al-option-label">{label}</span>
                            {selected === key && (
                                <span className="al-option-check">
                                    <CheckIcon size={16} />
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}
