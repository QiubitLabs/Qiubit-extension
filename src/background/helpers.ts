import { SessionService } from '../services/core/SessionService';
import { keyringService } from '../services/core/KeyringService';
import {
    activeDappPorts,
    dappConnections,
    activeSessionCache,
    setActiveSessionCache,
    setMemorySessionKey,
} from './store';
import type { WalletInfo } from './types';

export async function getWalletFromStorage(): Promise<WalletInfo | null> {
    if (!SessionService.isValid()) {
        try {
            await SessionService.restoreSession();
        } catch (e) {
            console.warn('[Background] On-demand session restore failed:', e);
        }
    }

    if (!SessionService.isValid()) {
        setMemorySessionKey(null);
        setActiveSessionCache(null);
        return null;
    }

    // SECURITY: Private key lives only in KeyringService memory (MetaMask pattern).
    // Return public wallet info from keyring; callers that need to sign use
    // keyringService.getPrivateKey() / keyringService.signTransaction() directly.
    try {
        const activeAddr = keyringService.getActiveAddress() ?? keyringService.getAddresses()[0];
        if (activeAddr) {
            const info: WalletInfo = {
                address: activeAddr,
                evmAddress: keyringService.getEvmAddress(activeAddr) || null,
                solanaAddress: keyringService.getSolanaAddress(activeAddr) || null,
                suiAddress: keyringService.getSuiAddress(activeAddr) || null,
                publicKeyB64: keyringService.getPublicKey(activeAddr) || null,
                network: activeSessionCache?.network || 'octra',
            };
            return info;
        }
    } catch (_) {}

    // Fallback to session cache for address/public-key (no private key)
    try {
        const data = await chrome.storage.session.get(['dapp_wallet_session']);
        if (data?.dapp_wallet_session) {
            const session = JSON.parse(data.dapp_wallet_session as string);
            setActiveSessionCache(session);
            if (session?.address) {
                return {
                    address: session.address,
                    evmAddress: session.evmAddress || null,
                    solanaAddress: session.solanaAddress || null,
                    suiAddress: session.suiAddress || null,
                    publicKeyB64: session.publicKeyB64 || session.publicKey || null,
                    network: session.network || 'octra',
                };
            }
        }
    } catch (_) {}

    return null;
}

export async function getWalletPublicInfo(): Promise<WalletInfo | null> {
    let session: any = null;
    try {
        const data = await chrome.storage.session.get(['dapp_wallet_session']);
        if (data?.dapp_wallet_session) {
            session = JSON.parse(data.dapp_wallet_session as string);
            setActiveSessionCache(session);
        }
    } catch (_) { }

    if (!session?.address) {
        try {
            const activeAddr = keyringService.getActiveAddress();
            if (activeAddr) {
                return {
                    address: activeAddr,
                    evmAddress: keyringService.getEvmAddress(activeAddr) || null,
                    publicKeyB64: keyringService.getPublicKey(activeAddr) || null,
                    network: 'octra',
                };
            }
        } catch (_) { }
    }

    if (session?.address) {
        return {
            address: session.address,
            evmAddress: session.evmAddress || null,
            publicKeyB64: session.publicKeyB64 || session.publicKey || null,
            network: session.network || 'octra',
        };
    }

    return null;
}

