import { z } from "zod";
import { InfuraProvider } from "../rpc/providers/InfuraProvider";

const SolanaTokenAccountsResponseSchema = z.object({
  jsonrpc: z.string(),
  result: z.object({
    value: z.array(
      z.object({
        account: z.object({
          data: z.object({
            parsed: z.object({
              info: z.object({
                tokenAmount: z.object({
                  uiAmountString: z.string().optional().nullable(),
                  uiAmount: z.number().optional().nullable(),
                }),
              }),
            }),
          }),
        }),
      }),
    ),
  }),
});

const SolanaAccountInfoResponseSchema = z.object({
  jsonrpc: z.string(),
  result: z
    .object({
      value: z
        .object({
          data: z.object({
            parsed: z.object({
              type: z.string(),
              info: z.object({
                decimals: z.number(),
              }),
            }),
          }),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

/**
 * Ordered Solana RPC endpoints for reads and sends. Infura (private) first if
 * configured, then reliable public nodes. api.mainnet-beta.solana.com is LAST
 * because it is heavily rate-limited (the cause of flaky timeouts).
 */
export type SolanaCluster = "mainnet" | "devnet" | "testnet";

const HELIUS_KEY = (import.meta.env?.VITE_HELIUS_API_KEY as string) || "";

/**
 * Public Solana Devnet endpoints only. Testnets/devnets deliberately skip the
 * paid Helius/Ankr keys — those are reserved for mainnet to save quota.
 */
const SOLANA_DEVNET_ENDPOINTS = ["https://api.devnet.solana.com"];

/** Public Solana Testnet endpoints. */
const SOLANA_TESTNET_ENDPOINTS = ["https://api.testnet.solana.com"];

export function getSolanaEndpoints(cluster: SolanaCluster = "mainnet"): string[] {
  if (cluster === "devnet") return [...SOLANA_DEVNET_ENDPOINTS];
  if (cluster === "testnet") return [...SOLANA_TESTNET_ENDPOINTS];
  const list: string[] = [];
  // Helius (keyed, reliable) is the primary mainnet endpoint.
  if (HELIUS_KEY)
    list.push(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`);
  try {
    const infura = InfuraProvider.getRpcUrl(1151111081099710);
    if (infura) list.push(infura);
  } catch {
    /* Infura optional */
  }
  for (const u of [
    "https://solana-rpc.publicnode.com",
    "https://solana.drpc.org",
    "https://api.mainnet-beta.solana.com",
  ]) {
    if (!list.includes(u)) list.push(u);
  }
  return list;
}

export class SolanaRpcService {
  private rpcUrl: string;

  constructor(rpcUrl: string = "https://solana-rpc.publicnode.com") {
    this.rpcUrl = rpcUrl;
  }

  /**
   * Fetch native SOL balance using Moralis Solana Wallet API (with RPC fallback)
   */
  async getBalance(
    address: string,
    cluster: SolanaCluster = "mainnet",
  ): Promise<string> {
    // Moralis only serves mainnet; devnet goes straight to public RPC.
    if (cluster === "mainnet") {
      try {
        const key = (import.meta.env.VITE_MORALIS_API_KEY as string) || "";
        if (key) {
          const resp = await fetch(
            `https://solana-gateway.moralis.io/account/mainnet/${address}/balance`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": key,
              },
            },
          );
          if (resp.ok) {
            const data = await resp.json();
            if (data && typeof data.solana === "string") {
              return parseFloat(data.solana).toFixed(6);
            }
          }
        }
      } catch (e) {
        console.warn(
          "[SolanaRpcService] Moralis balance fetch failed, falling back to RPC:",
          e,
        );
      }
    }

    const urls =
      cluster !== "mainnet"
        ? getSolanaEndpoints(cluster)
        : [this.rpcUrl, "https://solana.drpc.org", "https://api.mainnet-beta.solana.com"];
    let lastErr: unknown;
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [address],
          }),
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.result && typeof data.result.value === "number") {
          return (data.result.value / 1e9).toFixed(6);
        }
      } catch (e) {
        lastErr = e;
      }
    }
    console.error(
      "[SolanaRpcService] Failed to fetch balance across all endpoints:",
      lastErr,
    );
    return "0";
  }

  /**
   * Get recent transaction history for a Solana address
   */
  async getTransactionHistory(
    address: string,
    limit: number = 20,
  ): Promise<any[]> {
    const urls = [
      this.rpcUrl,
      "https://solana.drpc.org",
      "https://api.mainnet-beta.solana.com",
    ];
    let lastErr: unknown;
    for (const url of urls) {
      try {
        const sigResp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [address, { limit }],
          }),
        });
        if (!sigResp.ok) continue;
        const sigData = await sigResp.json();
        const signatures = sigData.result || [];

        return signatures.map((s: any) => {
          const timestamp = s.blockTime ? s.blockTime * 1000 : Date.now();
          return {
            hash: s.signature,
            type: "unknown", // can be in/out/swap
            amount: "0", // Native API signature lists don't include amounts directly
            address: address,
            timestamp,
            status: s.err ? "failed" : "confirmed",
            description: s.memo || "Solana Transaction",
            networkId: "solana",
          };
        });
      } catch (e) {
        lastErr = e;
      }
    }
    console.error(
      "[SolanaRpcService] Failed to fetch Solana history across all endpoints:",
      lastErr,
    );
    return [];
  }

  /**
   * Fetch balance of a Solana SPL token (mint) for a wallet address
   */
  async getSplBalance(
    walletAddress: string,
    mintAddress: string,
  ): Promise<string> {
    const urls = [
      this.rpcUrl,
      "https://solana.drpc.org",
      "https://api.mainnet-beta.solana.com",
    ];
    let lastErr: unknown;
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTokenAccountsByOwner",
            params: [
              walletAddress,
              { mint: mintAddress },
              { encoding: "jsonParsed" },
            ],
          }),
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const parsedResult = SolanaTokenAccountsResponseSchema.safeParse(data);
        if (parsedResult.success && parsedResult.data.result.value.length > 0) {
          const info =
            parsedResult.data.result.value[0].account.data.parsed.info;
          return (
            info.tokenAmount.uiAmountString ||
            String(info.tokenAmount.uiAmount || 0)
          );
        }
        return "0";
      } catch (e) {
        lastErr = e;
      }
    }
    console.warn("[SolanaRpcService] Failed to fetch SPL balance:", lastErr);
    return "0";
  }

  /**
   * Fetch ALL SPL token balances an owner holds in a single RPC call, via
   * getTokenAccountsByOwner filtered by the SPL Token program (not per-mint).
   * Auto-discovers every token the address holds, main or not.
   */
  async getAllTokenBalances(
    walletAddress: string,
  ): Promise<Array<{ mint: string; balance: string; decimals: number }>> {
    const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    const urls = [
      this.rpcUrl,
      "https://solana.drpc.org",
      "https://api.mainnet-beta.solana.com",
    ];
    const out: Array<{ mint: string; balance: string; decimals: number }> = [];
    const seen = new Set<string>();

    for (const programId of [TOKEN_PROGRAM, TOKEN_2022]) {
      for (const url of urls) {
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getTokenAccountsByOwner",
              params: [walletAddress, { programId }, { encoding: "jsonParsed" }],
            }),
          });
          if (!resp.ok) continue;
          const data = await resp.json();
          const accounts = data?.result?.value;
          if (!Array.isArray(accounts)) continue;
          for (const acc of accounts) {
            const info = acc?.account?.data?.parsed?.info;
            const mint = info?.mint;
            const amt = info?.tokenAmount;
            if (!mint || !amt || seen.has(mint)) continue;
            const bal = amt.uiAmountString ?? String(amt.uiAmount ?? "0");
            if (Number(bal) > 0) {
              seen.add(mint);
              out.push({
                mint,
                balance: bal,
                decimals: Number(amt.decimals ?? 9),
              });
            }
          }
          break; // this program succeeded; move to next program
        } catch {
          /* try next url */
        }
      }
    }
    return out;
  }

  /**
   * Fetch mint decimals using Solana JSON-RPC getAccountInfo
   */
  async getMintDecimals(mintAddress: string): Promise<number | null> {
    const urls = [
      this.rpcUrl,
      "https://solana.drpc.org",
      "https://api.mainnet-beta.solana.com",
    ];
    let lastErr: unknown;
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getAccountInfo",
            params: [mintAddress, { encoding: "jsonParsed" }],
          }),
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const parsedResult = SolanaAccountInfoResponseSchema.safeParse(data);
        if (
          parsedResult.success &&
          parsedResult.data.result &&
          parsedResult.data.result.value
        ) {
          const parsedData = parsedResult.data.result.value.data.parsed;
          if (parsedData && parsedData.type === "mint" && parsedData.info) {
            return parsedData.info.decimals;
          }
        }
      } catch (e) {
        lastErr = e;
      }
    }
    console.warn("[SolanaRpcService] Failed to fetch mint decimals:", lastErr);
    return null;
  }
}

export const solanaRpc = new SolanaRpcService();
