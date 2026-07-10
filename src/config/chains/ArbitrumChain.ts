import { BaseChainConfig } from "./BaseChainConfig";
import { getPrimaryRpc, getRpcList } from "../rpcEndpoints";

export class ArbitrumChain extends BaseChainConfig {
  id = "arbitrum";
  displayName = "Arbitrum One";
  shortName = "Arbitrum";
  chainId = 42161;
  isEVM = true;
  isTestnet = false;
  rpcUrl = getPrimaryRpc(42161);
  rpcUrls = getRpcList(42161) || [];
  iconUrl =
    "https://static.debank.com/image/chain/logo_url/arb/854f629937ce94bebeb2cd38fb336de7.png";
  badgeColor = "#28A0F0";
  nativeSymbol = "ETH";
  nativeDecimals = 18;
  blockExplorerUrl = "https://arbiscan.io";
}