export async function broadcastToTabs(event: string, data: any): Promise<void> {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, { type: 'OCTRA_EVENT', event, data }).catch(() => { });
            }
        }
    } catch (e) {
        console.warn('[Background] broadcastToTabs failed:', e);
    }

    for (const port of activeDappPorts) {
        try {
            port.postMessage({ type: 'OCTRA_EVENT', event, data });
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
    try {
        const data = await chrome.storage.session.get(['dapp_wallet_session']);
        if (data?.dapp_wallet_session) {
            const session = JSON.parse(data.dapp_wallet_session as string);
            if (session.network) return session.network;
        }
    } catch (_) { }
    // Fallback: read the network mirrored from popup settings
    try {
        const netData = await chrome.storage.local.get('dapp_active_network');
        if (netData?.dapp_active_network) return netData.dapp_active_network as string;
    } catch (_) { }
    return activeSessionCache?.network || 'octra';
}

export async function saveConnections(): Promise<void> {
    try {
        const connections = Object.fromEntries(dappConnections);
        await chrome.storage.local.set({ dapp_connections: JSON.stringify(connections) });
    } catch (e) {
        console.error('[Background] Failed to save connections:', e);
    }
}

export async function loadConnections(): Promise<void> {
    try {
        const data = await chrome.storage.local.get('dapp_connections');
        if (data.dapp_connections) {
            const connections = JSON.parse(data.dapp_connections as string);
            Object.entries(connections).forEach(([origin, info]) => {
                dappConnections.set(origin, info as any);
            });
        }
    } catch (e) {
        console.error('[Background] Failed to load connections:', e);
    }
}

export async function saveSolanaConnections(): Promise<void> {
    try {
        const { solanaConnections } = await import('./store');
        const connections = Object.fromEntries(solanaConnections);
        await chrome.storage.local.set({ solana_connections: JSON.stringify(connections) });
    } catch (e) {
        console.error('[Background] Failed to save Solana connections:', e);
    }
}

export async function loadSolanaConnections(): Promise<void> {
    try {
        const { solanaConnections } = await import('./store');
        const data = await chrome.storage.local.get('solana_connections');
        if (data.solana_connections) {
            const connections = JSON.parse(data.solana_connections as string);
            Object.entries(connections).forEach(([origin, info]) => {
                solanaConnections.set(origin, info as any);
            });
        }
    } catch (e) {
        console.error('[Background] Failed to load Solana connections:', e);
    }
}

export async function saveSuiConnections(): Promise<void> {
    try {
        const { suiConnections } = await import('./store');
        const connections = Object.fromEntries(suiConnections);
        await chrome.storage.local.set({ sui_connections: JSON.stringify(connections) });
    } catch (e) {
        console.error('[Background] Failed to save Sui connections:', e);
    }
}

export async function loadSuiConnections(): Promise<void> {
    try {
        const { suiConnections } = await import('./store');
        const data = await chrome.storage.local.get('sui_connections');
        if (data.sui_connections) {
            const connections = JSON.parse(data.sui_connections as string);
            Object.entries(connections).forEach(([origin, info]) => {
                suiConnections.set(origin, info as any);
            });
        }
    } catch (e) {
        console.error('[Background] Failed to load Sui connections:', e);
    }
}

// ─── User Networks ──────────────────────────────────────────────────────────────

const USER_NETWORKS_KEY = 'user_networks_v1';

export async function getUserNetworksFromStorage(): Promise<any[]> {
    try {
        const data = await chrome.storage.local.get(USER_NETWORKS_KEY);
        return data[USER_NETWORKS_KEY] ? JSON.parse(data[USER_NETWORKS_KEY] as string) : [];
    } catch {
        return [];
    }
}

export async function saveUserNetworkToStorage(networkParams: any): Promise<void> {
    const chainIdDecimal = parseInt(networkParams.chainId, 16);
    const networks = await getUserNetworksFromStorage();
    const idx = networks.findIndex((n: any) => n.chainIdDecimal === chainIdDecimal);
    const entry = { ...networkParams, chainIdDecimal, addedAt: idx >= 0 ? networks[idx].addedAt : Date.now() };
    if (idx >= 0) networks[idx] = entry; else networks.push(entry);
    await chrome.storage.local.set({ [USER_NETWORKS_KEY]: JSON.stringify(networks) });
}

export function getChainIdForNetworkSetting(networkSetting: string | undefined): number {
    if (!networkSetting) return 1;
    if (networkSetting === 'sepolia') return 11155111;
    if (networkSetting === 'ethereum') return 1;
    if (networkSetting === 'octra') return 1;
    if (networkSetting.startsWith('user_')) return parseInt(networkSetting.split('_')[1], 10);
    return 1;
}

export function chainIdToNetworkSetting(chainId: number): string | null {
    if (chainId === 11155111) return 'sepolia';
    if (chainId === 1) return 'ethereum';
    if (chainId && chainId > 1) return `user_${chainId}`;
    return null;
}

export function getConnectionChainId(origin: string): number {
    const connection = dappConnections.get(origin);
    // Live session cache takes precedence over stale connection.chainId
    const activeNet = activeSessionCache?.network || connection?.networkSetting || 'octra';
    const isEvm = activeNet === 'sepolia' || activeNet === 'ethereum' || activeNet.startsWith('user_');
    if (isEvm) return getChainIdForNetworkSetting(activeNet);
    if (connection?.chainId && connection.chainId !== 2) return connection.chainId;
    return 1;
}

const ALLOWED_RPC_PROTOCOLS = ['https:'];
const BLOCKED_HOSTNAMES = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];

export function isValidRpcUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (!ALLOWED_RPC_PROTOCOLS.includes(parsed.protocol)) return false;
        const hostname = parsed.hostname.toLowerCase();
        if (BLOCKED_HOSTNAMES.some(h => hostname === h || hostname.endsWith('.' + h))) return false;
        // Block private/link-local ranges
        if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(hostname)) return false;
        return true;
    } catch {
        return false;
    }
}
