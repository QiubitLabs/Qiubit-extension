import { SessionService } from "../services/core/SessionService";
import { keyringService } from "../services/core/KeyringService";
import {
  activeDappPorts,
  dappConnections,
  solanaConnections,
  suiConnections,
  activeSessionCache,
  setActiveSessionCache,
  setMemorySessionKey,
} from "./store";
import type { SessionCache, WalletInfo } from "./types";

export async function readDappSession(): Promise<SessionCache | null> {
  try {
    const data = await chrome.storage.session.get(["dapp_wallet_session"]);
    if (data?.dapp_wallet_session) {
      const session = JSON.parse(
        data.dapp_wallet_session as string,
      ) as SessionCache;
      setActiveSessionCache(session);
      return session;
    }
  } catch (_) {}
  return null;
}

function sessionToWalletInfo(session: SessionCache | null): WalletInfo | null {
  if (!session?.address) return null;
  return {
    address: session.address,
    evmAddress: session.evmAddress || null,
    solanaAddress: (session as any).solanaAddress || null,
    suiAddress: (session as any).suiAddress || null,
    publicKeyB64: session.publicKeyB64 || session.publicKey || null,
    network: session.network || "octra",
  };
}

export async function getWalletFromStorage(): Promise<WalletInfo | null> {
  if (!SessionService.isValid()) {
    try {
      await SessionService.restoreSession();
    } catch (e) {
      console.warn("[Background] On-demand session restore failed:", e);
    }
  }

  if (!SessionService.isValid()) {
    setMemorySessionKey(null);
    setActiveSessionCache(null);
    return null;
  }

  try {
    const activeAddr =
      keyringService.getActiveAddress() ?? keyringService.getAddresses()[0];
    if (activeAddr) {
      const info: WalletInfo = {
        address: activeAddr,
        evmAddress: keyringService.getEvmAddress(activeAddr) || null,
        solanaAddress: keyringService.getSolanaAddress(activeAddr) || null,
        suiAddress: keyringService.getSuiAddress(activeAddr) || null,
        publicKeyB64: keyringService.getPublicKey(activeAddr) || null,
        network: activeSessionCache?.network || "octra",
      };
      return info;
    }
  } catch (_) {}

  return sessionToWalletInfo(await readDappSession());
}

export async function getWalletPublicInfo(): Promise<WalletInfo | null> {
  const fromSession = sessionToWalletInfo(await readDappSession());
  if (fromSession) return fromSession;

  try {
    const activeAddr = keyringService.getActiveAddress();
    if (activeAddr) {
      return {
        address: activeAddr,
        evmAddress: keyringService.getEvmAddress(activeAddr) || null,
        solanaAddress: keyringService.getSolanaAddress(activeAddr) || null,
        suiAddress: keyringService.getSuiAddress(activeAddr) || null,
        publicKeyB64: keyringService.getPublicKey(activeAddr) || null,
        network: "octra",
      };
    }
  } catch (_) {}

  return null;
}

export interface DappGuardError {
  code: number;
  message: string;
}

export async function requireConnectedWallet(
  connection: { connected?: boolean } | undefined,
  opts: {
    notConnectedMessage: string;
    lockedCode?: number;
    lockedMessage?: string;
  },
): Promise<
  | { wallet: WalletInfo; error?: undefined }
  | { wallet?: undefined; error: DappGuardError }
> {
  if (!connection?.connected) {
    return { error: { code: 4100, message: opts.notConnectedMessage } };
  }
  const wallet = await getWalletFromStorage();
  if (!keyringService.isUnlocked()) {
    return {
      error: {
        code: opts.lockedCode ?? 4100,
        message: opts.lockedMessage ?? "Wallet locked. Please unlock.",
      },
    };
  }
  if (!wallet) return { error: { code: 4100, message: "Wallet not found" } };
  return { wallet };
}

function tabMatchesOrigin(url: string | undefined, origin: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * Sends an OCTRA_EVENT to dapp pages. When `targetOrigin` is set, only tabs
 * and ports belonging to that origin receive it (e.g. a per-dapp chain
 * switch); otherwise the event goes to every tab (e.g. wallet locked).
 */
export async function broadcastToTabs(
  event: string,
  data: any,
  targetOrigin?: string,
): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      if (targetOrigin && !tabMatchesOrigin(tab.url, targetOrigin)) continue;
      chrome.tabs
        .sendMessage(tab.id, { type: "OCTRA_EVENT", event, data })
        .catch(() => {});
    }
  } catch (e) {
    console.warn("[Background] broadcastToTabs failed:", e);
  }

  for (const port of activeDappPorts) {
    if (targetOrigin) {
      const portOrigin =
        port.sender?.origin ||
        (port.sender?.url ? new URL(port.sender.url).origin : null);
      if (portOrigin !== targetOrigin) continue;
    }
    try {
      port.postMessage({ type: "OCTRA_EVENT", event, data });
    } catch (_) {
      activeDappPorts.delete(port);
    }
  }
}

export function getWalletByOctraAddress(octraAddress: string): any | null {
  const wallets = SessionService.getDecryptedWallets();
  if (wallets && wallets.length > 0) {
    return wallets.find((w: any) => w.address === octraAddress) || null;
  }
  return null;
}

export async function getActiveNetwork(): Promise<string> {
  const session = await readDappSession();
  if (session?.network) return session.network;
  try {
    const netData = await chrome.storage.local.get("dapp_active_network");
    if (netData?.dapp_active_network)
      return netData.dapp_active_network as string;
  } catch (_) {}
  return activeSessionCache?.network || "octra";
}

