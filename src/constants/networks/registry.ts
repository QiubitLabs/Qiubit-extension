/**
 * Network Registry — SINGLE SOURCE OF TRUTH for all supported networks.
 *
 * To add a new network (EVM or otherwise):
 *   1. Add one entry to NETWORK_REGISTRY below.
 *   2. Add the RPC host to manifest.json host_permissions (Chrome extension requirement).
 *   That's it — no other files need to change.
 */

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface Erc20Config {
    symbol: string;
    name: string;
    contractAddress: string;
    decimals: number;
    logoUrl: string;
}

/**
 * How to fetch transaction history for this network.
 * - 'alchemy': uses Alchemy's alchemy_getAssetTransfers (requires VITE_ETH_RPC_URL)
 * - 'etherscan_compatible': standard Etherscan-style REST API (Etherscan, Polygonscan, Basescan, etc.)
 * - 'none': no history fetching supported
 */
export interface HistoryApiConfig {
    type: 'alchemy' | 'etherscan_compatible' | 'none';
    baseUrl?: string; // for etherscan_compatible: e.g. 'https://api-sepolia.etherscan.io/api'
}

export interface NetworkConfig {
    // Identity
    id: string;
    displayName: string;
    shortName: string;

    // Chain
    chainId: number | null;
    isEVM: boolean;
    isTestnet: boolean;

    rpcUrl?: string;

    // Display
    iconUrl: string;
    badgeColor: string;
    addressType: 'octra' | 'evm' | 'solana' | 'sui' | 'bitcoin';

    // Native token (EVM only)
    nativeToken?: { symbol: string; name: string; decimals: number; logoUrl: string };

    // Pre-configured ERC20 token list shown by default (EVM only)
    erc20Tokens?: Erc20Config[];

    // Block explorer base URL (e.g. 'https://etherscan.io')
    blockExplorerUrl?: string;

    // Transaction history API
    historyApi: HistoryApiConfig;
}

import { getPrimaryRpc } from '../../config/rpcEndpoints';
import {
    ETHEREUM_ERC20_TOKENS, BSC_ERC20_TOKENS,
    POLYGON_ERC20_TOKENS, BASE_ERC20_TOKENS, ARBITRUM_ERC20_TOKENS,
    HYPERLIQUID_ERC20_TOKENS, MONAD_ERC20_TOKENS,
} from '../../config/chains/tokens';

// ─── Network Registry ─────────────────────────────────────────────────────────
// Add new networks here. Order controls display order in the Network Switcher.

