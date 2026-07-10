import { describe, it, expect } from "vitest";
import { getRpcClient } from "../RpcService";

describe("Gas Fee & Staging Integration Test", () => {
  const client = getRpcClient();
  client.setRpcUrl("https://octra.network/rpc");

  it("should fetch accurate gas fee estimates", async () => {
    console.log("--- Gas Fee Accuracy Check ---");
    const fees = await client.getFeeEstimate();
    console.log("Fee Estimates:", fees);

    expect(fees.low).toBeGreaterThan(0);
    expect(fees.medium).toBeGreaterThanOrEqual(fees.low);
    expect(fees.high).toBeGreaterThanOrEqual(fees.medium);

    expect(fees.baseFee).toBeDefined();
  }, 15000); // Increased timeout

  it("should fetch network metrics for congestion analysis", async () => {
    console.log("--- Network Metrics Check ---");
    const metrics = await client.getNetworkMetrics();
    console.log("Live Metrics:", metrics);

    if (metrics) {
      expect(metrics.total_transactions).toBeDefined();
    } else {
      console.warn("Metrics endpoint returned null - check network or CORS");
    }
  }, 15000);

  it("should verify staging/mempool access", async () => {
    console.log("--- Mempool Access Check ---");
    const staged = await client.getStagedTransactions();
    console.log(`Staged Transactions (Pending): ${staged.length}`);
    expect(Array.isArray(staged)).toBe(true);
  }, 15000);

  it("should verify accuracy of metrics vs fee", async () => {
    const [metrics, poolStats, fees] = await Promise.all([
      client.getNetworkMetrics(),
      client.getPoolStats(),
      client.getFeeEstimate(),
    ]);

    console.log("--- Accuracy Analysis ---");

    if (poolStats) {
      console.log(`Mempool Queue: ${poolStats.total_transactions}`);
    }

    if (metrics) {
      console.log(`Network Load (TPS): ${metrics.peak_tps || 0}`);
    }

    console.log(`Current Base Fee: ${fees.baseFee} (Low: ${fees.low})`);

    let expectedMultiplier = 1;
    if (poolStats && poolStats.total_transactions > 100) expectedMultiplier = 2;
    else if (poolStats && poolStats.total_transactions > 20)
      expectedMultiplier = 1.5;

    const confirmedBase = 0.01 * expectedMultiplier;
    const expectedLow = confirmedBase * 0.75;

    expect(fees.low).toBeCloseTo(expectedLow, 5);
    expect(fees.high).toBeCloseTo(confirmedBase * 1.5, 5);

    if (expectedMultiplier > 1) {
      console.log(
        `Congestion Detected (Multiplier ${expectedMultiplier}x). Fee: ${confirmedBase}`,
      );
    } else {
      console.log(
        `Normal Traffic. Base: ${confirmedBase}, Low: ${expectedLow}`,
      );
    }
  }, 15000);

  it("should verify transaction history endpoint structure", async () => {
    console.log("--- Transaction History Check ---");
    const testAddress =
      "0000000000000000000000000000000000000000000000000000000000000001";

    try {
      const info = await client.getAddressInfo(testAddress);
      console.log("Address Info:", info);

      expect(info).toBeDefined();
      expect(Array.isArray(info.recent_transactions)).toBe(true);
    } catch (e: any) {
      console.warn("Address Info failed:", e);
      if (e.message.includes("invalid address")) {
        console.log(
          "Endpoint reached but address rejected (Expected for dummy)",
        );
      } else {
        throw e;
      }
    }
  }, 15000);
});
