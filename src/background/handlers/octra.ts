import { getRpcClient } from '../../services/network/RpcService';
import { nonceManager } from '../../services/core/NonceManager';
import { dappConnections } from '../store';
import { getWalletFromStorage } from '../helpers';
import { requestApproval } from './approval';
import { keyringService } from '../../services/core/KeyringService';
import type { DappResponse } from '../types';

export async function handleGetBalance(params: any): Promise<DappResponse> {
    const { address } = params;
    try {
        const RPC_URL = (import.meta as any).env?.VITE_RPC_URL || 'https://octra.network/rpc';
        const balanceRes = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'octra_balance', params: [address], id: 1 }),
        });
        if (balanceRes.ok) {
            const balanceJson = await balanceRes.json();
            if (balanceJson.error) throw new Error('RPC Error');
            const data = balanceJson.result;
            if (data) {
                const rawBalance = String(
                    data.balance_raw !== undefined
                        ? data.balance_raw
                        : data.balance ? Math.floor(parseFloat(data.balance) * 1_000_000) : '0'
                );
                const nonce = data.pending_nonce !== undefined ? data.pending_nonce : (data.nonce ?? 0);
                const cacheData = await chrome.storage.local.get(['balances', 'nonces']);
                const balances: Record<string, string> = (cacheData.balances as Record<string, string>) || {};
                const nonces: Record<string, number> = (cacheData.nonces as Record<string, number>) || {};
                balances[address] = rawBalance;
                nonces[address] = nonce;
                await chrome.storage.local.set({ balances, nonces });
                return { result: { address, balance: rawBalance, formatted: (parseFloat(rawBalance) / 1_000_000).toFixed(6), nonce, _source: 'network' } };
            }
        }
    } catch (_) { }

    const cacheData = await chrome.storage.local.get(['balances', 'nonces']);
    const rawBal = (cacheData.balances as Record<string, string> || {})[address] || '0';
    const cachedNonce = (cacheData.nonces as Record<string, number> || {})[address] || 0;
    return { result: { address, balance: rawBal, formatted: (parseFloat(rawBal) / 1_000_000).toFixed(6), nonce: cachedNonce, _source: 'cache' } };
}

export async function handleSignMessage(origin: string, params: any): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const wallet = await getWalletFromStorage();
    if (!wallet) return { error: 'Wallet not found' };
    if (!keyringService.isUnlocked()) return { error: 'Wallet locked. Please unlock.' };
    try {
        const result = await requestApproval(origin, 'signMessage', params, wallet);
        return { result: result.result };
    } catch {
        return { error: { code: 4001, message: 'User rejected message signing' } };
    }
}

export async function handleSignTransaction(origin: string, params: any): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const wallet = await getWalletFromStorage();
    if (!wallet) return { error: 'Wallet not found. Please connect first.' };
    if (!keyringService.isUnlocked()) return { error: 'Wallet locked. Please unlock to sign transaction.' };
    const txParams = params.transaction || params;
    await ensureNonce(txParams, wallet.address);
    if (params.transaction) params.transaction = txParams; else Object.assign(params, txParams);
    try {
        return await requestApproval(origin, 'signTransaction', params, wallet);
    } catch (err: any) {
        return { error: { code: 4001, message: err.message || 'User rejected signature' } };
    }
}

export async function handleSendTransaction(origin: string, params: any): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const wallet = await getWalletFromStorage();
    if (!wallet) return { error: 'Wallet not found. Please connect first.' };
    if (!keyringService.isUnlocked()) return { error: 'Wallet locked. Please unlock to send transaction.' };
    const txParams = params.transaction || params;
    await ensureNonce(txParams, wallet.address);
    if (params.transaction) params.transaction = txParams; else Object.assign(params, txParams);
    try {
        return await requestApproval(origin, 'sendTransaction', params, wallet);
    } catch (err: any) {
        return { error: { code: 4001, message: err.message || 'User rejected transaction' } };
    }
}

export async function handleGetEncryptedBalance(origin: string): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const wallet = await getWalletFromStorage();
    if (!wallet || !keyringService.isUnlocked()) return { error: 'Wallet locked. Please unlock the extension.' };
    try {
        const client = getRpcClient();
        const pk = keyringService.getPrivateKey(wallet.address) || '';
        const pubB64 = keyringService.getPublicKey(wallet.address) || wallet.publicKeyB64 || '';
        const data = await client.getEncryptedBalance(wallet.address, pk, pubB64);
        return { result: data };
    } catch (err: any) {
        return { error: { code: 5000, message: err.message || 'Failed to fetch encrypted balance' } };
    }
}

export async function handleContractCall(origin: string, params: any): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const wallet = await getWalletFromStorage();
    if (!wallet || !keyringService.isUnlocked()) return { error: 'Wallet locked. Please unlock the extension.' };
    const approvalParams = { contractAddress: params.address, method: params.method, params: params.params || [], amount: params.amount || '0' };
    try {
        const approved = await requestApproval(origin, 'contractCall', approvalParams, wallet);
        if (!approved) return { error: { code: 4001, message: 'User rejected contract call' } };
        const client = getRpcClient();
        const result = await client.callContractMethod(params.address, params.method, params.params || [], wallet.address, params.amount || '0');
        return { result };
    } catch (err: any) {
        return { error: { code: 5000, message: err.message || 'Contract call failed' } };
    }
}

export async function handleContractView(params: any): Promise<DappResponse> {
    try {
        const client = getRpcClient();
        const result = await client.callContractView(params.address, params.method, params.params || [], params.caller || params.address);
        return { result };
    } catch (err: any) {
        return { error: { code: 5000, message: err.message || 'Contract view failed' } };
    }
}

export async function handleGetPendingTransactions(origin: string): Promise<DappResponse> {
    const connection = dappConnections.get(origin);
    if (!connection?.connected) return { error: { code: 4100, message: 'Not connected' } };
    const wallet = await getWalletFromStorage();
    if (!wallet) return { error: 'Wallet not found' };
    try {
        const client = getRpcClient();
        const result = await client.getStagedTransactions();
        return { result: result || [] };
    } catch (err: any) {
        return { error: { code: 5000, message: err.message || 'Failed to fetch pending transactions' } };
    }
}

export async function ensureNonce(txParams: any, address: string): Promise<void> {
    if (txParams.nonce !== undefined && txParams.nonce !== null && txParams.nonce !== '') return;
    try {
        txParams.nonce = await nonceManager.getNext(address);
    } catch (e) {
        console.warn('[Background] Failed to fetch nonce from NonceManager:', e);
        try {
            const cached = await chrome.storage.local.get('nonces');
            txParams.nonce = ((cached.nonces as Record<string, number>) || {})[address] || 0;
        } catch {
            txParams.nonce = 0;
        }
    }
}
