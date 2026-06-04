import { EvmNetworkConfig } from './types';

export const SEPOLIA_NETWORK: EvmNetworkConfig = {
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    nativeToken: {
        symbol: 'ETH',
        name: 'Sepolia ETH',
        decimals: 18,
        logoUrl: '/eth-icon.svg'
    },
    tokens: []
};
