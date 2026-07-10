const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const ALCHEMY_URL =
  (e.VITE_ETH_RPC_URL as string | undefined) ||
  (e.VITE_FALLBACK_ETH_RPC_URL as string | undefined) ||
  "";

const ALCHEMY_HOSTS: Record<number, string> = {
  1: "eth-mainnet",
  11155111: "eth-sepolia",
  56: "bnb-mainnet",
  137: "polygon-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  10: "opt-mainnet",
};

export const AlchemyProvider = {
  name: "Alchemy",
  getRpcUrl(chainId: number): string | null {
    if (!ALCHEMY_URL) return null;
    const key = ALCHEMY_URL.includes("/v2/")
      ? ALCHEMY_URL.split("/v2/")[1]?.trim()
      : ALCHEMY_URL.trim();
    if (!key) return null;

    const host = ALCHEMY_HOSTS[chainId];
    if (!host) return null;
    return `https://${host}.g.alchemy.com/v2/${key}`;
  },
};
