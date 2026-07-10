import { BaseChainConfig } from "./BaseChainConfig";
import { getPrimaryRpc, getRpcList } from "../rpcEndpoints";
import { BSC_ERC20_TOKENS } from "./tokens";

export class BscChain extends BaseChainConfig {
  id = "bsc";
  displayName = "BNB Smart Chain";
  shortName = "BSC";
  chainId = 56;
  isEVM = true;
  isTestnet = false;
  rpcUrl = getPrimaryRpc(56);
  rpcUrls = getRpcList(56) || [];
  iconUrl =
    "https://static.debank.com/image/chain/logo_url/bsc/bc73fa84b7fc5337905e527dadcbc854.png";
  badgeColor = "#F0B90B";
  nativeSymbol = "BNB";
  nativeDecimals = 18;
  blockExplorerUrl = "https://bscscan.com";
  erc20Tokens = BSC_ERC20_TOKENS;
}
