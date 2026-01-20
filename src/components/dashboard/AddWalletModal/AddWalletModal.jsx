import { useState } from 'react';
import { CloseIcon, PlusIcon, ImportIcon, KeyIcon } from '../../shared/Icons';

export function AddWalletModal({ onClose, onAddWallet }) {
    const [mode, setMode] = useState(null); // null | 'create' | 'import' | 'import_mnemonic'
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        setIsProcessing(true);
        setError('');
        try {
            await onAddWallet({ type: 'create' });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to create wallet');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImport = async (type) => { // type: 'import' or 'import_mnemonic'
        if (!inputValue.trim()) {
            setError(type === 'import' ? 'Please enter private key' : 'Please enter recovery phrase');
            return;
        }

        setIsProcessing(true);
        setError('');
        try {
            await onAddWallet({
                type,
                [type === 'import' ? 'privateKey' : 'mnemonic']: inputValue.trim()
            });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to import wallet');
        } finally {
            setIsProcessing(false);
        }
    };

    const reset = () => {
        setMode(null);
        setInputValue('');
        setError('');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content add-wallet-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="text-lg font-semibold">
                        {mode === null && 'Add Wallet'}
                        {mode === 'create' && 'Create New Wallet'}
                        {mode === 'import' && 'Import Wallet'}
                        {mode === 'import_mnemonic' && 'Import Wallet'}
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                {/* Step 1: Choose mode */}
                {mode === null && (
                    <div className="add-wallet-options">
                        <button className="add-wallet-option" onClick={() => setMode('create')}>
                            <div className="add-wallet-option-icon">
                                <PlusIcon size={24} />
                            </div>
                            <div className="add-wallet-option-info">
                                <span className="add-wallet-option-title">Create New Wallet</span>
                                <span className="add-wallet-option-desc">Generate a new wallet automatically</span>
                            </div>
                        </button>
                        <button className="add-wallet-option" onClick={() => setMode('import_mnemonic')}>
                            <div className="add-wallet-option-icon">
                                <ImportIcon size={24} />
                            </div>
                            <div className="add-wallet-option-info">
                                <span className="add-wallet-option-title">Import Recovery Phrase</span>
                                <span className="add-wallet-option-desc">Use 12-word recovery phrase</span>
                            </div>
                        </button>
                        <button className="add-wallet-option" onClick={() => setMode('import')}>
                            <div className="add-wallet-option-icon">
                                <KeyIcon size={24} />
                            </div>
                            <div className="add-wallet-option-info">
                                <span className="add-wallet-option-title">Import Private Key</span>
                                <span className="add-wallet-option-desc">Use existing private key</span>
                            </div>
                        </button>
                    </div>
                )}

                {/* Create Mode */}
                {mode === 'create' && (
                    <div className="add-wallet-form">
                        <p className="text-secondary text-sm mb-lg">
                            A new wallet will be created automatically. Make sure to backup the seed phrase from Settings later.
                        </p>
                        {error && <p className="text-error text-sm mb-lg">{error}</p>}
                        <div className="flex gap-md">
                            <button
                                className="btn btn-secondary flex-1"
                                onClick={reset}
                                disabled={isProcessing}
                            >
                                Back
                            </button>
                            <button
                                className="btn btn-primary flex-1"
                                onClick={handleCreate}
                                disabled={isProcessing}
                            >
                                {isProcessing ? 'Creating...' : 'Create Wallet'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Import Modes */}
                {(mode === 'import' || mode === 'import_mnemonic') && (
                    <div className="add-wallet-form">
                        <div className="form-group">
                            <label className="form-label">
                                {mode === 'import' ? 'Private Key (Base64)' : 'Recovery Phrase (12 words)'}
                            </label>
                            <textarea
                                className="input input-mono"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder={mode === 'import' ? "Paste your private key..." : "word1 word2 word3 ..."}
                                rows={3}
                            />
                            {mode === 'import_mnemonic' && <p className="form-hint">Separate words with spaces</p>}
                        </div>
                        {error && <p className="text-error text-sm mb-lg">{error}</p>}
                        <div className="flex gap-md">
                            <button
                                className="btn btn-secondary flex-1"
                                onClick={reset}
                                disabled={isProcessing}
                            >
                                Back
                            </button>
                            <button
                                className="btn btn-primary flex-1"
                                onClick={() => handleImport(mode)}
                                disabled={isProcessing || !inputValue.trim()}
                            >
                                {isProcessing ? 'Importing...' : 'Import Wallet'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default AddWalletModal;
