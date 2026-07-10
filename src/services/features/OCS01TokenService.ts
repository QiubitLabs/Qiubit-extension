/**
 * OCS01 Token Service
 *
 * OCS01 is Octra's native token standard (similar to ERC-20).
 * Standard interface methods: get_name(), get_symbol(), balance_of(), transfer(), etc.
 *
 * Storage: per-wallet list of { address, name, symbol, decimals }
 * Key: custom_ocs01_tokens_v2  (v1 was address-only arrays — migrated on load)
 */

import { getRpcClient } from "../network/RpcService";
import {
  buildContractCallTransaction,
  signTransaction,
} from "../../utils/transactionBuilder";
import {
  loadCustomTokensSecure,
  saveCustomTokensSecure,
} from "../../utils/storage";

export const KNOWN_CONTRACTS = {
  testnet: [
    {
      address: "octBUHw585BrAMPMLQvGuWx4vqEsybYH9N7a3WNj1WBwrDn",
      name: "OCS01 Test Contract",
      symbol: "OCS01",
      decimals: 6,
      description: "Official OCS01 test contract",
      verified: true,
    },
  ],
  mainnet: [] as Array<{
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    description: string;
    verified: boolean;
  }>,
};

export interface OCS01UserToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export class OCS01Contract {
  public contractAddress: string;

  constructor(contractAddress: string) {
    this.contractAddress = contractAddress;
  }

  /**
   * Call a read-only view method via JSON-RPC `contract_call`.
   * Returns the `result` field of the JSON-RPC response, or null on failure.
   */
  async callView(
    method: string,
    params: any[] = [],
    callerAddress?: string,
  ): Promise<any> {
    try {
      const rpc = getRpcClient();
      const resp = await rpc.callContractView(
        this.contractAddress,
        method,
        params,
        callerAddress ?? this.contractAddress,
      );
      if (!resp || resp.error) return null;
      return resp.result ?? null;
    } catch {
      return null;
    }
  }

  async getName(callerAddress?: string): Promise<string | null> {
    return this.callView("get_name", [], callerAddress);
  }

  async getSymbol(callerAddress?: string): Promise<string | null> {
    return this.callView("get_symbol", [], callerAddress);
  }

  async getDecimals(callerAddress?: string): Promise<number | null> {
    const raw = await this.callView("get_decimals", [], callerAddress);
    return raw != null ? Number(raw) : null;
  }

  async getTotalSupply(callerAddress?: string): Promise<number | null> {
    const raw = await this.callView("get_total_supply", [], callerAddress);
    return raw != null ? Number(raw) : null;
  }

  /** Standard OCS-01 balance method */
  async balanceOf(address: string): Promise<number | null> {
    const raw = await this.callView("balance_of", [address], address);
    return raw != null ? Number(raw) : null;
  }

  /** Legacy test-contract balance method (fallback) */
  async getCredits(address: string): Promise<number | null> {
    const raw = await this.callView("getCredits", [address], address);
    return raw != null ? Number(raw) : null;
  }

  /** Fetch balance using standard balance_of(), falling back to getCredits() */
  async fetchBalance(address: string): Promise<number> {
    const standard = await this.balanceOf(address);
    if (standard != null) return standard;
    const legacy = await this.getCredits(address);
    return legacy ?? 0;
  }

  async greetCaller(callerAddress: string): Promise<any> {
    return this.callView("greet_caller", [], callerAddress);
  }

  async getSpec(callerAddress: string): Promise<any> {
    return this.callView("get_spec", [], callerAddress);
  }

  async transfer(
    recipient: string,
    amount: number,
    callerAddress: string,
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const rpc = getRpcClient();
      const tx = await buildContractCallTransaction(
        this.contractAddress,
        "transfer",
        [recipient, amount],
        callerAddress,
      );
      const signedTx = await signTransaction(tx, callerAddress);
      const result = await rpc.sendTransaction(signedTx);
      return { success: true, txHash: result.txHash };
    } catch (err: any) {
      return { success: false, error: err.message || "Transfer failed" };
    }
  }
}

const STORAGE_KEY = "custom_ocs01_tokens_v2";
const LEGACY_STORAGE_KEY = "qiubit_custom_tokens";

