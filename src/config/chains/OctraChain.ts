import { BaseChainConfig } from "./BaseChainConfig";

export class OctraChain extends BaseChainConfig {
  id = "octra";
  displayName = "Octra";
  shortName = "Octra";
  chainId = null;
  isEVM = false;
  isTestnet = false;
  rpcUrl = "https://octra.network/rpc";
  rpcUrls = ["https://octra.network/rpc"];
  iconUrl = "/octra-icon.svg";
  badgeColor = "#00D4FF";
  nativeSymbol = "OCT";
  nativeDecimals = 6;
}
