/**
 * Types for EVM-compatible network configurations
 * to ensure type safety and ease of adding new EVM chains.
 */

export interface EvmTokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  contractAddress: string;
  logoUrl: string;
}

export interface EvmNetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeToken: {
    symbol: string;
    name: string;
    decimals: number;
    logoUrl: string;
  };
  tokens: EvmTokenConfig[];
}
