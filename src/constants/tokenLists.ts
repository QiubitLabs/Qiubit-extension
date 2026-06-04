import { NETWORK_REGISTRY } from './networks/registry';

export interface DefaultToken {
    symbol: string;
    name: string;
    decimals: number;
    contractAddress: string;
    logoUrl: string;
}

/**
 * Default ERC20 token list per chainId, built from NETWORK_REGISTRY.
 * Used by TokenSelectorModal to pre-populate the token selector with known tokens.
 */
export const DEFAULT_TOKENS: Record<number, DefaultToken[]> = Object.values(NETWORK_REGISTRY)
    .filter(net => net.chainId !== null && net.erc20Tokens && net.erc20Tokens.length > 0)
    .reduce((acc, net) => {
        const chainId = net.chainId as number;
        acc[chainId] = (net.erc20Tokens ?? []).map(t => ({
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            contractAddress: t.contractAddress,
            logoUrl: t.logoUrl,
        }));
        return acc;
    }, {} as Record<number, DefaultToken[]>);
