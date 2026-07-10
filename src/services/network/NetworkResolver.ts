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
}): NetworkConfig | null {
  if (token.isNative || (!token.isEVM && !token.chainId))
    return NETWORK_REGISTRY.octra;
  if (token.chainId)
    return resolveNetworkByChainId(token.chainId) ?? NETWORK_REGISTRY.ethereum;
  if (token.isTestnet) return NETWORK_REGISTRY.sepolia;
  return NETWORK_REGISTRY.ethereum;
}

/** Get the RPC URL for any network, including user-added ones. */
export function getRpcUrlForNetwork(networkId: string): string {
  const config = resolveNetwork(networkId);
  if (!config) return "";
  return config.rpcUrl ?? "";
}
