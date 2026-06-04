/**
 * Backwards-compatibility shim — derives everything from NETWORK_REGISTRY.
 * Do NOT add new networks here; add them to registry.ts instead.
 */

import { NETWORK_REGISTRY, NetworkConfig, Erc20Config } from './networks/registry';

export type EvmTokenConfig = Erc20Config;

export interface EvmNetworkConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    nativeToken: { symbol: string; name: string; decimals: number; logoUrl: string };
    tokens: EvmTokenConfig[];
}

function toEvmNetworkConfig(cfg: NetworkConfig): EvmNetworkConfig {
    return {
        chainId: cfg.chainId!,
        name: cfg.displayName,
        rpcUrl: cfg.rpcUrl ?? '',
        nativeToken: cfg.nativeToken ?? { symbol: 'ETH', name: 'Ethereum', decimals: 18, logoUrl: '/eth-icon.svg' },
        tokens: cfg.erc20Tokens ?? [],
    };
}

export const EVM_NETWORKS: Record<string, EvmNetworkConfig> = Object.fromEntries(
    Object.entries(NETWORK_REGISTRY)
        .filter(([, cfg]) => cfg.isEVM)
        .map(([id, cfg]) => [id, toEvmNetworkConfig(cfg)])
);

export function getEvmTokensForNetwork(networkName: string): EvmTokenConfig[] {
    return NETWORK_REGISTRY[networkName.toLowerCase()]?.erc20Tokens ?? [];
}

export function getEvmNativeTokenForNetwork(networkName: string) {
    return NETWORK_REGISTRY[networkName.toLowerCase()]?.nativeToken ?? null;
}

export function getEvmNetworkConfig(networkName: string): EvmNetworkConfig | null {
    const cfg = NETWORK_REGISTRY[networkName.toLowerCase()];
    if (!cfg?.isEVM) return null;
    return toEvmNetworkConfig(cfg);
}
