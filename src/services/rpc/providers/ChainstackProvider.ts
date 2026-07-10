const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const CHAINSTACK_KEY = (e.VITE_ETH_RPC_CHAINSTACK as string | undefined) || "";

export const ChainstackProvider = {
  name: "Chainstack",
  getRpcUrl(chainId: number): string | null {
    if (!CHAINSTACK_KEY) return null;
    const key = CHAINSTACK_KEY.trim();
    if (!key) return null;

    if (key.startsWith("http")) {
      return chainId === 1 ? key : null;
    }
    return null;
  },
};
