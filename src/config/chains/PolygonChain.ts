import { BaseChainConfig } from './BaseChainConfig';
import { getPrimaryRpc, getRpcList } from '../rpcEndpoints';

export class PolygonChain extends BaseChainConfig {
    id = 'polygon';
    displayName = 'Polygon';
    shortName = 'Polygon';
    chainId = 137;
    isEVM = true;
    isTestnet = false;
    rpcUrl = getPrimaryRpc(137);
    rpcUrls = getRpcList(137) || [];
    iconUrl = 'https://static.debank.com/image/chain/logo_url/matic/52ca152c08831e4765506c9bd75767e8.png';
    badgeColor = '#8247E5';
    nativeSymbol = 'POL';
    nativeDecimals = 18;
    blockExplorerUrl = 'https://polygonscan.com';
}
