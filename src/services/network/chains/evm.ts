import { discoverAllChainTokens } from "../TokenDiscoveryService";
import { NETWORK_REGISTRY } from "../../../constants/networks/registry";

export function getEvmChainIds(): number[] {
  return Object.values(NETWORK_REGISTRY)
    .filter(
      (n): n is typeof n & { chainId: number } =>
        n.addressType === "evm" && n.chainId !== null,
    )
    .map((n) => n.chainId);
}

export async function fetchEvmTokens(
  evmAddress: string,
  force = false,
): Promise<any[]> {
  return discoverAllChainTokens(evmAddress, force);
}
