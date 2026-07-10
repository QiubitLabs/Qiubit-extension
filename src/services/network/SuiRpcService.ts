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

export class SuiRpcService {
  private rpcUrl: string;

  constructor(rpcUrl: string = "https://fullnode.mainnet.sui.io") {
    this.rpcUrl = rpcUrl;
  }

  /**
   * Fetch native SUI or custom SUI coin balance
   */
  async getBalance(
    address: string,
    coinType: string = "0x2::sui::SUI",
  ): Promise<string> {
    try {
      const resp = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getBalance",
          params: [address, coinType],
        }),
      });
      if (!resp.ok) return "0";
      const data = await resp.json();
      const parsed = SuiBalanceResponseSchema.safeParse(data);
      if (parsed.success && parsed.data.result) {
        const total = parsed.data.result.totalBalance;
        if (coinType === "0x2::sui::SUI") {
          return (parseFloat(total) / 1e9).toFixed(6);
        }
        return total;
      }
      return "0";
    } catch (e) {
      console.error("[SuiRpcService] Failed to fetch SUI balance:", e);
      return "0";
    }
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
