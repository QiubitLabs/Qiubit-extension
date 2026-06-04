import { getPrimaryRpc } from '../../config/rpcEndpoints';
import { dappConnections } from '../store';
import {
    getWalletFromStorage,
    saveConnections,
    saveUserNetworkToStorage,
    getUserNetworksFromStorage,
    chainIdToNetworkSetting,
    getConnectionChainId,
    broadcastToTabs,
    isValidRpcUrl,
} from '../helpers';
import { activeSessionCache, setActiveSessionCache } from '../store';
import { requestApproval } from './approval';
import type { DappResponse } from '../types';

export async function handleEthSendTransaction(origin: string, params: any): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const txParams = Array.isArray(params) ? params[0] : params;
    if (!txParams) return { error: { code: 4200, message: 'Missing transaction params' } };
    const wallet = await getWalletFromStorage();
    try {
        const txChainId = txParams.chainId != null
            ? (typeof txParams.chainId === 'string'
                ? (txParams.chainId.startsWith('0x') ? parseInt(txParams.chainId, 16) : parseInt(txParams.chainId, 10))
                : Number(txParams.chainId))
            : null;
        const activeChainId = txChainId || getConnectionChainId(origin);
        const networkSetting = chainIdToNetworkSetting(activeChainId) || connection?.networkSetting || 'ethereum';
        return await requestApproval(origin, 'ethSendTransaction', { txParams, chainId: activeChainId, networkSetting }, wallet);
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected transaction' } };
    }
}

export async function handlePersonalSign(origin: string, params: any): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const message = Array.isArray(params) ? params[0] : params.message;
    const from = Array.isArray(params) ? params[1] : params.from;
    const chainId = Array.isArray(params) ? undefined : params.chainId;
    const wallet = await getWalletFromStorage();
    try {
        const activeChainId = chainId || getConnectionChainId(origin);
        const networkSetting = chainIdToNetworkSetting(activeChainId) || connection?.networkSetting || 'ethereum';
        return await requestApproval(origin, 'ethPersonalSign', {
            message, from: from || connection.evmAddress || connection.address, chainId: activeChainId, networkSetting,
        }, wallet);
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected sign request' } };
    }
}

export async function handleSignTypedData(origin: string, params: any): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const { from, typedData, chainId } = params;
    const wallet = await getWalletFromStorage();
    try {
        const activeChainId = chainId || getConnectionChainId(origin);
        const networkSetting = chainIdToNetworkSetting(activeChainId) || connection?.networkSetting || 'ethereum';
        return await requestApproval(origin, 'ethSignTypedData', {
            from: from || connection.address, typedData, chainId: activeChainId, networkSetting,
        }, wallet);
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected sign request' } };
    }
}

export async function handleEvmRpcPassthrough(origin: string, method: string, params: any): Promise<DappResponse> {
    const chainId = getConnectionChainId(origin);
    let rpcUrl = getPrimaryRpc(chainId);
    if (!rpcUrl) {
        const userNets = await getUserNetworksFromStorage();
        const userNet = userNets.find((n: any) => n.chainIdDecimal === chainId);
        const candidateUrl = userNet?.rpcUrls?.[0];
        if (candidateUrl && !isValidRpcUrl(candidateUrl)) {
            return { error: { code: -32603, message: 'Invalid or unsafe RPC URL for this network' } };
        }
        rpcUrl = candidateUrl || getPrimaryRpc(1);
    }
    try {
        const rpcParams = Array.isArray(params)
            ? params
            : (params && typeof params === 'object' && Object.keys(params).length > 0) ? [params] : [];
        const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method, params: rpcParams, id: 1 }),
        });
        if (!res.ok) return { error: { code: -32603, message: 'RPC request failed' } };
        const data = await res.json();
        return data.error ? { error: data.error } : { result: data.result };
    } catch (err: any) {
        return { error: { code: -32603, message: err.message || 'Internal RPC error' } };
    }
}

export async function handleAddEthereumChain(origin: string, params: any): Promise<DappResponse> {
    const networkParams = Array.isArray(params) ? params[0] : params;
    if (!networkParams?.chainId || !networkParams?.rpcUrls?.length) {
        return { error: { code: 4200, message: 'Invalid addEthereumChain params: missing chainId or rpcUrls' } };
    }
    const chainIdDecimal = parseInt(networkParams.chainId, 16);
    const builtinChains: Record<number, string> = { 1: 'ethereum', 11155111: 'sepolia' };
    if (builtinChains[chainIdDecimal]) return { result: null };
    const existing = await getUserNetworksFromStorage();
    if (existing.some((n: any) => n.chainIdDecimal === chainIdDecimal)) return { result: null };
    const wallet = await getWalletFromStorage();
    try {
        await requestApproval(origin, 'addNetwork', { networkParams }, wallet);
        await saveUserNetworkToStorage(networkParams);
        return { result: null };
    } catch (err: any) {
        return { error: { code: 4001, message: err.message || 'User rejected add network request' } };
    }
}

export async function handleSwitchEthereumChain(origin: string, params: any): Promise<DappResponse> {
    const switchParams = Array.isArray(params) ? params[0] : params;
    if (!switchParams?.chainId) {
        return { error: { code: 4200, message: 'Invalid switchEthereumChain params: missing chainId' } };
    }
    const chainIdDecimal = parseInt(switchParams.chainId, 16);
    const chainToNetwork: Record<number, string> = { 1: 'ethereum', 11155111: 'sepolia' };
    let networkSetting = chainToNetwork[chainIdDecimal];
    if (!networkSetting) {
        const userNets = await getUserNetworksFromStorage();
        const found = userNets.find((n: any) => n.chainIdDecimal === chainIdDecimal);
        if (found) {
            networkSetting = `user_${chainIdDecimal}`;
        } else {
            return { error: { code: 4902, message: `Unrecognized chain ID ${switchParams.chainId}. Add the network first using wallet_addEthereumChain.` } };
        }
    }
    const connection = dappConnections.get(origin);
    if (connection) {
        connection.chainId = chainIdDecimal;
        connection.networkId = networkSetting;
        connection.networkSetting = networkSetting;
        dappConnections.set(origin, connection);
        await saveConnections();
    }
    // Sync live session cache so getConnectionChainId reflects the switch immediately
    if (activeSessionCache) {
        setActiveSessionCache({ ...activeSessionCache, network: networkSetting });
    }
    await broadcastToTabs('chainChanged', switchParams.chainId);
    return { result: null };
}

export async function handleGetChainId(origin: string): Promise<DappResponse> {
    const chainId = getConnectionChainId(origin);
    return { result: '0x' + chainId.toString(16) };
}