export class OCS01Manager {
  /** userAddress → list of custom tokens */
  private _tokens: Map<string, OCS01UserToken[]> = new Map();
  private _password: string | null = null;
  private _contracts: Map<string, OCS01Contract> = new Map();

  async initializeSecure(password: string) {
    this._password = password;
    await this._loadSecure();
    await this._migrateLegacy();
  }

  getContract(address: string): OCS01Contract {
    if (!this._contracts.has(address)) {
      this._contracts.set(address, new OCS01Contract(address));
    }
    return this._contracts.get(address)!;
  }

  private async _loadSecure() {
    if (!this._password) return;
    try {
      const raw = await loadCustomTokensSecure(this._password);
      if (!raw) return;
      for (const [userAddr, value] of Object.entries(
        raw as Record<string, any>,
      )) {
        if (Array.isArray(value)) {
          if (value.length === 0 || typeof value[0] === "object") {
            this._tokens.set(userAddr, value as OCS01UserToken[]);
          } else {
            this._tokens.set(
              userAddr,
              (value as string[]).map((addr) => ({
                address: addr,
                name: "Custom Contract",
                symbol: "CUST",
                decimals: 6,
              })),
            );
          }
        }
      }
    } catch (e) {
      console.error("[OCS01] Load failed:", e);
    }
  }

  private async _save() {
    if (!this._password) return;
    const data: Record<string, OCS01UserToken[]> = {};
    this._tokens.forEach((tokens, addr) => {
      data[addr] = tokens;
    });
    await saveCustomTokensSecure(data, this._password);
  }

