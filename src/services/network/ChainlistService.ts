import chainlist from "../../config/chainlist.json";

export interface ChainlistEntry {
  name: string;
  chain: string;
  chainId: number;
  networkId?: number;
  shortName?: string;
  icon?: string;
  infoURL?: string;
  rpc: string[];
  faucets?: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
  explorers?: { name?: string; url: string; standard?: string }[];
}

let _byId: Map<number, ChainlistEntry> | null = null;

export function getChainlistEntry(chainId: number): ChainlistEntry | null {
  if (!_byId) {
    _byId = new Map();
    for (const e of chainlist as unknown as ChainlistEntry[]) {
      if (Number.isFinite(e?.chainId)) _byId.set(e.chainId, e);
    }
  }
  return _byId.get(chainId) ?? null;
}

export function getCleanRpcUrls(entry: ChainlistEntry): string[] {
  return (entry.rpc || []).filter(
    (u) =>
      typeof u === "string" && u.startsWith("https://") && !u.includes("${"),
  );
}

export function getPrimaryExplorer(entry: ChainlistEntry): string | null {
  return entry.explorers?.[0]?.url ?? null;
}

export function chainlistSymbolMismatch(
  chainId: number,
  symbol: string | undefined,
): ChainlistEntry | null {
  const known = getChainlistEntry(chainId);
  if (!known || !symbol) return null;
  return known.nativeCurrency.symbol.toUpperCase() ===
    symbol.trim().toUpperCase()
    ? null
    : known;
}
