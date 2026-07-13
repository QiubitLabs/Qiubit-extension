import { z } from "zod";

const SuiBalanceResponseSchema = z.object({
  jsonrpc: z.string(),
  result: z
    .object({
      totalBalance: z.string(),
    })
    .nullable()
    .optional(),
  id: z.union([z.number(), z.string()]).optional(),
});

const SuiCoinMetadataResponseSchema = z.object({
  jsonrpc: z.string(),
  result: z
    .object({
      symbol: z.string().optional().nullable(),
      name: z.string().optional().nullable(),
      decimals: z.number().optional().nullable(),
      iconUrl: z.string().optional().nullable(),
    })
    .nullable()
    .optional(),
  id: z.union([z.number(), z.string()]).optional(),
});

/** Public Sui Mainnet fullnodes, tried in order. */
export const SUI_MAINNET_RPCS = [
  "https://fullnode.mainnet.sui.io",
  "https://sui-rpc.publicnode.com",
  "https://rpc-mainnet.suiscan.xyz",
];

/**
 * Public Sui Testnet fullnodes, tried in order. The official
 * fullnode.testnet.sui.io is frequently unreachable, so the reliable public
 * providers go first and the official node is the last resort.
 */
export const SUI_TESTNET_RPCS = [
  "https://sui-testnet-rpc.publicnode.com",
  "https://rpc-testnet.suiscan.xyz",
  "https://fullnode.testnet.sui.io",
];

/** @deprecated single endpoint — prefer SUI_TESTNET_RPCS (fallback list). */
export const SUI_TESTNET_RPC = SUI_TESTNET_RPCS[0];

export class SuiRpcService {
  private rpcUrl: string;

  constructor(rpcUrl: string = SUI_MAINNET_RPCS[0]) {
    this.rpcUrl = rpcUrl;
  }

  /**
   * Fetch native SUI or custom SUI coin balance, trying each endpoint in the
   * list until one answers. Pass a list to target another cluster
   * (e.g. SUI_TESTNET_RPCS) or a custom network's RPC.
   */
  async getBalance(
    address: string,
    coinType: string = "0x2::sui::SUI",
    rpcUrls?: string | string[],
  ): Promise<string> {
    const urls =
      typeof rpcUrls === "string"
        ? [rpcUrls]
        : (rpcUrls ??
          (this.rpcUrl === SUI_MAINNET_RPCS[0]
            ? SUI_MAINNET_RPCS
            : [this.rpcUrl, ...SUI_MAINNET_RPCS]));
    let lastErr: unknown = null;
    for (const url of urls) {
      try {
        // Per-endpoint timeout so a dead node fails over fast instead of
        // hanging the whole balance cycle.
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(6000),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "suix_getBalance",
            params: [address, coinType],
          }),
        });
        if (!resp.ok) {
          lastErr = new Error(`Sui RPC HTTP ${resp.status} (${url})`);
          continue;
        }
        const data = await resp.json();
        const parsed = SuiBalanceResponseSchema.safeParse(data);
        if (parsed.success && parsed.data.result) {
          const total = parsed.data.result.totalBalance;
          if (coinType === "0x2::sui::SUI") {
            return (parseFloat(total) / 1e9).toFixed(6);
          }
          return total;
        }
        // A well-formed "no balance" answer is authoritative — don't fail over.
        if (parsed.success) return "0";
        lastErr = new Error(`Sui RPC malformed response (${url})`);
      } catch (e) {
        lastErr = e;
      }
    }
    console.error("[SuiRpcService] All SUI balance endpoints failed:", lastErr);
    return "0";
  }

  /**
   * Get recent transaction history for a Sui address
   */
  /**
   * Fetch ALL coin balances an address holds in a single RPC call via
   * suix_getAllBalances. Auto-discovers every Sui coin type, native or not.
   * Native SUI is returned in whole units; other coins as raw totals.
   */
  async getAllBalances(
    address: string,
  ): Promise<Array<{ coinType: string; balance: string; isNative: boolean }>> {
    try {
      const resp = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getAllBalances",
          params: [address],
        }),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      const rows = data?.result;
      if (!Array.isArray(rows)) return [];
      return rows
        .filter((r: any) => r?.coinType && Number(r.totalBalance) > 0)
        .map((r: any) => {
          const isNative = r.coinType === "0x2::sui::SUI";
          const raw = String(r.totalBalance);
          return {
            coinType: r.coinType,
            balance: isNative ? (parseFloat(raw) / 1e9).toFixed(6) : raw,
            isNative,
          };
        });
    } catch (e) {
      console.warn("[SuiRpcService] getAllBalances failed:", e);
      return [];
    }
  }

  private async queryTxBlocks(
    address: string,
    direction: "in" | "out",
    limit: number,
  ): Promise<any[]> {
    const filter =
      direction === "in"
        ? { ToAddress: address }
        : { FromAddress: address };
    const resp = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_queryTransactionBlocks",
        params: [
          { filter, options: { showInput: true, showEffects: true } },
          null,
          limit,
          true,
        ],
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const txs = data.result?.data || [];
    return txs.map((t: any) => {
      const timestamp = t.timestampMs ? parseFloat(t.timestampMs) : Date.now();
      const isSuccess = t.effects?.status?.status === "success";
      return {
        hash: t.digest,
        type: direction,
        amount: "0",
        address,
        timestamp,
        status: isSuccess ? "confirmed" : "failed",
        description: "Sui Transaction",
        networkId: "sui",
      };
    });
  }

  async getTransactionHistory(
    address: string,
    limit: number = 20,
  ): Promise<any[]> {
    try {
      // Query both directions and merge — Sui filters are one-directional
      const [incoming, outgoing] = await Promise.all([
        this.queryTxBlocks(address, "in", limit),
        this.queryTxBlocks(address, "out", limit),
      ]);
      const byHash = new Map<string, any>();
      // Outgoing wins on conflict (self-transfers show as "out")
      for (const tx of [...incoming, ...outgoing]) byHash.set(tx.hash, tx);
      return Array.from(byHash.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (e) {
      console.error(
        "[SuiRpcService] Failed to fetch Sui transaction history:",
        e,
      );
      return [];
    }
  }

  async getCoinMetadata(coinType: string): Promise<{
    symbol: string;
    name: string;
    decimals: number;
    logoUrl: string;
  } | null> {
    try {
      const resp = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getCoinMetadata",
          params: [coinType],
        }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const parsed = SuiCoinMetadataResponseSchema.safeParse(data);
      if (parsed.success && parsed.data.result) {
        const result = parsed.data.result;
        return {
          symbol: result.symbol || "UNK",
          name: result.name || "Unknown Sui Token",
          decimals: result.decimals || 9,
          logoUrl: result.iconUrl || "",
        };
      }
      return null;
    } catch (e) {
      console.error("[SuiRpcService] Failed to fetch coin metadata:", e);
      return null;
    }
  }
}

export const suiRpc = new SuiRpcService();
