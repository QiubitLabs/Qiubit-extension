import { BaseChainConfig } from './BaseChainConfig';
import { getPrimaryRpc, getRpcList } from '../rpcEndpoints';

export class BaseChain extends BaseChainConfig {
    id = 'base';
    displayName = 'Base';
    shortName = 'Base';
    chainId = 8453;
    isEVM = true;
    isTestnet = false;
    rpcUrl = getPrimaryRpc(8453);
    rpcUrls = getRpcList(8453) || [];
    iconUrl = 'https://static.debank.com/image/chain/logo_url/base/ccc1513e4f390542c4fb2f4b88ce9579.png';
    badgeColor = '#0052FF';
    nativeSymbol = 'ETH';
    nativeDecimals = 18;
    blockExplorerUrl = 'https://basescan.org';
}
