const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const INFURA_KEY = (e.VITE_ETH_RPC_INFURA as string | undefined) || "";

// Registered EVM mainnets Infura serves (one Infura key covers all of them).
// Chains Infura doesn't host (Monad, Hyperliquid, Arc) simply fall through to
// the public pool. Testnets are excluded upstream by the rpcPool guard.
const INFURA_HOSTS: Record<number, string> = {
  1: "mainnet",
  56: "bsc-mainnet",
  137: "polygon-mainnet",
  8453: "base-mainnet",
  42161: "arbitrum-mainnet",
  1151111081099710: "solana",
};

export const InfuraProvider = {
  name: "Infura",
  getRpcUrl(chainId: number): string | null {
    if (!INFURA_KEY) return null;
    const key = INFURA_KEY.includes("/v3/")
      ? INFURA_KEY.split("/v3/")[1]?.trim()
      : INFURA_KEY.trim();
    if (!key) return null;

    const host = INFURA_HOSTS[chainId];
    if (!host) return null;
    return `https://${host}.infura.io/v3/${key}`;
  },
};
