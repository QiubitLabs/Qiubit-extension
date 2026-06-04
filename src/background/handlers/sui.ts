import { suiConnections } from '../store';
import { getWalletFromStorage, getWalletPublicInfo, getWalletByOctraAddress, saveSuiConnections } from '../helpers';
import { requestApproval } from './approval';
import { keyringService } from '../../services/core/KeyringService';
import type { DappResponse } from '../types';

export async function handleSuiConnect(
    origin: string,
    title: string | undefined,
    favicon: string | undefined
): Promise<DappResponse> {
    const existing = suiConnections.get(origin);
    if (existing?.connected) {
        // Use the persisted address directly — no session needed for reconnect
        if (existing.address) return { result: { address: existing.address, accounts: [{ address: existing.address }] } };
        // Fallback: try to get from live session
        const fresh = await getWalletPublicInfo();
        const address = fresh?.evmAddress || fresh?.address || null;
        if (address) return { result: { address, accounts: [{ address }] } };
    }

    const wallet = await getWalletFromStorage();
    let approvalResult: any;
    try {
        approvalResult = await requestApproval(origin, 'connect', { title, favicon, chain: 'sui' }, wallet);
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected connection' } };
    }

    const selectedOctraAddr = approvalResult?.selectedOctraAddress;
    const fresh = await getWalletFromStorage() || await getWalletPublicInfo();
    if (!fresh?.address) {
        return { error: { code: 4900, message: 'Wallet session expired. Please unlock and try again.' } };
    }

    // Prefer suiAddress: first from session (always available), then full wallet lookup
    const octraAddr = selectedOctraAddr || fresh.address;
    const address = (fresh as any).suiAddress
        || keyringService.getSuiAddress(octraAddr)
        || getWalletByOctraAddress(octraAddr)?.suiAddress
        || fresh.evmAddress
        || fresh.address;

    suiConnections.set(origin, {
        origin, address, connected: true, connectedAt: Date.now(),
    });
    saveSuiConnections();

    return { result: { address, accounts: [{ address }] } };
}

export async function handleSuiDisconnect(origin: string): Promise<DappResponse> {
    suiConnections.delete(origin);
    saveSuiConnections();
    return { result: true };
}

export async function handleSuiGetAccounts(origin: string): Promise<DappResponse> {
    const connection = suiConnections.get(origin);
    if (!connection?.connected) return { result: [] };
    return { result: [{ address: connection.address }] };
}

export async function handleSuiSignMessage(origin: string, params: any): Promise<DappResponse> {
    const connection = suiConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Sui wallet not connected' } };
    if (!keyringService.isUnlocked()) {
        return { error: { code: 4100, message: 'Wallet locked. Please unlock.' } };
    }
    const wallet = await getWalletFromStorage();
    try {
        const result = await requestApproval(origin, 'suiSignMessage', {
            message: params.message || params,
            address: connection.address,
            chain: 'sui',
        }, wallet);
        return { result: result.result };
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected sign request' } };
    }
}

export async function handleSuiSignTransaction(origin: string, params: any): Promise<DappResponse> {
    const connection = suiConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Sui wallet not connected' } };
    if (!keyringService.isUnlocked()) {
        return { error: { code: 4100, message: 'Wallet locked. Please unlock.' } };
    }
    const wallet = await getWalletFromStorage();
    try {
        const result = await requestApproval(origin, 'suiSignTransaction', {
            transaction: params.transaction || params,
            address: connection.address,
            chain: 'sui',
        }, wallet);
        return { result: result.result };
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected transaction' } };
    }
}

export async function handleSuiSignAndExecuteTransaction(origin: string, params: any): Promise<DappResponse> {
    const connection = suiConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Sui wallet not connected' } };
    if (!keyringService.isUnlocked()) {
        return { error: { code: 4100, message: 'Wallet locked. Please unlock.' } };
    }
    const wallet = await getWalletFromStorage();
    try {
        const result = await requestApproval(origin, 'suiSignAndExecuteTransaction', {
            transaction: params.transaction || params,
            address: connection.address,
            chain: 'sui',
        }, wallet);
        return { result: result.result };
    } catch (err: any) {
        return { error: { code: err.code || 4001, message: err.message || 'User rejected transaction' } };
    }
}
