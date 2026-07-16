const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const DRPC_KEY = (e.VITE_ETH_RPC_DRPC as string | undefined) || "";

// Registered EVM mainnets → dRPC network slug (one dRPC key covers all).
// Chains dRPC doesn't serve fall through to the public pool.
const DRPC_NETWORKS: Record<number, string> = {
  1: "ethereum",
  56: "bsc",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
};

export const DrpcProvider = {
  name: "dRPC",
  getRpcUrl(chainId: number): string | null {
    if (!DRPC_KEY) return null;
    const key = DRPC_KEY.includes("/dapi.drpc.org")
      ? DRPC_KEY
      : DRPC_KEY.trim();
    if (!key) return null;

    // A full pre-built URL in the env is Ethereum-specific (we can't derive
    // other chains from it), so it only applies to mainnet.
    if (key.startsWith("http")) {
      return chainId === 1 ? key : null;
    }

    const network = DRPC_NETWORKS[chainId];
    if (!network) return null;
    return `https://lb.drpc.org/ogrpc?network=${network}&key=${key}`;
  },
};