async function saveConnectionsMap(
  storageKey: string,
  map: Map<string, unknown>,
): Promise<void> {
  try {
    await chrome.storage.local.set({
      [storageKey]: JSON.stringify(Object.fromEntries(map)),
    });
  } catch (e) {
    console.error(`[Background] Failed to save ${storageKey}:`, e);
  }
}

async function loadConnectionsMap(
  storageKey: string,
  map: Map<string, any>,
): Promise<void> {
  try {
    const data = await chrome.storage.local.get(storageKey);
    if (data[storageKey]) {
      const connections = JSON.parse(data[storageKey] as string);
      Object.entries(connections).forEach(([origin, info]) => {
        map.set(origin, info as any);
      });
    }
  } catch (e) {
    console.error(`[Background] Failed to load ${storageKey}:`, e);
  }
}

export const saveConnections = (): Promise<void> =>
  saveConnectionsMap("dapp_connections", dappConnections);
export const loadConnections = (): Promise<void> =>
  loadConnectionsMap("dapp_connections", dappConnections);
export const saveSolanaConnections = (): Promise<void> =>
  saveConnectionsMap("solana_connections", solanaConnections);
export const loadSolanaConnections = (): Promise<void> =>
  loadConnectionsMap("solana_connections", solanaConnections);
export const saveSuiConnections = (): Promise<void> =>
  saveConnectionsMap("sui_connections", suiConnections);
export const loadSuiConnections = (): Promise<void> =>
  loadConnectionsMap("sui_connections", suiConnections);

const USER_NETWORKS_KEY = "user_networks_v1";

/** Parses a chainId that may be a hex string ("0x89"), decimal string ("137"), or number. */
export function parseChainId(
  value: string | number | null | undefined,
): number {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  return trimmed.toLowerCase().startsWith("0x")
    ? parseInt(trimmed, 16)
    : parseInt(trimmed, 10);
}

export async function getUserNetworksFromStorage(): Promise<any[]> {
  try {
    const data = await chrome.storage.local.get(USER_NETWORKS_KEY);
    return data[USER_NETWORKS_KEY]
      ? JSON.parse(data[USER_NETWORKS_KEY] as string)
      : [];
  } catch {
    return [];
  }
}

export async function saveUserNetworkToStorage(
  networkParams: any,
): Promise<void> {
  const chainIdDecimal = parseChainId(networkParams.chainId);
  const networks = await getUserNetworksFromStorage();
  const idx = networks.findIndex(
    (n: any) => n.chainIdDecimal === chainIdDecimal,
  );
  const entry = {
    ...networkParams,
    chainIdDecimal,
    addedAt: idx >= 0 ? networks[idx].addedAt : Date.now(),
  };
  if (idx >= 0) networks[idx] = entry;
  else networks.push(entry);
  await chrome.storage.local.set({
    [USER_NETWORKS_KEY]: JSON.stringify(networks),
  });
}

export function isEvmNetworkSetting(networkSetting: string): boolean {
  return (
    networkSetting === "ethereum" ||
    networkSetting === "sepolia" ||
    networkSetting.startsWith("user_")
  );
}

export function getChainIdForNetworkSetting(
  networkSetting: string | undefined,
): number {
  if (!networkSetting) return 1;
  if (networkSetting === "sepolia") return 11155111;
  // Octra is not an EVM chain; it reports chainId 1 for legacy dapp compatibility.
  if (networkSetting === "ethereum" || networkSetting === "octra") return 1;
  if (networkSetting.startsWith("user_"))
    return parseInt(networkSetting.split("_")[1], 10);
  return 1;
}

/**
 * Maps a chainId back to a network-setting string. The `user_<id>` form is the
 * generic "EVM chain by id" setting — it round-trips through
 * getChainIdForNetworkSetting and covers both built-in and user-added chains.
 */
export function chainIdToNetworkSetting(chainId: number): string | null {
  if (chainId === 11155111) return "sepolia";
  if (chainId === 1) return "ethereum";
  if (chainId && chainId > 1) return `user_${chainId}`;
  return null;
}

/** Network id reported to dapps for a given network setting. */
export function networkIdForSetting(networkSetting: string): string {
  if (networkSetting === "octra") return "octra";
  return isEvmNetworkSetting(networkSetting) ? networkSetting : "ethereum";
}

// Early builds stored chainId 2 for Octra connections; ignore that legacy value.
const LEGACY_OCTRA_CHAIN_ID = 2;

export function getConnectionChainId(origin: string): number {
  const connection = dappConnections.get(origin);
  // The connection's own network wins so one dapp switching chains never
  // changes the chainId reported to other origins.
  const activeNet =
    connection?.networkSetting || activeSessionCache?.network || "octra";
  if (isEvmNetworkSetting(activeNet))
    return getChainIdForNetworkSetting(activeNet);
  if (connection?.chainId && connection.chainId !== LEGACY_OCTRA_CHAIN_ID)
    return connection.chainId;
  return 1;
}

const ALLOWED_RPC_PROTOCOLS = ["https:"];
const BLOCKED_HOSTNAMES = ["localhost", "127.0.0.1", "0.0.0.0", "::1"];

export function isValidRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_RPC_PROTOCOLS.includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      BLOCKED_HOSTNAMES.some(
        (h) => hostname === h || hostname.endsWith("." + h),
      )
    )
      return false;
    if (
      /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(hostname)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
