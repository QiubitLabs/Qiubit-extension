/**
 * UserNetworkService — persists user-added EVM networks (EIP-3085 format).
 *
 * User-added networks extend the built-in NETWORK_REGISTRY at runtime.
 * Stored in chrome.storage.local (extension context) with a localStorage
 * mirror for fast synchronous reads in React components.
 */

import type { NetworkConfig, HistoryApiConfig } from '../../constants/networks/registry';

const STORAGE_KEY = 'user_networks_v1';

/** Raw EIP-3085 payload from a dApp */
export interface EIP3085Network {
    chainId: string;           // hex, e.g. "0x89"
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
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

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
    } catch { /* quota exceeded — ignore */ }
}

async function readFromChromeStorage(): Promise<UserNetwork[]> {
    if (typeof chrome === 'undefined' || !chrome.storage) return readFromLocalStorage();
    try {
        const data = await chrome.storage.local.get([STORAGE_KEY]);
        return data[STORAGE_KEY] ? JSON.parse(data[STORAGE_KEY] as string) : [];
    } catch {
        return readFromLocalStorage();
    }
}

async function writeToChromeStorage(networks: UserNetwork[]): Promise<void> {
    writeToLocalStorage(networks); // mirror for fast reads
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    try {
        await chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(networks) });
    } catch { /* ignore */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns all user-added networks (fast, sync read from localStorage mirror). */
export function getUserNetworksSync(): UserNetwork[] {
    return readFromLocalStorage();
}

/** Returns all user-added networks (async, authoritative chrome.storage read). */
export async function getUserNetworks(): Promise<UserNetwork[]> {
    return readFromChromeStorage();
}

/** Add or update a user network by EIP-3085 payload. Returns the stored entry. */
export async function addUserNetwork(payload: EIP3085Network): Promise<UserNetwork> {
    const chainIdDecimal = parseInt(payload.chainId, 16);
    const networks = await readFromChromeStorage();

    const existing = networks.findIndex(n => n.chainIdDecimal === chainIdDecimal);
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

/** Remove a user network by decimal chainId. */
export async function removeUserNetwork(chainIdDecimal: number): Promise<void> {
    const networks = await readFromChromeStorage();
    await writeToChromeStorage(networks.filter(n => n.chainIdDecimal !== chainIdDecimal));
}

/** Lookup a user-added network by decimal chainId (sync). */
export function getUserNetworkByChainId(chainId: number): UserNetwork | null {
    return readFromLocalStorage().find(n => n.chainIdDecimal === chainId) ?? null;
}

/** Sync chrome.storage → localStorage mirror (call on extension startup). */
export async function syncUserNetworksToLocalStorage(): Promise<void> {
    const networks = await readFromChromeStorage();
    writeToLocalStorage(networks);
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/** Convert a UserNetwork to a partial NetworkConfig for use in the resolver. */
export function userNetworkToConfig(n: UserNetwork): NetworkConfig {
    const chainIdDecimal = n.chainIdDecimal;
    const rpcUrl = n.rpcUrls[0] ?? '';

    // Try to derive a history API from the block explorer URL
    let historyApi: HistoryApiConfig = { type: 'none' };
    const explorer = n.blockExplorerUrls?.[0];
    if (explorer) {
        // Heuristic: Etherscan-family explorers expose /api endpoint
        const apiBase = explorer.replace(/\/+$/, '') + '/api';
        historyApi = { type: 'etherscan_compatible', baseUrl: apiBase };
    }

    return {
        id: `user_${chainIdDecimal}`,
        displayName: n.chainName,
        shortName: n.nativeCurrency.symbol,
        chainId: chainIdDecimal,
        isEVM: true,
        isTestnet: /test|sepolia|goerli|mumbai|fuji|chapel|rinkeby|ropsten/i.test(n.chainName), // heuristic
        rpcUrl,
        iconUrl: n.iconUrls?.[0] ?? '/eth-icon.svg',
        badgeColor: '#627EEA',
        addressType: 'evm',
        nativeToken: {
            symbol: n.nativeCurrency.symbol,
            name: n.nativeCurrency.name,
            decimals: n.nativeCurrency.decimals,
            logoUrl: n.iconUrls?.[0] ?? '/eth-icon.svg',
        },
        erc20Tokens: [],
        blockExplorerUrl: explorer?.replace(/\/+$/, ''),
        historyApi,
    };
}
