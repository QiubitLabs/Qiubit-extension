import { BaseChainConfig } from "./BaseChainConfig";
import { EthereumChain } from "./EthereumChain";
import { PolygonChain } from "./PolygonChain";
import { BscChain } from "./BscChain";
import { ArbitrumChain } from "./ArbitrumChain";
import { BaseChain } from "./BaseChain";
import { MonadChain } from "./MonadChain";
import { HyperliquidChain } from "./HyperliquidChain";
import { SolanaChain } from "./SolanaChain";
import { SuiChain } from "./SuiChain";
import { BitcoinChain } from "./BitcoinChain";
import { OctraChain } from "./OctraChain";

export { BaseChainConfig } from "./BaseChainConfig";
export { EthereumChain } from "./EthereumChain";
export { PolygonChain } from "./PolygonChain";
export { BscChain } from "./BscChain";
export { ArbitrumChain } from "./ArbitrumChain";
export { BaseChain } from "./BaseChain";
export { MonadChain } from "./MonadChain";
export { HyperliquidChain } from "./HyperliquidChain";
export { SolanaChain } from "./SolanaChain";
export { SuiChain } from "./SuiChain";
export { BitcoinChain } from "./BitcoinChain";
export { OctraChain } from "./OctraChain";

export const CHAINS: Record<string, BaseChainConfig> = {
  ethereum: new EthereumChain(),
  polygon: new PolygonChain(),
  bsc: new BscChain(),
  arbitrum: new ArbitrumChain(),
  base: new BaseChain(),
  monad: new MonadChain(),
  hyperliquid: new HyperliquidChain(),
  solana: new SolanaChain(),
  sui: new SuiChain(),
  bitcoin: new BitcoinChain(),
  octra: new OctraChain(),
};

/**
 * Resolve chain config by network ID or chain ID
 */
export function getChainConfig(
  networkIdOrChainId: string | number | null,
): BaseChainConfig | null {
  if (!networkIdOrChainId) return CHAINS.octra;

  if (typeof networkIdOrChainId === "string") {
    const found = CHAINS[networkIdOrChainId.toLowerCase()];
    if (found) return found;
  }

  const chainIdNum = Number(networkIdOrChainId);
  if (!isNaN(chainIdNum)) {
    const found = Object.values(CHAINS).find((c) => c.chainId === chainIdNum);
    if (found) return found;
  }

  return null;
}
export function getInsufficientFundsMessage(
  networkIdOrChainId: string | number | null,
): string {
  const chain = getChainConfig(networkIdOrChainId);
  return chain
    ? chain.getInsufficientFundsMessage()
    : "Insufficient balance for gas fee.";
}
