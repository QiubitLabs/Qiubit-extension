import { InfuraProvider } from "./providers/InfuraProvider";
import { DrpcProvider } from "./providers/DrpcProvider";
import { ZanProvider } from "./providers/ZanProvider";
import { ChainstackProvider } from "./providers/ChainstackProvider";
import { PublicProvider } from "./providers/PublicProvider";
import { AlchemyProvider } from "./providers/AlchemyProvider";

/**
 * EVM testnet chainIds. Paid/keyed providers (Infura, dRPC, ZAN, Chainstack,
 * Alchemy) are NEVER used for these — testnets run on public RPCs only, to
 * preserve the paid API quota for mainnet where it matters.
 * Add new EVM testnets here.
 */
const EVM_TESTNET_CHAIN_IDS = new Set<number>([
  11155111, // Ethereum Sepolia
  5042002, //  Arc Testnet
]);

export function isEvmTestnetChainId(chainId: number): boolean {
  return EVM_TESTNET_CHAIN_IDS.has(chainId);
}

/**
 * Aggregate all RPC providers in precise priority order:
 * Infura -> dRPC -> ZAN.top -> Chainstack -> Public Nodes -> Alchemy (absolute last fallback)
 *
 * @param {number} chainId - Target EVM chain ID
 * @returns {string[]} Ordered list of RPC URLs
 */
/**
 * Private/authenticated RPCs only (Alchemy, Infura, dRPC, ZAN, Chainstack),
 * for signing & broadcasting transactions (send/swap/bridge). Public nodes are
 * intentionally excluded here — they are reserved for balance reads on Home.
 * Returns [] when no private endpoint covers the chain, so callers can decide
 * whether to fall back to the public pool.
 */
export function getPrivateRpcListFromPool(chainId: number): string[] {
  // Testnets never touch the paid providers.
  if (isEvmTestnetChainId(chainId)) return [];

  const list: string[] = [];
  const push = (u: string | null) => {
    if (u && !list.includes(u)) list.push(u);
  };
  // Priority order (matches .env): Infura → dRPC → ZAN → Chainstack, then
  // Alchemy (which additionally covers Polygon/Base/Arbitrum/Optimism/BSC).
  push(InfuraProvider.getRpcUrl(chainId));
  push(DrpcProvider.getRpcUrl(chainId));
  push(ZanProvider.getRpcUrl(chainId));
  push(ChainstackProvider.getRpcUrl(chainId));
  push(AlchemyProvider.getRpcUrl(chainId));
  return list;
}

export function getRpcListFromPool(chainId: number): string[] {
  // Testnets use public RPCs only — skip every paid/keyed provider.
  if (isEvmTestnetChainId(chainId)) {
    return PublicProvider.getRpcUrls(chainId).filter(Boolean);
  }

  const list: string[] = [];

  const infura = InfuraProvider.getRpcUrl(chainId);
  if (infura) list.push(infura);

  const drpc = DrpcProvider.getRpcUrl(chainId);
  if (drpc) list.push(drpc);

  const zan = ZanProvider.getRpcUrl(chainId);
  if (zan) list.push(zan);

  const chainstack = ChainstackProvider.getRpcUrl(chainId);
  if (chainstack) list.push(chainstack);

  if (chainId === 1) {
    return list.filter(Boolean);
  }

  const publics = PublicProvider.getRpcUrls(chainId);
  publics.forEach((url) => {
    if (url && !list.includes(url)) {
      list.push(url);
    }
  });

  const alchemy = AlchemyProvider.getRpcUrl(chainId);
  if (alchemy && !list.includes(alchemy)) {
    list.push(alchemy);
  }

  return list.filter(Boolean);
}
