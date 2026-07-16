import { describe, it, expect } from "vitest";
import { getRpcList, getPrimaryRpc } from "../../../config/rpcEndpoints";
import { getBalanceRpcList } from "../../../utils/evmProvider";
import { getPrivateRpcListFromPool } from "../rpcPool";
import { NETWORK_REGISTRY } from "../../../constants/networks/registry";

// Regression guard: adding a chain to the registry is not enough — the runtime
// RPC pool (PublicProvider) must also cover it, or balances silently never load
// (the original Arc bug).
describe("Arc chain RPC wiring", () => {
  for (const chainId of [5042, 5042002]) {
    it(`resolves at least one public RPC for chainId ${chainId}`, () => {
      expect(getRpcList(chainId).length).toBeGreaterThan(0);
      expect(getPrimaryRpc(chainId)).toMatch(/^https:\/\//);
      expect(getBalanceRpcList(chainId).length).toBeGreaterThan(0);
    });
  }

  it("registry entries have a non-empty rpcUrl for Arc", () => {
    expect(NETWORK_REGISTRY["arc"].rpcUrl).toMatch(/^https:\/\//);
    expect(NETWORK_REGISTRY["arc-testnet"].rpcUrl).toMatch(/^https:\/\//);
  });

  it("Arc native gas token uses 18 decimals (eth_getBalance view)", () => {
    expect(NETWORK_REGISTRY["arc"].nativeToken?.decimals).toBe(18);
    expect(NETWORK_REGISTRY["arc-testnet"].nativeToken?.decimals).toBe(18);
  });

  it("testnets never use paid/keyed providers (public RPC only)", () => {
    // Guard: keyed providers reserved for mainnet to save API quota.
    for (const testnetId of [11155111, 5042002]) {
      expect(getPrivateRpcListFromPool(testnetId)).toEqual([]);
      // Every testnet RPC URL must be a public one (no alchemy/infura hosts).
      for (const url of getRpcList(testnetId)) {
        expect(url).not.toMatch(/alchemy|infura|drpc\.org\/ogrpc|dkey=/i);
      }
    }
  });
});
