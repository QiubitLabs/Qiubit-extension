import { BaseChainConfig } from './BaseChainConfig';
import { getPrimaryRpc, getRpcList } from '../rpcEndpoints';

export class HyperliquidChain extends BaseChainConfig {
    id = 'hyperliquid';
    displayName = 'Hyperliquid EVM';
    shortName = 'HYPE';
    chainId = 999;
    isEVM = true;
    isTestnet = false;
    rpcUrl = getPrimaryRpc(999);
    rpcUrls = getRpcList(999) || [];
    iconUrl = 'https://icons.llamao.fi/icons/chains/rsz_hyperliquid.jpg';
    badgeColor = '#00F5FF';
    nativeSymbol = 'HYPE';
    nativeDecimals = 18;
    blockExplorerUrl = 'https://purrsec.com';
}