export const NETWORK_REGISTRY: Record<string, NetworkConfig> = {

    octra: {
        id: 'octra',
        displayName: 'Octra',
        shortName: 'Octra',
        chainId: null,
        isEVM: false,
        isTestnet: false,
        iconUrl: '/chains/octra/logo.svg',
        badgeColor: '#00D4FF',
        addressType: 'octra',
        historyApi: { type: 'none' },
    },

    solana: {
        id: 'solana',
        displayName: 'Solana',
        shortName: 'Solana',
        chainId: 1151111081099710,
        isEVM: false,
        isTestnet: false,
        iconUrl: '/chains/solana/logo.jpg',
        badgeColor: '#14F195',
        addressType: 'solana',
        nativeToken: { symbol: 'SOL', name: 'Solana', decimals: 9, logoUrl: '/chains/solana/sol.png' },
        erc20Tokens: [],
        blockExplorerUrl: 'https://solscan.io',
        historyApi: { type: 'none' },
    },

    sui: {
        id: 'sui',
        displayName: 'Sui',
        shortName: 'Sui',
        chainId: 9270000000000000,
        isEVM: false,
        isTestnet: false,
        iconUrl: '/chains/sui/logo.jpg',
        badgeColor: '#6FB9FF',
        addressType: 'sui',
        nativeToken: { symbol: 'SUI', name: 'Sui', decimals: 9, logoUrl: '/chains/sui/sui.png' },
        erc20Tokens: [],
        blockExplorerUrl: 'https://suiscan.xyz',
        historyApi: { type: 'none' },
    },

    bitcoin: {
        id: 'bitcoin',
        displayName: 'Bitcoin',
        shortName: 'BTC',
        chainId: 20000000000001,
        isEVM: false,
        isTestnet: false,
        iconUrl: '/chains/bitcoin/logo.png',
        badgeColor: '#F7931A',
        addressType: 'bitcoin',
        nativeToken: { symbol: 'BTC', name: 'Bitcoin', decimals: 8, logoUrl: '/chains/bitcoin/btc.png' },
        erc20Tokens: [],
        blockExplorerUrl: 'https://mempool.space',
        historyApi: { type: 'none' },
    },

    ethereum: {
        id: 'ethereum',
        displayName: 'Ethereum',
        shortName: 'ETH',
        chainId: 1,
        isEVM: true,
        isTestnet: false,
        rpcUrl: getPrimaryRpc(1),
        iconUrl: '/chains/ethereum/logo.png',
        badgeColor: '#627EEA',
        addressType: 'evm',
        nativeToken: { symbol: 'ETH', name: 'Ethereum', decimals: 18, logoUrl: '/chains/ethereum/eth.png' },
        erc20Tokens: ETHEREUM_ERC20_TOKENS,
        blockExplorerUrl: 'https://etherscan.io',
        historyApi: { type: 'alchemy' },
    },

    sepolia: {
        id: 'sepolia',
        displayName: 'Sepolia',
        shortName: 'Sepolia',
        chainId: 11155111,
        isEVM: true,
        isTestnet: true,
        rpcUrl: getPrimaryRpc(11155111),
        iconUrl: '/chains/ethereum/logo.png',
        badgeColor: '#8B5CF6',
        addressType: 'evm',
        nativeToken: { symbol: 'ETH', name: 'Sepolia ETH', decimals: 18, logoUrl: '/chains/ethereum/eth.png' },
        erc20Tokens: [],
        blockExplorerUrl: 'https://sepolia.etherscan.io',
        historyApi: { type: 'etherscan_compatible', baseUrl: 'https://api-sepolia.etherscan.io/api' },
    },

    bsc: {
        id: 'bsc',
        displayName: 'BNB Smart Chain',
        shortName: 'BSC',
        chainId: 56,
        isEVM: true,
        isTestnet: false,
        rpcUrl: getPrimaryRpc(56),
        iconUrl: '/chains/bsc/logo.png',
        badgeColor: '#F0B90B',
        addressType: 'evm',
        nativeToken: { symbol: 'BNB', name: 'BNB', decimals: 18, logoUrl: '/chains/bsc/bnb.png' },
        erc20Tokens: BSC_ERC20_TOKENS,
        blockExplorerUrl: 'https://bscscan.com',
        historyApi: { type: 'none' },
    },

    polygon: {
        id: 'polygon',
        displayName: 'Polygon',
        shortName: 'Polygon',
        chainId: 137,
        isEVM: true,
        isTestnet: false,
        rpcUrl: getPrimaryRpc(137),
        iconUrl: '/chains/polygon/logo.png',
        badgeColor: '#8247E5',
        addressType: 'evm',
        nativeToken: { symbol: 'POL', name: 'POL', decimals: 18, logoUrl: '/chains/polygon/pol.png' },
        erc20Tokens: POLYGON_ERC20_TOKENS,
        blockExplorerUrl: 'https://polygonscan.com',
        historyApi: { type: 'none' },
    },

    base: {
        id: 'base',
        displayName: 'Base',
        shortName: 'Base',
        chainId: 8453,
        isEVM: true,
        isTestnet: false,
        rpcUrl: getPrimaryRpc(8453),
        iconUrl: '/chains/base/logo.png',
        badgeColor: '#0052FF',
        addressType: 'evm',
        nativeToken: { symbol: 'ETH', name: 'Ethereum', decimals: 18, logoUrl: '/chains/base/eth.png' },
        erc20Tokens: BASE_ERC20_TOKENS,
        blockExplorerUrl: 'https://basescan.org',
        historyApi: { type: 'none' },
    },

    arbitrum: {
        id: 'arbitrum',
        displayName: 'Arbitrum One',
        shortName: 'Arbitrum',
        chainId: 42161,
        isEVM: true,
        isTestnet: false,
        rpcUrl: getPrimaryRpc(42161),
        iconUrl: '/chains/arbitrum/logo.png',
        badgeColor: '#28A0F0',
        addressType: 'evm',
        nativeToken: { symbol: 'ETH', name: 'Ethereum', decimals: 18, logoUrl: '/chains/arbitrum/eth.png' },
        erc20Tokens: ARBITRUM_ERC20_TOKENS,
        blockExplorerUrl: 'https://arbiscan.io',
        historyApi: { type: 'none' },
    },

    monad: {
        id: 'monad',
        displayName: 'Monad',
        shortName: 'Monad',
        chainId: 143,
        isEVM: true,
        isTestnet: false,
        rpcUrl: getPrimaryRpc(143),
        iconUrl: '/chains/monad/logo.jpg',
        badgeColor: '#8A2BE2',
        addressType: 'evm',
        nativeToken: { symbol: 'MON', name: 'MON', decimals: 18, logoUrl: '/chains/monad/logo.jpg' },
        erc20Tokens: MONAD_ERC20_TOKENS,
        blockExplorerUrl: 'https://monadscan.com',
        historyApi: { type: 'none' },
    },

    hyperliquid: {
        id: 'hyperliquid',
        displayName: 'Hyperliquid EVM',
        shortName: 'HYPE',
        chainId: 999,
        isEVM: true,
        isTestnet: false,
        rpcUrl: getPrimaryRpc(999),
        iconUrl: '/chains/hyperliquid/logo.jpg',
        badgeColor: '#00F5FF',
        addressType: 'evm',
        nativeToken: { symbol: 'HYPE', name: 'HYPE', decimals: 18, logoUrl: '/chains/hyperliquid/logo.jpg' },
        erc20Tokens: HYPERLIQUID_ERC20_TOKENS,
        blockExplorerUrl: 'https://purrsec.com',
        historyApi: { type: 'none' },
    },
};

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

