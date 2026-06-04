import { BaseChainConfig } from './BaseChainConfig';

export class BitcoinChain extends BaseChainConfig {
    id = 'bitcoin';
    displayName = 'Bitcoin';
    shortName = 'BTC';
    chainId = 20000000000001;
    isEVM = false;
    isTestnet = false;
    rpcUrl = 'https://mempool.space/api';
    rpcUrls = ['https://mempool.space/api', 'https://bitcoin-rpc.publicnode.com'];
    iconUrl = 'https://icons.llamao.fi/icons/chains/rsz_bitcoin.jpg';
    badgeColor = '#F7931A';
    nativeSymbol = 'BTC';
    nativeDecimals = 8;
    blockExplorerUrl = 'https://mempool.space';
}
