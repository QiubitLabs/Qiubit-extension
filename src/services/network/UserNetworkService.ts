/**
 * UserNetworkService — persists user-added EVM networks (EIP-3085 format).
 *
 * User-added networks extend the built-in NETWORK_REGISTRY at runtime.
 * Stored in chrome.storage.local (extension context) with a localStorage
 * mirror for fast synchronous reads in React components.
 */

import type {
  NetworkConfig,
  HistoryApiConfig,
} from "../../constants/networks/registry";

const STORAGE_KEY = "user_networks_v1";

/** Virtual machine a custom network runs. EVM is the default (dApp-added). */
export type NetworkVm = "evm" | "svm" | "suivm";

/** Synthetic chainId bands for non-EVM custom networks (unique, never collide
 * with real EVM chainIds or the built-in Solana/Sui sentinels). */
const SVM_CHAINID_BASE = 1_151_111_081_200_000;
// Below Number.MAX_SAFE_INTEGER so +1 increments stay exactly representable.
const SUIVM_CHAINID_BASE = 8_460_000_000_000_000;

/** Raw EIP-3085 payload from a dApp */
export interface EIP3085Network {
  chainId: string; // hex, e.g. "0x89"
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  iconUrls?: string[];
}

/** User-added network stored internally */
export interface UserNetwork extends EIP3085Network {
  addedAt: number;
  /** Derived decimal chainId for convenience */
  chainIdDecimal: number;
  /** VM this network runs. Absent = legacy EVM entry. */
  vm?: NetworkVm;
}

/** Fields for a manually-added custom network of any VM. */
export interface CustomNetworkInput {
  vm: NetworkVm;
  name: string;
  rpcUrl: string;
  nativeSymbol: string;
  nativeName?: string;
  nativeDecimals: number;
  explorerUrl?: string;
  iconUrl?: string;
  /** EVM only: decimal chainId. Ignored for svm/suivm (synthetic id assigned). */
  chainId?: number;
}

function readFromLocalStorage(): UserNetwork[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeToLocalStorage(networks: UserNetwork[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(networks));
  } catch {
    /* quota exceeded — ignore */
  }
}

async function readFromChromeStorage(): Promise<UserNetwork[]> {
  if (typeof chrome === "undefined" || !chrome.storage)
    return readFromLocalStorage();
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    return data[STORAGE_KEY] ? JSON.parse(data[STORAGE_KEY] as string) : [];
  } catch {
    return readFromLocalStorage();
  }
}

async function writeToChromeStorage(networks: UserNetwork[]): Promise<void> {
  writeToLocalStorage(networks); // mirror for fast reads
  if (typeof chrome === "undefined" || !chrome.storage) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(networks) });
  } catch {
    /* ignore */
  }
}

/** Returns all user-added networks (fast, sync read from localStorage mirror). */
export function getUserNetworksSync(): UserNetwork[] {
  return readFromLocalStorage();
}

/** Returns all user-added networks (async, authoritative chrome.storage read). */
export async function getUserNetworks(): Promise<UserNetwork[]> {
  return readFromChromeStorage();
}

/** Add or update a user network by EIP-3085 payload. Returns the stored entry. */
export async function addUserNetwork(
  payload: EIP3085Network,
): Promise<UserNetwork> {
  const chainIdDecimal = parseInt(payload.chainId, 16);
  const networks = await readFromChromeStorage();

  const existing = networks.findIndex(
    (n) => n.chainIdDecimal === chainIdDecimal,
  );
  const entry: UserNetwork = {
    ...payload,
    chainIdDecimal,
    addedAt: existing >= 0 ? networks[existing].addedAt : Date.now(),
  };

  if (existing >= 0) {
    networks[existing] = entry;
  } else {
    networks.push(entry);
  }

  await writeToChromeStorage(networks);
  return entry;
}

/**
 * Add a manually-configured custom network of any VM (EVM / Solana-VM / Sui-VM).
 * EVM networks keep their real chainId; SVM/Sui networks get a synthetic id from
 * a reserved band so they never collide with real chainIds.
 */