export function getNetworkConfig(networkId: string): NetworkConfig | null {
    return NETWORK_REGISTRY[networkId] ?? null;
}

export function getNetworkByChainId(chainId: number): NetworkConfig | null {
    return Object.values(NETWORK_REGISTRY).find(n => n.chainId === chainId) ?? null;
}

export function getNetworkForToken(token: {
    isEVM?: boolean; isNative?: boolean; chainId?: number; isTestnet?: boolean;
    isSolana?: boolean; isSui?: boolean; isBitcoin?: boolean;
}): NetworkConfig | null {
    if (token.isSolana === true) return NETWORK_REGISTRY.solana;
    if (token.isSui === true) return NETWORK_REGISTRY.sui;
    if (token.isBitcoin === true) return NETWORK_REGISTRY.bitcoin;
    if (token.isNative) return NETWORK_REGISTRY.octra;
    if (token.chainId) {
        const found = getNetworkByChainId(token.chainId);
        if (found) return found;
    }
    if (!token.isEVM && !token.chainId) return NETWORK_REGISTRY.octra;
    if (token.isTestnet) return NETWORK_REGISTRY.sepolia;
    return NETWORK_REGISTRY.ethereum;
}

export function getNetworkDisplayName(networkId: string): string {
    if (networkId === 'all') return 'All Networks';
    return NETWORK_REGISTRY[networkId]?.displayName ?? networkId;
}

/** Full label for Settings UI: "Octra Network", "Ethereum Network", "Sepolia Testnet" */
export function getNetworkLabel(networkId: string): string {
    if (networkId === 'all') return 'All Networks';
    const meta = NETWORK_REGISTRY[networkId];
    if (!meta) return networkId;
    return meta.isTestnet ? `${meta.displayName} Testnet` : `${meta.displayName} Network`;
}

export function shouldUseEvmAddress(networkId: string): boolean {
    return NETWORK_REGISTRY[networkId]?.addressType === 'evm';
}

export function isEvmNetwork(networkId: string): boolean {
    return NETWORK_REGISTRY[networkId]?.isEVM === true;
}

export function isTestnetNetwork(networkId: string): boolean {
    return NETWORK_REGISTRY[networkId]?.isTestnet === true;
}

/**
 * Filter tokens to only those belonging to the active network.
 * forUsd=true excludes testnet tokens in 'all' mode (no real USD price).
 */
export function filterTokensByNetwork<T extends { isEVM?: boolean; isTestnet?: boolean; chainId?: number; isSolana?: boolean; isSui?: boolean; isBitcoin?: boolean; isNative?: boolean }>(
    tokens: T[],
    networkId: string,
    forUsd = false
): T[] {
    if (networkId === 'all') return forUsd ? tokens.filter(t => !t.isTestnet) : tokens;
    const meta = NETWORK_REGISTRY[networkId];
    if (!meta) return tokens;
    if (meta.id === 'solana') {
        return tokens.filter(t => t.isSolana === true || t.chainId === 1151111081099710) as any;
    }
    if (meta.id === 'sui') {
        return tokens.filter(t => t.isSui === true) as any;
    }
    if (meta.id === 'bitcoin') {
        return tokens.filter(t => t.isBitcoin === true) as any;
    }
    if (meta.id === 'octra') {
        return tokens.filter(t => t.isNative === true || (!t.isEVM && !t.isSolana && !t.isSui && !t.isBitcoin && t.chainId !== 1151111081099710)) as any;
    }
    if (meta.isEVM) {
        return tokens.filter(t => t.isEVM && t.chainId === meta.chainId) as any;
    }
    return tokens.filter(t => !t.isEVM) as any;
}
