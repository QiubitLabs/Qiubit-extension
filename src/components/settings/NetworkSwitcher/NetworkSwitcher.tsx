/**
 * Network Switcher Component
 * Shows NETWORK_REGISTRY entries + user-added networks (via wallet_addEthereumChain).
 */

import { useState, useEffect } from 'react';
import { ChevronLeftIcon } from '../../shared/Icons';
import { Settings } from '../../../types';
import { NETWORK_REGISTRY } from '../../../constants/networks/registry';
import { getUserNetworks, userNetworkToConfig, removeUserNetwork, type UserNetwork } from '../../../services/network/UserNetworkService';
import './NetworkSwitcher.css';

interface NetworkSwitcherProps {
    settings: Settings;
    onUpdateSettings: (settings: Settings) => void;
    onBack: () => void;
    onSwitchComplete?: (network: string) => void;
}

export function NetworkSwitcher({ settings, onUpdateSettings, onBack, onSwitchComplete }: NetworkSwitcherProps) {
    const rawNetwork: string = settings?.network || 'all';
    const currentNetwork = (rawNetwork === 'mainnet' || rawNetwork === 'testnet') ? 'all' : rawNetwork;

    const [userNetworks, setUserNetworks] = useState<UserNetwork[]>([]);
    const [filter, setFilter] = useState<'all' | 'mainnet' | 'testnet'>('all');

    useEffect(() => {
        getUserNetworks().then(setUserNetworks);
    }, []);

    const handleNetworkSwitch = (network: string) => {
        if (network === currentNetwork) return;
        onUpdateSettings({ ...settings, network });
        onSwitchComplete?.(network);
    };

    const handleRemoveUserNetwork = async (chainIdDecimal: number, networkId: string) => {
        await removeUserNetwork(chainIdDecimal);
        setUserNetworks(prev => prev.filter(n => n.chainIdDecimal !== chainIdDecimal));
        if (currentNetwork === networkId) {
            onUpdateSettings({ ...settings, network: 'all' });
        }
    };

    // Stable display order: all → octra → non-testnet EVM → testnet EVM
    const networkIds = Object.keys(NETWORK_REGISTRY).sort((a, b) => {
        const ma = NETWORK_REGISTRY[a], mb = NETWORK_REGISTRY[b];
        if (!ma.isEVM && !mb.isEVM) return 0;
        if (!ma.isEVM) return -1;
        if (!mb.isEVM) return 1;
        if (ma.isTestnet && !mb.isTestnet) return 1;
        if (!ma.isTestnet && mb.isTestnet) return -1;
        return 0;
    });

    // Dynamically filter built-in and user networks
    const filteredNetworkIds = networkIds.filter(id => {
        const meta = NETWORK_REGISTRY[id];
        if (filter === 'mainnet') return !meta.isTestnet;
        if (filter === 'testnet') return meta.isTestnet;
        return true;
    });

    const filteredUserNetworks = userNetworks.filter(n => {
        const isTestnet = /test|sepolia|goerli|mumbai|fuji|chapel|rinkeby|ropsten/i.test(n.chainName);
        if (filter === 'mainnet') return !isTestnet;
        if (filter === 'testnet') return isTestnet;
        return true;
    });

    const showAllNetworks = filter === 'all';

    return (
        <div className="animate-fade-in">
            <header className="wallet-header">
                <div className="flex items-center gap-md">
                    <button className="header-icon-btn" onClick={onBack}>
                        <ChevronLeftIcon size={20} />
                    </button>
                    <span className="text-lg font-semibold">Network</span>
                </div>
            </header>

            <div className="wallet-content">
                {/* Sleek Segmented Control Filter Tabs */}
                <div className="network-filter-tabs">
                    <button
                        className={`network-filter-tab ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        All
                    </button>
                    <button
                        className={`network-filter-tab ${filter === 'mainnet' ? 'active' : ''}`}
                        onClick={() => setFilter('mainnet')}
                    >
                        Mainnet
                    </button>
                    <button
                        className={`network-filter-tab ${filter === 'testnet' ? 'active' : ''}`}
                        onClick={() => setFilter('testnet')}
                    >
                        Testnet
                    </button>
                </div>

                <div className="network-options">
                    {/* All Networks — special option not in registry */}
                    {showAllNetworks && (
                        <button
                            className={`network-option ${currentNetwork === 'all' ? 'active' : ''}`}
                            onClick={() => handleNetworkSwitch('all')}
                            style={{ '--index': 0 } as React.CSSProperties}
                        >
                            <div className="network-option-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5"/>
                                    <ellipse cx="12" cy="12" rx="4.5" ry="9.5" stroke="currentColor" strokeWidth="1.5"/>
                                    <line x1="2.5" y1="12" x2="21.5" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                                </svg>
                            </div>
                            <div className="network-option-meta">
                                <span className="network-option-name">All Networks</span>
                            </div>
                            {currentNetwork === 'all' && (
                                <div className="network-active-indicator">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </div>
                            )}
                        </button>
                    )}

                    {filteredNetworkIds.map((id, idx) => {
                        const meta = NETWORK_REGISTRY[id];
                        const index = idx + (showAllNetworks ? 1 : 0);
                        const isActive = currentNetwork === id;
                        return (
                            <button
                                key={id}
                                className={`network-option ${isActive ? 'active' : ''}`}
                                onClick={() => handleNetworkSwitch(id)}
                                style={{ '--index': index } as React.CSSProperties}
                            >
                                <div className="network-option-icon">
                                    <img
                                        src={meta.iconUrl}
                                        alt={meta.displayName}
                                        width={24}
                                        height={24}
                                        style={meta.isTestnet ? { opacity: 0.6 } : undefined}
                                    />
                                </div>
                                <div className="network-option-meta">
                                    <span className="network-option-name">{meta.displayName}</span>
                                    {meta.isTestnet && (
                                        <span className="network-option-badge">
                                            Testnet
                                        </span>
                                    )}
                                </div>
                                {isActive && (
                                    <div className="network-active-indicator">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </div>
                                )}
                            </button>
                        );
                    })}

                    {/* User-added networks */}
                    {filteredUserNetworks.map((n, idx) => {
                        const config = userNetworkToConfig(n);
                        const index = filteredNetworkIds.length + (showAllNetworks ? 1 : 0) + idx;
                        const isActive = currentNetwork === config.id;
                        return (
                            <div
                                key={config.id}
                                className={`network-option network-option-user ${isActive ? 'active' : ''}`}
                                style={{ '--index': index } as React.CSSProperties}
                            >
                                <button
                                    className="network-option-inner"
                                    onClick={() => handleNetworkSwitch(config.id)}
                                >
                                    <div className="network-option-icon">
                                        {n.iconUrls?.[0] ? (
                                            <img src={n.iconUrls[0]} alt={n.chainName} width={24} height={24} />
                                        ) : (
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                                <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5"/>
                                                <ellipse cx="12" cy="12" rx="4.5" ry="9.5" stroke="currentColor" strokeWidth="1.5"/>
                                                <line x1="2.5" y1="12" x2="21.5" y2="12" stroke="currentColor" strokeWidth="1.5"/>
                                            </svg>
                                        )}
                                    </div>
                                    <div className="network-option-meta">
                                        <span className="network-option-name">{n.chainName}</span>
                                        <span className="network-option-chain-id">
                                            Chain {n.chainIdDecimal}
                                        </span>
                                    </div>
                                    {isActive && (
                                        <div className="network-active-indicator" style={{ marginRight: '8px' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        </div>
                                    )}
                                </button>
                                <button
                                    className="network-option-remove"
                                    title="Remove network"
                                    onClick={e => { e.stopPropagation(); handleRemoveUserNetwork(n.chainIdDecimal, config.id); }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18"/>
                                        <line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
