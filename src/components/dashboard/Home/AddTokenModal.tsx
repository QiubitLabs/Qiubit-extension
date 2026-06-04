import { useState } from 'react';
import { fetchTokenMetadata, addCustomToken, CustomToken } from '../../../services/features/CustomTokenService';
import { ocs01Manager, OCS01UserToken } from '../../../services/features/OCS01TokenService';
import { NETWORK_REGISTRY } from '../../../constants/networks/registry';
import { isValidAddress } from '../../../utils/validation';
import { TokenIcon } from '../../shared/TokenIcon';
import { ethers } from 'ethers';

interface AddTokenModalProps {
    walletAddress: string;
    initialChainId?: number;
    onAdded: () => void;
    onClose: () => void;
}

type NetworkOption = { chainId: number; name: string; isOctra?: boolean };

const EVM_NETWORKS: NetworkOption[] = Object.values(NETWORK_REGISTRY)
    .filter(n => n.isEVM && n.chainId != null)
    .map(n => ({ chainId: n.chainId as number, name: n.displayName }));

export function AddTokenModal({ walletAddress, onAdded, onClose }: AddTokenModalProps) {
    const [contractInput, setContractInput] = useState('');
    const [resolvedChainId, setResolvedChainId] = useState<number | null>(null);
    const [isOctra, setIsOctra] = useState(false);
    const [evmPreview, setEvmPreview] = useState<Omit<CustomToken, 'addedAt'> | null>(null);
    const [octraPreview, setOctraPreview] = useState<OCS01UserToken | null>(null);
    const [isLooking, setIsLooking] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleLookup = async () => {
        const addr = contractInput.trim();
        if (!addr) return;
        setError('');
        setEvmPreview(null);
        setOctraPreview(null);
        setResolvedChainId(null);
        setIsOctra(false);
        setIsLooking(true);

        try {
            if (addr.toLowerCase().startsWith('oct')) {
                if (!isValidAddress(addr)) {
                    throw new Error('Invalid Octra address (must start with oct…)');
                }
                const meta = await ocs01Manager.lookupToken(addr, walletAddress);
                if (!meta) {
                    throw new Error('Token not found or contract does not implement OCS-01 standard');
                }
                setOctraPreview(meta);
                setIsOctra(true);
            } else {
                // EVM contract lookup
                if (!ethers.isAddress(addr)) {
                    throw new Error('Invalid contract address format');
                }
                
                // Query all EVM RPCs in parallel to automatically resolve the network
                const promises = EVM_NETWORKS.map(async (net) => {
                    try {
                        const meta = await fetchTokenMetadata(addr, net.chainId);
                        if (meta && meta.symbol && meta.decimals) {
                            return { meta, net };
                        }
                    } catch {
                        return null;
                    }
                    return null;
                });
                
                const results = await Promise.all(promises);
                const match = results.find(r => r !== null);
                
                if (!match) {
                    throw new Error('Token contract could not be found on any supported networks');
                }
                
                setEvmPreview(match.meta);
                setResolvedChainId(match.net.chainId);
                setIsOctra(false);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not fetch token info');
        } finally {
            setIsLooking(false);
        }
    };

    const handleAdd = async () => {
        setIsSaving(true);
        try {
            if (isOctra && octraPreview) {
                await ocs01Manager.addUserContract(walletAddress, octraPreview);
            } else if (evmPreview) {
                await addCustomToken(walletAddress, { ...evmPreview, addedAt: Date.now() });
            }
            onAdded();
            onClose();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to save token');
        } finally {
            setIsSaving(false);
        }
    };

    const hasPreview = isOctra ? !!octraPreview : !!evmPreview;
    const preview = isOctra ? octraPreview : evmPreview;

    return (
        <div className="atm-overlay" onClick={onClose}>
            <div className="atm-sheet" onClick={e => e.stopPropagation()}>
                <div className="atm-header">
                    <span>Add Token</span>
                    <button className="atm-close" onClick={onClose}>✕</button>
                </div>

                <div className="atm-body">
                    <label className="atm-label">Contract Address</label>
                    <div className="atm-input-row">
                        <input
                            className="atm-input"
                            placeholder="Enter contract address (e.g. 0x… or oct…)"
                            value={contractInput}
                            onChange={e => {
                                setContractInput(e.target.value);
                                setEvmPreview(null);
                                setOctraPreview(null);
                                setResolvedChainId(null);
                                setIsOctra(false);
                                setError('');
                            }}
                            spellCheck={false}
                        />
                        <button
                            className="atm-lookup-btn"
                            onClick={handleLookup}
                            disabled={isLooking || !contractInput.trim()}
                        >
                            {isLooking ? <span className="atm-spin" /> : 'Lookup'}
                        </button>
                    </div>

                    {error && <div className="atm-error">{error}</div>}

                    {preview && (
                        <div className="atm-preview">
                            <TokenIcon 
                                symbol={preview.symbol} 
                                size={36} 
                                contractAddress={(preview as any).contractAddress || (preview as any).address}
                                logoUrl={(preview as any).logoUrl}
                            />
                            <div className="atm-preview-info">
                                <span className="atm-preview-symbol">
                                    {preview.symbol}
                                    <span className="atm-preview-badge" style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)' }}>
                                        {isOctra ? 'Octra Network' : (EVM_NETWORKS.find(n => n.chainId === resolvedChainId)?.name || 'EVM Network')}
                                    </span>
                                </span>
                                <span className="atm-preview-name">{preview.name}</span>
                                <span className="atm-preview-dec">{preview.decimals} decimals</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="atm-footer">
                    <button className="atm-btn-cancel" onClick={onClose}>Cancel</button>
                    <button
                        className="atm-btn-add"
                        onClick={handleAdd}
                        disabled={!hasPreview || isSaving}
                    >
                        {isSaving ? <span className="atm-spin" /> : 'Add Token'}
                    </button>
                </div>
            </div>
        </div>
    );
}
