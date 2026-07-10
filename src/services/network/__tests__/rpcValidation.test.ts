import { describe, it, expect } from "vitest";
import { suiRpc } from "../SuiRpcService";
import { solanaRpc } from "../SolanaRpcService";

describe("Sui and Solana RPC External Data Validation", () => {
  it("should fetch SUI native balance and validate using Zod", async () => {
    const address =
      "0x53616f7c5e2d634db6d9df16a70e704de849202573210d7a6bc6663f7eb21516";
    const balance = await suiRpc.getBalance(address);
    expect(balance).toBeDefined();
    expect(parseFloat(balance)).toBeGreaterThanOrEqual(0);
  }, 15000);

  it("should fetch Sui coin metadata and validate using Zod", async () => {
    const coinType = "0x2::sui::SUI";
    const metadata = await suiRpc.getCoinMetadata(coinType);
    expect(metadata).not.toBeNull();
    if (metadata) {
      expect(metadata.symbol).toBe("SUI");
      expect(metadata.decimals).toBe(9);
    }
  }, 15000);

  it("should fetch Solana native balance and validate", async () => {
    const address = "E643tVnZ7T4mg6JfKnccXYNHv78oP6J1gZ6aK5p3B6u2";
    const balance = await solanaRpc.getBalance(address);
    expect(balance).toBeDefined();
    expect(parseFloat(balance)).toBeGreaterThanOrEqual(0);
  }, 15000);

  it("should fetch Solana SPL balance and validate using Zod", async () => {
    const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const wallet = "E643tVnZ7T4mg6JfKnccXYNHv78oP6J1gZ6aK5p3B6u2";
    const balance = await solanaRpc.getSplBalance(wallet, usdcMint);
    expect(balance).toBeDefined();
    expect(parseFloat(balance)).toBeGreaterThanOrEqual(0);
  }, 15000);

  it("should fetch Solana mint decimals and validate using Zod", async () => {
    const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const decimals = await solanaRpc.getMintDecimals(usdcMint);
    expect(decimals).toBe(6);
  }, 15000);
});
