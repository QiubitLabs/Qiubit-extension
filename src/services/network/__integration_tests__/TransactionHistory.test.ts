import { describe, it, expect } from "vitest";
import { getRpcClient } from "../RpcService";

const RPC_URL = process.env.VITE_RPC_URL || "https://octra.network/rpc";

describe("RPC Integration: Transaction History", () => {
  const client = getRpcClient();
  client.setRpcUrl(RPC_URL);

  const TARGET_ADDRESS = "oct3SSKjCGK8pVxPHH1Y6LZEVqm94rZn3StXHt31AD1UUVN";

  it("should fetch address info (balance/nonce)", async () => {
    const start = performance.now();
    const info = await client.getBalance(TARGET_ADDRESS);
    const duration = performance.now() - start;

    console.log(`[Integration] getBalance took ${duration.toFixed(2)}ms`);
    console.log(`[Integration] Result:`, info);

    expect(info).toHaveProperty("balance");
    expect(info).toHaveProperty("nonce");
    expect(typeof info.balance).toBe("number");
  }, 50000);

  it("should fetch transaction list", async () => {
    const start = performance.now();
    const limit = 2;
    const info = await client.getAddressInfo(TARGET_ADDRESS, limit);
    const duration = performance.now() - start;

    console.log(
      `[Integration] getAddressInfo (limit=${limit}) took ${duration.toFixed(2)}ms`,
    );
    console.log(
      `[Integration] Tx Count Fetched:`,
      info.recent_transactions.length,
    );

    expect(info).toHaveProperty("recent_transactions");
    expect(Array.isArray(info.recent_transactions)).toBe(true);
  }, 50000);

  it("should batch fetch transactions efficiently", async () => {
    const targetTxs = [
      {
        hash: "0000000000000000000000000000000000000000000000000000000000000123",
      },
      {
        hash: "0000000000000000000000000000000000000000000000000000000000000456",
      },
      {
        hash: "0000000000000000000000000000000000000000000000000000000000000789",
      },
    ];

    console.log(
      `[Integration] Testing batch fetch with ${targetTxs.length} items`,
    );

    const batchCalls = targetTxs.map((tx: any) => ({
      method: "octra_transaction",
      params: [tx.hash],
    }));

    const start = performance.now();
    const results = await client.jsonRpcBatchCall(batchCalls);
    const duration = performance.now() - start;

    console.log(`[Integration] Batch fetch took ${duration.toFixed(2)}ms`);
    console.log(`[Integration] Batch Result Status: ${results.status}`);

    expect(results.ok).toBe(true);
    expect(Array.isArray(results.json)).toBe(true);

    if (results.json) {
      expect(results.json.length).toBe(targetTxs.length);
    }
  }, 50000);
});
