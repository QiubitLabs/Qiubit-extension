const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const ALCHEMY_URL =
  (e.VITE_ETH_RPC_URL as string | undefined) ||
  (e.VITE_FALLBACK_ETH_RPC_URL as string | undefined) ||
  "";

// Mainnet slugs only — testnets are served by public RPCs (the rpcPool guard
// skips every paid provider for testnet chainIds), so no "*-sepolia"/testnet
// hosts belong here.
const ALCHEMY_HOSTS: Record<number, string> = {
  1: "eth-mainnet",
  56: "bnb-mainnet",
  137: "polygon-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  10: "opt-mainnet",
  // Circle Arc mainnet. Alchemy sits LAST in the RPC pool, so if our key
  // doesn't yet cover Arc this just fails-and-falls-through to public nodes —
  // the moment Alchemy enables Arc for our key it activates with no code
  // change. Slug follows Alchemy's uniform "<chain>-mainnet" convention
  // (testnet slug arc-testnet.g.alchemy.com is verified but intentionally
  // unused — testnets stay on public RPCs).
  5042: "arc-mainnet",
  // Robinhood Chain — verified live with our key (eth_chainId 0x1237,
  // block height matches the official rpc.mainnet.chain.robinhood.com).
  4663: "robinhood-mainnet",
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
