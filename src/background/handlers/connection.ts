import { dappConnections } from '../store';
import {
    getWalletFromStorage,
    getWalletPublicInfo,
    getActiveNetwork,
    saveConnections,
    getChainIdForNetworkSetting,
    broadcastToTabs,
} from '../helpers';
import { requestApproval } from './approval';
import type { DappResponse } from '../types';

export async function handleConnect(
    origin: string,
    title: string | undefined,
    favicon: string | undefined,
    _params: any
): Promise<DappResponse> {
    const networkSetting = await getActiveNetwork();
    const activeChainId = getChainIdForNetworkSetting(networkSetting);
    const activeNetworkId = networkSetting === 'sepolia' ? 'sepolia' : 'mainnet';

    const existing = dappConnections.get(origin);
    if (existing?.connected) {
        const fresh = await getWalletFromStorage();
        if (fresh) {
            const evmAddr = fresh.evmAddress || null;
            const displayAddr = evmAddr || fresh.address;
            if (displayAddr !== (existing.evmAddress || existing.address) || existing.chainId !== activeChainId) {
                existing.address = fresh.address;
                existing.evmAddress = evmAddr;
                existing.chainId = activeChainId;
                existing.networkId = activeNetworkId;
                existing.networkSetting = networkSetting;
                dappConnections.set(origin, existing);
                await saveConnections();
            }
            return { result: { accounts: [displayAddr], selectedAddress: displayAddr, octraAddress: fresh.address, evmAddress: evmAddr, networkId: activeNetworkId, chainId: activeChainId } };
        }
        const displayAddr = existing.evmAddress || existing.address;
        return { result: { accounts: [displayAddr], selectedAddress: displayAddr, octraAddress: existing.address, evmAddress: existing.evmAddress || null, networkId: activeNetworkId, chainId: activeChainId } };
    }

    let wallet = await getWalletFromStorage();
    const isLocked = !wallet || (!wallet.privateKey && !wallet.privateKeyB64);
    if (isLocked) console.warn('[Background] Wallet locked. Prompting unlock via popup...');

    let approvalResult: any;
    try {
        approvalResult = await requestApproval(origin, 'connect', { title, favicon }, wallet);
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected connection request' } };
    }

    const selectedOctraAddr = approvalResult?.selectedOctraAddress;
    const selectedEvmAddr = approvalResult?.selectedEvmAddress;

    if (selectedOctraAddr) {
        wallet = { address: selectedOctraAddr, evmAddress: selectedEvmAddr || null };
    } else {
        wallet = await getWalletFromStorage();
        if (!wallet) wallet = await getWalletPublicInfo();
    }

    if (!wallet?.address) {
        return { error: { code: 4900, message: 'Wallet session expired. Please unlock the extension and try again.' } };
    }

    const freshNetworkSetting = await getActiveNetwork();
    const isEvmChain = freshNetworkSetting === 'sepolia' || freshNetworkSetting === 'ethereum' || freshNetworkSetting.startsWith('user_');
    const evmAddr = wallet.evmAddress || null;
    const displayAddress = evmAddr || wallet.address;
    const freshChainId = isEvmChain ? getChainIdForNetworkSetting(freshNetworkSetting) : 1;
    const freshNetworkId = isEvmChain ? freshNetworkSetting : 'ethereum';

    const connection = {
        origin, title: title || '', favicon: favicon || '', address: wallet.address, evmAddress: evmAddr,
        connected: true, connectedAt: Date.now(), networkId: freshNetworkId,
        chainId: freshChainId, networkSetting: isEvmChain ? freshNetworkSetting : 'ethereum',
    };
    dappConnections.set(origin, connection);
    await saveConnections();
    broadcastToTabs('accountsChanged', [displayAddress]);

    return {
        result: {
            accounts: [displayAddress], selectedAddress: displayAddress,
            octraAddress: wallet.address, evmAddress: evmAddr, publicKey: wallet.publicKeyB64,
            networkId: connection.networkId, chainId: connection.chainId, permissions: ['sign', 'balance'],
        }
    };
}

export async function handleDisconnect(origin: string): Promise<DappResponse> {
    dappConnections.delete(origin);
    await saveConnections();
    return { result: true };
}

export async function handleGetAccounts(origin: string): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { result: [] };
    const displayAddr = connection.evmAddress || connection.address;
    return { result: [displayAddr] };
}

export async function handleGetPublicKey(origin: string): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const wallet = await getWalletFromStorage();
    if (!wallet) return { error: { code: 4100, message: 'Wallet not found' } };
    return { result: wallet.publicKeyB64 };
}
