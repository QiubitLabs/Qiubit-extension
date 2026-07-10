const e =
  typeof import.meta !== "undefined"
    ? import.meta.env
    : ({} as Record<string, string>);
const DRPC_KEY = (e.VITE_ETH_RPC_DRPC as string | undefined) || "";

export const DrpcProvider = {
  name: "dRPC",
  getRpcUrl(chainId: number): string | null {
    if (!DRPC_KEY) return null;
    const key = DRPC_KEY.includes("/dapi.drpc.org")
      ? DRPC_KEY
      : DRPC_KEY.trim();
    if (!key) return null;

    if (key.startsWith("http")) {
      return chainId === 1 ? key : null;
    }

    if (chainId === 1) {
      return `https://lb.drpc.org/ogrpc?network=ethereum&key=${key}`;
    }
    return null;
  },
};
