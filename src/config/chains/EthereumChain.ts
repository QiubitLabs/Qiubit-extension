import { BaseChainConfig } from './BaseChainConfig';
import { ALCHEMY_ETH_RPC, getPrimaryRpc, getRpcList } from '../rpcEndpoints';
import { ETHEREUM_ERC20_TOKENS } from './tokens';

export class EthereumChain extends BaseChainConfig {
    id = 'ethereum';
    displayName = 'Ethereum';
    shortName = 'ETH';
    chainId = 1;
    isEVM = true;
    isTestnet = false;
    rpcUrl = getPrimaryRpc(1);
    rpcUrls = getRpcList(1) || [];
    iconUrl = 'https://static.debank.com/image/chain/logo_url/eth/42ba589cd077e7bdd97db6480b0ff61d.png';
    badgeColor = '#627EEA';
    nativeSymbol = 'ETH';
    nativeDecimals = 18;
    blockExplorerUrl = 'https://etherscan.io';
    alchemyRpc = ALCHEMY_ETH_RPC;
    erc20Tokens = ETHEREUM_ERC20_TOKENS;
}
