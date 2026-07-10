import { BaseChainConfig } from "./BaseChainConfig";

export class SolanaChain extends BaseChainConfig {
  id = "solana";
  displayName = "Solana";
  shortName = "Solana";
  chainId = 1151111081099710;
  isEVM = false;
  isTestnet = false;
  rpcUrl = "https://solana-rpc.publicnode.com";
  rpcUrls = [
    "https://solana-rpc.publicnode.com",
    "https://solana.drpc.org",
    "https://api.mainnet-beta.solana.com",
  ];
  iconUrl = "/chains/solana/sol.png";
  badgeColor = "#14F195";
  nativeSymbol = "SOL";
  nativeDecimals = 9;
  blockExplorerUrl = "https://solscan.io";
}
