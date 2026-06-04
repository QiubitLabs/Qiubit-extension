import { BaseChainConfig } from './BaseChainConfig';
import { getPrimaryRpc, getRpcList } from '../rpcEndpoints';

export class MonadChain extends BaseChainConfig {
    id = 'monad';
    displayName = 'Monad';
    shortName = 'Monad';
    chainId = 143;
    isEVM = true;
    isTestnet = false;
    rpcUrl = getPrimaryRpc(143);
    rpcUrls = getRpcList(143) || [];
    iconUrl = 'https://icons.llamao.fi/icons/chains/rsz_monad.jpg';
    badgeColor = '#8A2BE2';
    nativeSymbol = 'MON';
    nativeDecimals = 18;
    blockExplorerUrl = 'https://monadscan.com';
}