export async function addCustomNetwork(
  input: CustomNetworkInput,
): Promise<UserNetwork> {
  const networks = await readFromChromeStorage();

  let chainIdDecimal: number;
  if (input.vm === "evm") {
    if (!input.chainId) throw new Error("EVM network requires a chainId.");
    chainIdDecimal = input.chainId;
  } else {
    const base =
      input.vm === "svm" ? SVM_CHAINID_BASE : SUIVM_CHAINID_BASE;
    const sameVm = networks.filter((n) => n.vm === input.vm);
    const existing = sameVm.find((n) => n.rpcUrls[0] === input.rpcUrl);
    chainIdDecimal = existing?.chainIdDecimal ?? base + sameVm.length + 1;
  }

  const entry: UserNetwork = {
    chainId: "0x" + chainIdDecimal.toString(16),
    chainName: input.name.trim(),
    nativeCurrency: {
      name: (input.nativeName || input.nativeSymbol).trim(),
      symbol: input.nativeSymbol.trim(),
      decimals: input.nativeDecimals,
    },
    rpcUrls: [input.rpcUrl.trim()],
    blockExplorerUrls: input.explorerUrl
      ? [input.explorerUrl.trim()]
      : undefined,
    iconUrls: input.iconUrl ? [input.iconUrl.trim()] : undefined,
    chainIdDecimal,
    vm: input.vm,
    addedAt: Date.now(),
  };

  const idx = networks.findIndex((n) => n.chainIdDecimal === chainIdDecimal);
  if (idx >= 0) {
    entry.addedAt = networks[idx].addedAt;
    networks[idx] = entry;
  } else {
    networks.push(entry);
  }
  await writeToChromeStorage(networks);
  return entry;
}

/** Remove a user network by decimal chainId. */
export async function removeUserNetwork(chainIdDecimal: number): Promise<void> {
  const networks = await readFromChromeStorage();
  await writeToChromeStorage(
    networks.filter((n) => n.chainIdDecimal !== chainIdDecimal),
  );
}

/** Lookup a user-added network by decimal chainId (sync). */
export function getUserNetworkByChainId(chainId: number): UserNetwork | null {
  return (
    readFromLocalStorage().find((n) => n.chainIdDecimal === chainId) ?? null
  );
}

/** Sync chrome.storage → localStorage mirror (call on extension startup). */
export async function syncUserNetworksToLocalStorage(): Promise<void> {
  const networks = await readFromChromeStorage();
  writeToLocalStorage(networks);
}

/** Convert a UserNetwork to a partial NetworkConfig for use in the resolver. */
export function userNetworkToConfig(n: UserNetwork): NetworkConfig {
  const chainIdDecimal = n.chainIdDecimal;
  const rpcUrl = n.rpcUrls[0] ?? "";
  const vm: NetworkVm = n.vm ?? "evm";
  const isEVM = vm === "evm";
  const addressType =
    vm === "svm" ? "solana" : vm === "suivm" ? "sui" : "evm";
  // No stock-chain fallback icons for custom networks: if the user (or RPC
  // payload) didn't provide one, leave it empty — the UI then renders the
  // network/native-token initial instead of a misleading ETH/SOL/SUI logo.
  const icon = n.iconUrls?.[0] ?? "";
  const badge =
    vm === "svm" ? "#14F195" : vm === "suivm" ? "#6FB9FF" : "#627EEA";

  // etherscan-compatible history only makes sense for EVM explorers.
  let historyApi: HistoryApiConfig = { type: "none" };
  const explorer = n.blockExplorerUrls?.[0];
  if (explorer && isEVM) {
    const apiBase = explorer.replace(/\/+$/, "") + "/api";
    historyApi = { type: "etherscan_compatible", baseUrl: apiBase };
  }

  return {
    id: `user_${chainIdDecimal}`,
    displayName: n.chainName,
    shortName: n.nativeCurrency.symbol,
    chainId: chainIdDecimal,
    isEVM,
    isTestnet: /test|devnet|sepolia|goerli|mumbai|fuji|chapel|rinkeby|ropsten/i.test(
      n.chainName,
    ), // heuristic
    rpcUrl,
    iconUrl: icon,
    badgeColor: badge,
    addressType,
    nativeToken: {
      symbol: n.nativeCurrency.symbol,
      name: n.nativeCurrency.name,
      decimals: n.nativeCurrency.decimals,
      logoUrl: icon,
    },
    erc20Tokens: [],
    blockExplorerUrl: explorer?.replace(/\/+$/, ""),
    historyApi,
  };
}
