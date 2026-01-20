import { useState } from 'react';
import { CloseIcon } from '../../shared/Icons';
import { isValidAddress } from '../../../utils/crypto';
import { ocs01Manager } from '../../../services/OCS01TokenService';

export function AddCustomTokenModal({ isOpen, onClose, rpcClient, onSuccess, wallet }) {
    const [contractAddress, setContractAddress] = useState('');
    const [symbol, setSymbol] = useState('');
    const [name, setName] = useState('');
    const [decimals, setDecimals] = useState('6');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setError('');

        if (!contractAddress.trim()) {
            setError('Contract address is required');
            return;
        }

        if (!isValidAddress(contractAddress.trim())) {
            setError('Invalid contract address');
            return;
        }

        if (!symbol.trim()) {
            setError('Token symbol is required');
            return;
        }

        if (!wallet?.address) {
            setError('Wallet not connected');
            return;
        }

        setLoading(true);
        try {
            // Add to manager (persists to localStorage)
            ocs01Manager.addUserContract(wallet.address, contractAddress.trim());

            // Reset form
            setContractAddress('');
            setSymbol('');
            setName('');
            setDecimals('6');
            setError('');

            onSuccess?.();
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to add token');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="text-lg font-semibold">Add Custom Token</h3>
                    <button className="modal-close" onClick={onClose}>
                        <CloseIcon size={20} />
                    </button>
                </div>

                <div className="form-group">
                    <label className="form-label">Contract Address</label>
                    <input
                        type="text"
                        className="input input-mono"
                        value={contractAddress}
                        onChange={(e) => setContractAddress(e.target.value)}
                        placeholder="octra1..."
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Token Symbol</label>
                    <input
                        type="text"
                        className="input"
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value.slice(0, 10))}
                        placeholder="e.g. USDT"
                        maxLength={10}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Token Name (Optional)</label>
                    <input
                        type="text"
                        className="input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Tether USD"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Decimals</label>
                    <input
                        type="number"
                        className="input"
                        value={decimals}
                        onChange={(e) => setDecimals(e.target.value)}
                        placeholder="6"
                        min="0"
                        max="18"
                    />
                </div>

                {error && <p className="text-error text-sm mb-lg">{error}</p>}

                <button
                    className="btn btn-primary btn-lg btn-full"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? <span className="loading-spinner" /> : 'Add Token'}
                </button>
            </div>
        </div>
    );
}
