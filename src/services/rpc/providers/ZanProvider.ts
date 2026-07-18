const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const ZAN_KEY = (e.VITE_ETH_RPC_ZAN as string | undefined) || "";

// Registered EVM mainnets → ZAN chain segment (one ZAN key covers all).
// URL shape: https://api.zan.top/node/v1/<chain>/mainnet/<key>
const ZAN_CHAINS: Record<number, string> = {
  1: "eth",
  56: "bsc",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  // Robinhood Chain — verified live with our key (fake slugs are rejected
  // with "ecosystem not supported", so coverage is real, not a proxy).
  4663: "robinhood",
};

export const ZanProvider = {
  name: "ZAN.top",
  getRpcUrl(chainId: number): string | null {
    if (!ZAN_KEY) return null;
    const key = ZAN_KEY.includes("/zan.top") ? ZAN_KEY : ZAN_KEY.trim();
    if (!key) return null;

    // A full pre-built URL in the env is Ethereum-specific — mainnet only.
    if (key.startsWith("http")) {
      return chainId === 1 ? key : null;
    }

    const chain = ZAN_CHAINS[chainId];
    if (!chain) return null;
    return `https://api.zan.top/node/v1/${chain}/mainnet/${key}`;
  },
};
