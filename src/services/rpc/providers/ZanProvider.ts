const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const ZAN_KEY = (e.VITE_ETH_RPC_ZAN as string | undefined) || "";

export const ZanProvider = {
  name: "ZAN.top",
  getRpcUrl(chainId: number): string | null {
    if (!ZAN_KEY) return null;
    const key = ZAN_KEY.includes("/zan.top") ? ZAN_KEY : ZAN_KEY.trim();
    if (!key) return null;

    if (key.startsWith("http")) {
      return chainId === 1 ? key : null;
    }

    if (chainId === 1) {
      return `https://api.zan.top/node/v1/eth/mainnet/${key}`;
    }
    return null;
  },
};
