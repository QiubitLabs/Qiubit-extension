import { useState, useEffect } from 'react';

import { ocs01Manager, KNOWN_CONTRACTS } from '../../../services/features/OCS01TokenService';
import { RefreshIcon, CheckIcon, ContractIcon, GenericTokenIcon } from '../../shared/Icons';

export interface OCS01Token {
    contractAddress: string;
    contractName: string;
    balance: number | string;
    verified: boolean;
    isCustom: boolean;
    [key: string]: any;
}

export interface OCS01TokenListProps {
    walletAddress: string;
    network?: string;
    hideBalance?: boolean;
}

/**
 * OCS01 Token List Component
 * Displays user's OCS01 token balances and allows claiming
 */
export function OCS01TokenList({ walletAddress, network = 'testnet', hideBalance = false }: OCS01TokenListProps) {
    const [tokens, setTokens] = useState<OCS01Token[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        loadTokenBalances();
    }, [walletAddress, network]);

    const loadTokenBalances = async () => {
        if (!walletAddress) return;

        setIsLoading(true);
        try {
            const balances = await ocs01Manager.getUserTokenBalances(walletAddress, network);
            setTokens(balances as OCS01Token[]);
        } catch (error) {
            console.error('Failed to load token balances:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="ocs01-loading">
                <div className="loading-spinner" style={{ width: 24, height: 24 }} />
                <span>Loading tokens...</span>
            </div>
        );
    }

    return (
        <div className="ocs01-token-section">
            <div className="ocs01-header">
                <h4 className="ocs01-title">
                    <GenericTokenIcon size={18} />
                    OCS01 Tokens
                </h4>
                <button
                    className="btn btn-xs btn-outline gap-xs"
                    onClick={loadTokenBalances}
                    disabled={isLoading}
                >
                    <RefreshIcon size={12} /> Refresh
                </button>
            </div>

            {tokens.length > 0 ? (
                <div className="ocs01-token-list">
                    {tokens.map((token) => (
                        <div key={token.contractAddress} className="ocs01-token-item">
                            <div className="ocs01-token-info">
                                <div className="ocs01-token-icon">
                                    {token.verified ? <CheckIcon size={12} className="text-success" /> : '?'}
                                </div>
                                <div className="ocs01-token-details">
                                    <span className="ocs01-token-name">{token.contractName}</span>
                                    <span className="ocs01-token-address">
                                        {token.contractAddress.slice(0, 8)}...{token.contractAddress.slice(-6)}
                                    </span>
                                </div>
                            </div>
                            <div className="ocs01-token-balance">
                                {hideBalance ? '****' : token.balance}
                                <span className="ocs01-token-symbol">credits</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="ocs01-empty">
                    <p className="text-secondary">No OCS01 tokens found</p>
                </div>
            )}
        </div>
    );
}

export interface OCS01ContractExplorerProps {
    walletAddress: string;
    network?: string;
}

interface Contract {
    address: string;
    name: string;
    verified: boolean;
    methods: {
        view: string[];
        call: string[];
    };
    [key: string]: any;
}

interface MethodResult {
    success: boolean;
    result?: any;
    error?: string;
    [key: string]: any;
}

/**
 * OCS01 Contract Explorer
 * Explore and interact with OCS01 contracts
 */
export function OCS01ContractExplorer({ walletAddress, network = 'testnet' }: OCS01ContractExplorerProps) {
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    const [methodResult, setMethodResult] = useState<MethodResult | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const contracts: Contract[] = (KNOWN_CONTRACTS as any)[network] || [];

    const handleCallMethod = async (methodName: string) => {
        if (!selectedContract) return;

        setIsLoading(true);
        setMethodResult(null);

        try {
            const contract = ocs01Manager.getContract(selectedContract.address, network);
            let result: any;

            switch (methodName) {
                case 'greetCaller':
                    result = await contract.greetCaller(walletAddress);
                    break;
                case 'getSpec':
                    result = await contract.getSpec(walletAddress);
                    break;
                case 'getCredits':
                    result = await contract.getCredits(walletAddress, walletAddress);
                    break;
                default:
                    result = { success: false, error: 'Unknown method' };
            }

            setMethodResult(result);
        } catch (error: any) {
            setMethodResult({ success: false, error: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="ocs01-explorer">
            <div className="explorer-header">
                <h4 className="explorer-title flex items-center gap-xs">
                    <ContractIcon size={18} /> Contract Explorer
                </h4>
            </div>

            {contracts.length > 0 ? (
                <>
                    <div className="contract-select">
                        <select
                            className="input"
                            value={selectedContract?.address || ''}
                            onChange={(e) => {
                                const contract = contracts.find(c => c.address === e.target.value);
                                setSelectedContract(contract || null);
                                setMethodResult(null);
                            }}
                        >
                            <option value="">Select a contract...</option>
                            {contracts.map((c) => (
                                <option key={c.address} value={c.address}>
                                    {c.name} {c.verified && '(verified)'}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedContract && (
                        <div className="contract-methods">
                            <p className="methods-label">View Methods:</p>
                            <div className="methods-grid">
                                {selectedContract.methods?.view?.map((method) => (
                                    <button
                                        key={method}
                                        className="btn btn-xs btn-outline"
                                        onClick={() => handleCallMethod(method)}
                                        disabled={isLoading}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {methodResult && (
                        <div className={`method-result ${methodResult.success ? 'success' : 'error'}`}>
                            <span className="result-label">Result:</span>
                            <span className="result-value">
                                {methodResult.success ? String(methodResult.result) : methodResult.error}
                            </span>
                        </div>
                    )}
                </>
            ) : (
                <div className="explorer-empty">
                    <p className="text-secondary">No contracts available on {network}</p>
                </div>
            )}
        </div>
    );
}
