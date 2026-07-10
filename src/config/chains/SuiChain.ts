import { BaseChainConfig } from "./BaseChainConfig";

export class SuiChain extends BaseChainConfig {
  id = "sui";
  displayName = "Sui";
  shortName = "Sui";
  chainId = 9270000000000000;
  isEVM = false;
  isTestnet = false;
  rpcUrl = "https://fullnode.mainnet.sui.io";
  rpcUrls = ["https://fullnode.mainnet.sui.io"];
  iconUrl = "/chains/sui/sui.png";
  badgeColor = "#6FB9FF";
  nativeSymbol = "SUI";
  nativeDecimals = 9;
  blockExplorerUrl = "https://suiscan.xyz";
}
