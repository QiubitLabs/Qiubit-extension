/**
 * NetworkResolver — unified network lookup merging NETWORK_REGISTRY + user-added networks.
 *
 * Use this instead of accessing NETWORK_REGISTRY directly when you need to
 * support dynamically added networks (via wallet_addEthereumChain).
 */

import {
  NETWORK_REGISTRY,
  type NetworkConfig,
} from "../../constants/networks/registry";
import { getUserNetworksSync, userNetworkToConfig } from "./UserNetworkService";

/** Returns a combined map of all known networks (built-in + user-added). */
export function getAllNetworks(): Record<string, NetworkConfig> {
  const userNets = getUserNetworksSync();
  const userEntries = userNets.reduce<Record<string, NetworkConfig>>(
    (acc, n) => {
      const config = userNetworkToConfig(n);
      acc[config.id] = config;
      return acc;
    },
    {},
  );
  return { ...NETWORK_REGISTRY, ...userEntries };
}

/** Resolve a network by its registry key or user-network key. */
export function resolveNetwork(networkId: string): NetworkConfig | null {
  return NETWORK_REGISTRY[networkId] ?? getAllNetworks()[networkId] ?? null;
}

/** Find any network (built-in or user-added) by decimal chainId. */
export function resolveNetworkByChainId(chainId: number): NetworkConfig | null {
  const builtin = Object.values(NETWORK_REGISTRY).find(
    (n) => n.chainId === chainId,
  );
  if (builtin) return builtin;

  const userNets = getUserNetworksSync();
  const user = userNets.find((n) => n.chainIdDecimal === chainId);
  return user ? userNetworkToConfig(user) : null;
}

/** Like getNetworkForToken but resolves user-added networks too. */
export function resolveNetworkForToken(token: {
  isEVM?: boolean;
  isNative?: boolean;
  chainId?: number;
  isTestnet?: boolean;
  isSolana?: boolean;
  isSui?: boolean;
  isBitcoin?: boolean;
  isOCS01?: boolean;
  vm?: string;
}): NetworkConfig | null {
  if (token.isNative) return NETWORK_REGISTRY.octra;
  // OCS-01 tokens live on Octra; their sentinel chainId isn't in any registry,
  // so without this they'd fall through to the Ethereum fallback below.
  if (token.isOCS01 || token.vm === "octra") return NETWORK_REGISTRY.octra;
  // Non-EVM chain flags first — a Solana/Sui/Bitcoin token must never fall
  // through to Octra (it used to when it carried no chainId, which made e.g.
  // testnet SUI render with the Octra logo in the token detail view).
  if (token.chainId) {
    const byId = resolveNetworkByChainId(token.chainId);
    if (byId) return byId;
  }
  if (token.isSolana)
    return token.isTestnet
      ? NETWORK_REGISTRY["solana-testnet"]
      : NETWORK_REGISTRY.solana;
  if (token.isSui)
    return token.isTestnet
      ? NETWORK_REGISTRY["sui-testnet"]
      : NETWORK_REGISTRY.sui;
  if (token.isBitcoin) return NETWORK_REGISTRY.bitcoin;
  if (!token.isEVM && !token.chainId) return NETWORK_REGISTRY.octra;
  if (token.isTestnet) return NETWORK_REGISTRY.sepolia;
  return NETWORK_REGISTRY.ethereum;
}

/** Get the RPC URL for any network, including user-added ones. */
export function getRpcUrlForNetwork(networkId: string): string {
  const config = resolveNetwork(networkId);
  if (!config) return "";
  return config.rpcUrl ?? "";
}