  /** Migrate the old localStorage key (pre-v1) to secure storage */
  private async _migrateLegacy() {
    try {
      const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Record<string, string[]>;
      let changed = false;
      for (const [userAddr, addrs] of Object.entries(parsed)) {
        if (!Array.isArray(addrs)) continue;
        const existing = this._tokens.get(userAddr) ?? [];
        const existingAddrs = new Set(existing.map((t) => t.address));
        for (const addr of addrs) {
          if (!existingAddrs.has(addr)) {
            existing.push({
              address: addr,
              name: "Custom Contract",
              symbol: "CUST",
              decimals: 6,
            });
            changed = true;
          }
        }
        this._tokens.set(userAddr, existing);
      }
      if (changed) await this._save();
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (e) {
      console.warn("[OCS01] Legacy migration failed (non-critical):", e);
    }
  }

  /**
   * Add a custom OCS-01 token for a wallet. Deduplicates by contract address.
   */
  async addUserContract(userAddress: string, token: OCS01UserToken) {
    if (!this._password) throw new Error("Wallet locked: cannot add token");
    const list = this._tokens.get(userAddress) ?? [];
    const idx = list.findIndex((t) => t.address === token.address);
    if (idx >= 0) {
      list[idx] = token; // update existing
    } else {
      list.push(token);
    }
    this._tokens.set(userAddress, list);
    await this._save();
  }

  /**
   * Remove a custom token.
   */
  async removeUserContract(userAddress: string, contractAddress: string) {
    const list = this._tokens.get(userAddress) ?? [];
    this._tokens.set(
      userAddress,
      list.filter((t) => t.address !== contractAddress),
    );
    await this._save();
  }

  getKnownContracts(network = "testnet") {
    return (KNOWN_CONTRACTS as any)[network] ?? [];
  }

  /**
   * Fetch all token balances for a wallet (known + custom), in parallel batches.
   */
  async getUserTokenBalances(userAddress: string, network = "testnet") {
    const known: OCS01UserToken[] = this.getKnownContracts(network).map(
      (c: any) => ({
        address: c.address,
        name: c.name,
        symbol: c.symbol,
        decimals: c.decimals ?? 6,
      }),
    );

    const custom = (this._tokens.get(userAddress) ?? []).filter(
      (t) => !known.some((k) => k.address === t.address),
    );

    // Auto-discover any OCS-01 token the node reports for this address, so the
    // user sees tokens they hold without adding each contract manually.
    let discovered: Array<{ token: OCS01UserToken; balanceRaw: string }> = [];
    try {
      const { getRpcClient } = await import("../network/RpcService");
      const rows = await getRpcClient().getTokensByAddress(userAddress);
      const claimed = new Set(
        [...known, ...custom].map((t) => t.address.toLowerCase()),
      );
      discovered = rows
        .filter((r) => !claimed.has(r.address.toLowerCase()))
        .map((r) => ({
          token: {
            address: r.address,
            name: r.name,
            symbol: r.symbol,
            decimals: r.decimals,
          },
          balanceRaw: r.balanceRaw,
        }));
    } catch {
      /* discovery is best-effort; known/custom still load */
    }

    const all = [
      ...known.map((t) => ({ ...t, verified: true, isCustom: false })),
      ...custom.map((t) => ({ ...t, verified: false, isCustom: true })),
      ...discovered.map((d) => ({
        ...d.token,
        verified: false,
        isCustom: false,
        _discoveredBalanceRaw: d.balanceRaw,
      })),
    ];

    if (all.length === 0) return [];

    const results: any[] = [];
    const BATCH = 3;
    for (let i = 0; i < all.length; i += BATCH) {
      if (i > 0) await new Promise((r) => setTimeout(r, 200));
      const batch = all.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (target: any) => {
          try {
            // Discovered tokens already carry a raw balance from the node —
            // skip the extra balance_of round-trip.
            const balance =
              target._discoveredBalanceRaw !== undefined
                ? Number(target._discoveredBalanceRaw)
                : await Promise.race([
                    this.getContract(target.address).fetchBalance(userAddress),
                    new Promise<number>((_, rej) =>
                      setTimeout(() => rej(new Error("timeout")), 10000),
                    ),
                  ]);
            return {
              contractAddress: target.address,
              contractName: target.name,
              symbol: target.symbol,
              decimals: target.decimals,
              balance,
              verified: target.verified,
              isCustom: target.isCustom,
            };
          } catch {
            return null;
          }
        }),
      );
      results.push(...batchResults.filter(Boolean));
    }
    return results;
  }

  /** Look up token metadata from chain (for Add Token preview) */
  async lookupToken(
    contractAddress: string,
    callerAddress: string,
  ): Promise<OCS01UserToken | null> {
    const contract = this.getContract(contractAddress);
    const [name, symbol, decimals] = await Promise.all([
      contract.getName(callerAddress),
      contract.getSymbol(callerAddress),
      contract.getDecimals(callerAddress),
    ]);
    if (!name && !symbol) return null;
    return {
      address: contractAddress,
      name: name ?? contractAddress.slice(0, 12) + "…",
      symbol: symbol ?? contractAddress.slice(3, 7).toUpperCase(),
      decimals: decimals != null ? Number(decimals) : 6,
    };
  }

  getTokenMetadataSync(
    contractAddress: string,
    userAddress: string,
    network = "testnet",
  ): OCS01UserToken | null {
    const addrLower = contractAddress.toLowerCase();
    const known = this.getKnownContracts(network);
    const kFound = known.find(
      (c: any) => c.address.toLowerCase() === addrLower,
    );
    if (kFound)
      return {
        address: kFound.address,
        name: kFound.name,
        symbol: kFound.symbol,
        decimals: kFound.decimals,
      };

    const custom = this._tokens.get(userAddress) ?? [];
    const cFound = custom.find((t) => t.address.toLowerCase() === addrLower);
    if (cFound) return cFound;

    return null;
  }

  async getTokenMetadata(
    contractAddress: string,
    userAddress: string,
    network = "testnet",
  ): Promise<OCS01UserToken> {
    const cached = this.getTokenMetadataSync(
      contractAddress,
      userAddress,
      network,
    );
    if (cached) return cached;
    try {
      const fetched = await this.lookupToken(contractAddress, userAddress);
      if (fetched) return fetched;
    } catch (e) {
      console.warn("[OCS01] Failed to lookup token metadata on-chain:", e);
    }
    return {
      address: contractAddress,
      name: "Unknown OCS01",
      symbol: "OCS01",
      decimals: 6,
    };
  }
}

export const ocs01Manager = new OCS01Manager();
export { STORAGE_KEY };
