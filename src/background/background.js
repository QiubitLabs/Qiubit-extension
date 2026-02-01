/**
 * Qiubit Background Service Worker
 * Handles dApp requests, signing, and background tasks
 */

import nacl from 'tweetnacl';
import { getRpcClient } from '../utils/rpc';
import { backgroundSync } from '../services/BackgroundSyncService';
import { decryptSession } from '../utils/crypto';

// console.log('[Background] Qiubit Service Worker starting...');

// Background task: Update balances in storage periodically (Every 1 minute)
chrome.alarms.create('bgBalanceSync', { periodInMinutes: 3 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'bgBalanceSync') {
        const wallet = await getWalletFromStorage();
        // Only sync if we have an active (unlocked) session
        if (wallet && wallet.address) {
            // console.log('[Background] Auto-syncing for', wallet.address);
            await backgroundSync.syncAll(wallet.address, wallet.network || 'mainnet');
        }
    }
});

// dApp connection and approval storage
const dappConnections = new Map();
const pendingRequests = new Map();
const dappApprovals = new Map(); // approvalId -> { type, params, origin, resolve, reject, wallet }

// Simple in-memory storage for dApp connections (resets on service worker restart);
let requestCounter = 0;

// IN-MEMORY SESSION CACHE (Critical for reliable signing)
let activeSessionCache = null;
let memorySessionKey = null; // ZERO-TRUST KEY (Memory Only)

// IMMEDIATE INIT: Load session from storage on startup/wakeup
(async function initSession() {
    try {
        const sessionData = await chrome.storage.session.get(['dapp_wallet_session']);
        if (sessionData && sessionData.dapp_wallet_session) {
            activeSessionCache = JSON.parse(sessionData.dapp_wallet_session);
            // console.log('[Background] Restored encrypted session from storage');
        }
    } catch (e) {
        console.warn('[Background] Session restore error:', e);
    }
})();

// --- Message Handler ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. Handle Content Script (dApp) Requests
    if (message.type === 'DAPP_REQUEST') {
        handleDappRequest(message, sender).then(sendResponse);
        return true; // Async response
    }

    // 2. Handle Internal Extension Messages (Popup <-> Background)
    if (message.type === 'SYNC_SESSION') {
        handleSyncSession(message.data || message).then(result => sendResponse(result));
        return true;
    }

    if (message.type === 'POPUP_REQUEST') {
        handlePopupRequest(message).then(sendResponse);
        return true;
    }

    if (message.type === 'GET_PENDING_APPROVALS') {
        const requests = Array.from(dappApprovals.entries()).map(([id, req]) => ({
            id,
            type: req.type,
            origin: req.origin,
            params: req.params,
            timestamp: req.timestamp
        }));
        sendResponse(requests);
        return false;
    }

    if (message.type === 'RESOLVE_APPROVAL') {
        handleResolveApproval(message.data).then(sendResponse);
        return true;
    }

    if (message.type === 'GET_FEE_ESTIMATE') {
        getRpcClient().getFeeEstimate().then(fees => {
            sendResponse(fees);
        }).catch(err => {
            console.error('[Background] Fee fetch failed:', err);
            sendResponse({ medium: 0.002 }); // Fallback
        });
        return true;
    }

    // --- EMERGENCY RESET HANDLER ---
    if (message.type === 'RESET_EVERYTHING') {
        console.warn('!!! EMERGENCY RESET TRIGGERED !!!');
        (async () => {
            await chrome.storage.local.clear();
            await chrome.storage.session.clear();
            activeSessionCache = null;
            memorySessionKey = null;
            dappConnections.clear();
            dappApprovals.clear();
            // console.log('!!! RESET COMPLETE !!!');
            sendResponse({ success: true });
        })();
        return true;
    }

    return false;
});

/**
 * Handle Session Sync from Popup
 */
async function handleSyncSession(data) {
    // If receiving a Key, store it in memory
    if (data.sessionKey) {
        memorySessionKey = data.sessionKey;
        // console.log('[Background] Received ephemeral session key');

        // Also refresh the data cache
        const sessionData = await chrome.storage.session.get(['dapp_wallet_session']);
        if (sessionData && sessionData.dapp_wallet_session) {
            activeSessionCache = JSON.parse(sessionData.dapp_wallet_session);
        }
        return { success: true };
    }

    // Legacy/Full Sync handling
    if (data.session) {
        // console.log('[Background] Received SYNC_SESSION (Full)');
        activeSessionCache = data.session;
        // Don't save to storage here, App.jsx does it. Just update memory.
        return { success: true };
    }

    return { success: true };
}

// Load saved connections
async function loadConnections() {
    try {
        const data = await chrome.storage.local.get('dapp_connections');
        if (data.dapp_connections) {
            const connections = JSON.parse(data.dapp_connections);
            Object.entries(connections).forEach(([origin, info]) => {
                dappConnections.set(origin, info);
            });
        }
    } catch (error) {
        console.error('[Background] Failed to load connections:', error);
    }
}

async function saveConnections() {
    try {
        const connections = Object.fromEntries(dappConnections);
        await chrome.storage.local.set({ dapp_connections: JSON.stringify(connections) });
    } catch (error) {
        console.error('[Background] Failed to save connections:', error);
    }
}

// Initialize
loadConnections();

/**
 * Handle dApp requests
 */
async function handleDappRequest(message, sender) {
    const { id, method, params, origin, title, favicon } = message;

    // console.log('[Background] dApp request:', method, 'from', origin);

    switch (method) {
        case 'connect':
            return handleConnect(origin, title, favicon, params);

        case 'disconnect':
            return handleDisconnect(origin);

        case 'getAccounts':
            return handleGetAccounts(origin);

        case 'getPublicKey':
            return handleGetPublicKey(origin);

        case 'getBalance':
            return handleGetBalance(params);

        case 'signMessage':
            return handleSignMessage(origin, params);

        case 'signTransaction':
            return handleSignTransaction(origin, params);

        case 'sendTransaction':
            return handleSendTransaction(origin, params);

        case 'getEncryptedBalance':
            return handleGetEncryptedBalance(origin);

        default:
            return { error: { code: 4200, message: `Unknown method: ${method}` } };
    }
}

/**
 * Handle get encrypted balance
 */
async function handleGetEncryptedBalance(origin) {
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        return { error: { code: 4100, message: 'Not connected' } };
    }

    const wallet = await getWalletFromStorage();
    if (!wallet || (!wallet.privateKey && !wallet.privateKeyB64)) {
        return { error: 'Wallet locked. Please unlock the extension.' };
    }

    try {
        const client = getRpcClient();
        // The RPC client needs the private key to decrypt/view the balance
        const pk = wallet.privateKey || wallet.privateKeyB64;
        const data = await client.getEncryptedBalance(wallet.address, pk);
        return { result: data };
    } catch (err) {
        return { error: { code: 5000, message: err.message || 'Failed to fetch encrypted balance' } };
    }
}

// --- Helper: Request Approval from UI ---
async function requestApproval(origin, type, params, wallet) {
    const approvalId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
        // 1. Store Request
        dappApprovals.set(approvalId, {
            type,
            origin,
            params,
            wallet, // Pass wallet context if needed
            timestamp: Date.now(),
            resolve,
            reject
        });

        // 2. Open Popup
        chrome.windows.create({
            url: 'index.html#/dapp/approve?id=' + approvalId,
            type: 'popup',
            width: 360,
            height: 600
        });
    });
}

/**
 * Handle connect request
 */
async function handleConnect(origin, title, favicon, params) {
    // Check if already connected
    const existing = dappConnections.get(origin);
    if (existing && existing.connected) {
        return {
            result: {
                accounts: [existing.address],
                selectedAddress: existing.address,
                networkId: existing.networkId || 'testnet',
                chainId: existing.chainId || 2
            }
        };
    }

    // 0. Get Wallet (with Private Key)
    let wallet = await getWalletFromStorage();

    // If wallet is locked (no private key) OR null (maybe first load), we MUST open popup to unlock/login
    // We create a dummy wallet object if null, just to pass to requestApproval so it opens
    const isLocked = !wallet || (!wallet.privateKey && !wallet.privateKeyB64);

    if (isLocked) {
        console.warn('[Background] Wallet locked or missing session. Prompting unlock via popup...');
    }

    // Request User Approval (Will trigger unlock UI if needed)
    try {
        // Pass current wallet state (even if null/locked) - the UI checks this
        await requestApproval(origin, 'connect', { title, favicon }, wallet);
    } catch (err) {
        console.warn('[Background] Connection request failed:', err);
        // Return the actual error if available, otherwise fallback to rejected
        return {
            error: {
                code: err.code || 4001,
                message: err.message || 'User rejected connection request'
            }
        };
    }

    // CRITICAL: Refresh wallet from storage AFTER approval 
    // The user has now unlocked the wallet in the popup.
    wallet = await getWalletFromStorage();

    // Final check
    if (!wallet || (!wallet.privateKey && !wallet.privateKeyB64)) {
        return { error: 'Wallet still locked' };
    }

    const connection = {
        origin,
        title,
        favicon,
        address: wallet.address,
        connected: true,
        connectedAt: Date.now(),
        networkId: 'mainnet',
        chainId: 2
    };

    dappConnections.set(origin, connection);
    await saveConnections();

    // console.log('[Background] Connected:', origin);

    return {
        result: {
            accounts: [wallet.address],
            selectedAddress: wallet.address,
            publicKey: wallet.publicKeyB64,
            networkId: connection.networkId,
            chainId: connection.chainId,
            permissions: ['sign', 'balance']
        }
    };
}

/**
 * Handle disconnect request
 */
async function handleDisconnect(origin) {
    dappConnections.delete(origin);
    await saveConnections();
    // console.log('[Background] Disconnected:', origin);
    return { result: true };
}

/**
 * Handle get accounts
 */
async function handleGetAccounts(origin) {
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        return { result: [] };
    }
    return { result: [connection.address] };
}

/**
 * Handle get public key
 */
async function handleGetPublicKey(origin) {
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        return { error: { code: 4100, message: 'Not connected' } };
    }

    const wallet = await getWalletFromStorage();
    if (!wallet) {
        return { error: { code: 4100, message: 'Wallet not found' } };
    }

    return { result: wallet.publicKeyB64 };
}

/**
 * Handle get balance
 */
async function handleGetBalance(params) {
    const { address } = params;
    const balancesKey = 'balances';

    // 1. Try to fetch fresh balance from RPC
    try {
        const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://octra.network';
        const baseUrl = RPC_URL.replace(/\/+$/, '');

        // console.log('[Background] Fetching balance for', address);
        const response = await fetch(`${baseUrl}/balance/${address}`);

        if (response.ok) {
            const json = await response.json();
            const rawBalance = json.balance_raw || (json.balance ? (parseFloat(json.balance) * 1000000).toString() : '0');
            const nonce = json.nonce || 0;

            // Update Cache
            const data = await chrome.storage.local.get(balancesKey);
            const balances = data.balances || {};
            balances[address] = rawBalance;
            await chrome.storage.local.set({ [balancesKey]: balances });

            return {
                result: {
                    address,
                    balance: rawBalance,
                    formatted: json.balance ? parseFloat(json.balance).toFixed(6) : (parseFloat(rawBalance) / 1000000).toFixed(6),
                    nonce: nonce,
                    _source: 'network'
                }
            };
        }
    } catch (e) {
        console.warn('[Background] Failed to fetch balance from network, using cache:', e);
    }

    // 2. Fallback to storage cache
    const data = await chrome.storage.local.get(balancesKey);
    const balances = data.balances || {};

    return {
        result: {
            address,
            balance: balances[address] || '0',
            formatted: balances[address] ? (parseFloat(balances[address]) / 1000000).toFixed(6) : '0',
            _source: 'cache'
        }
    };
}

/**
 * Handle sign message (OSM-1)
 */
async function handleSignMessage(origin, params) {
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        return { error: { code: 4100, message: 'Not connected' } };
    }
    const { payload } = params;

    // Get wallet
    const wallet = await getWalletFromStorage();
    if (!wallet) return { error: 'Wallet not found' };

    // Check lock
    if (!wallet.privateKey && !wallet.privateKeyB64) {
        return { error: 'Wallet locked. Please unlock.' };
    }

    // Request Approval
    try {
        const result = await requestApproval(origin, 'signMessage', params, wallet);
        return { result: result.result };
    } catch (err) {
        return { error: { code: 4001, message: 'User rejected message signing' } };
    }
}

/**
 * Handle sign transaction (OTX-1)
 */
async function handleSignTransaction(origin, params) {
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        return { error: { code: 4100, message: 'Not connected' } };
    }

    // 1. Get Wallet
    const wallet = await getWalletFromStorage();
    if (!wallet) {
        return { error: 'Wallet not found. Please connect first.' };
    }

    if (!wallet.privateKey && !wallet.privateKeyB64) {
        return { error: 'Wallet locked. Please unlock to sign transaction.' };
    }

    // Auto-fill nonce
    const txParams = params.transaction || params;
    await ensureNonce(txParams, wallet.address);

    if (params.transaction) params.transaction = txParams;
    else Object.assign(params, txParams);

    // 2. Request User Approval
    try {
        // console.log('[Background] Requesting transaction signature approval...');
        const result = await requestApproval(origin, 'signTransaction', params, wallet);
        return result;
    } catch (err) {
        return { error: { code: 4001, message: err.message || 'User rejected signature' } };
    }
}

/**
 * Handle send transaction
 */
async function handleSendTransaction(origin, params) {
    const connection = dappConnections.get(origin);
    if (!connection || !connection.connected) {
        return { error: { code: 4100, message: 'Not connected' } };
    }

    // 1. Get Wallet
    const wallet = await getWalletFromStorage();
    if (!wallet) {
        return { error: 'Wallet not found. Please connect first.' };
    }

    if (!wallet.privateKey && !wallet.privateKeyB64) {
        return { error: 'Wallet locked. Please unlock to send transaction.' };
    }

    // Auto-fill nonce
    const txParams = params.transaction || params;
    await ensureNonce(txParams, wallet.address);

    if (params.transaction) params.transaction = txParams;
    else Object.assign(params, txParams);

    // 2. Request User Approval
    try {
        // console.log('[Background] Requesting transaction send approval...');
        const result = await requestApproval(origin, 'sendTransaction', params, wallet);
        return result;
    } catch (err) {
        return { error: { code: 4001, message: err.message || 'User rejected transaction' } };
    }
}

// Helper to ensure nonce is set
async function ensureNonce(txParams, address) {
    if (txParams.nonce === undefined || txParams.nonce === null) {
        try {
            // console.log('[Background] Nonce missing, fetching from network...');
            const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://octra.network';
            const baseUrl = RPC_URL.replace(/\/+$/, '');
            const resp = await fetch(`${baseUrl}/balance/${address}`);
            if (resp.ok) {
                const json = await resp.json();
                const netNonce = parseInt(json.nonce || 0);
                txParams.nonce = netNonce + 1;
            } else {
                txParams.nonce = Date.now();
            }
        } catch (e) {
            console.warn('[Background] Failed to fetch nonce:', e);
            txParams.nonce = Date.now();
        }
    }
}

/**
 * Handle popup requests
 */
async function handlePopupRequest(message) {
    const { action, data } = message;

    switch (action) {
        case 'getPendingRequests':
            return {
                result: Array.from(pendingRequests.entries()).map(([id, req]) => ({ id, ...req }))
            };

        case 'getConnections':
            return {
                result: Array.from(dappConnections.entries()).map(([origin, info]) => ({ origin, ...info }))
            };

        case 'disconnectOrigin':
            dappConnections.delete(data.origin);
            await saveConnections();
            return { result: true };

        default:
            return { error: 'Unknown action' };
    }
}

/**
 * Get wallet from storage (Decryption Layer)
 */
async function getWalletFromStorage() {
    // 1. Get raw session (Encrypted)
    let session = activeSessionCache;

    // If memory cache empty, try fetch
    if (!session) {
        try {
            const data = await chrome.storage.session?.get(['dapp_wallet_session']);
            if (data?.dapp_wallet_session) {
                session = JSON.parse(data.dapp_wallet_session);
                activeSessionCache = session;
            }
        } catch (e) { }
    }

    // 2. Decrypt if we have the key
    if (session && session.encryptedPrivateKey && memorySessionKey) {
        try {
            const plaintextKey = await decryptSession(session.encryptedPrivateKey, memorySessionKey);
            if (plaintextKey) {
                return {
                    ...session,
                    privateKey: plaintextKey, // Inject decrypted key for this op
                    privateKeyB64: plaintextKey // Alias for compatibility
                };
            }
        } catch (e) {
            console.error('[Background] Decryption failed:', e);
        }
    }

    // 3. Fallback: Check if unencrypted (Legacy support / Transition)
    if (session && (session.privateKey || session.privateKeyB64)) {
        return session;
    }

    return null; // Locked
}

/**
 * Handle Approval Resolution from Popup
 */
async function handleResolveApproval(data) {
    const { id, decision, result, sessionKey } = data; // decision: 'approved' | 'rejected'

    // ZERO-TRUST KEY HANDOFF
    // If the UI sends a session key with approval, use it immediately
    if (sessionKey) {
        memorySessionKey = sessionKey;
        // console.log('[Background] Received session key via Approval Handoff');
    }

    const approval = dappApprovals.get(id);

    if (!approval) return { success: false, error: 'Request not found' };

    dappApprovals.delete(id);

    if (decision === 'approved') {
        try {
            // CRITICAL FIX: Ensure wallet is unlocked before signing
            // Even if it was passed in 'approval.wallet', that object might be stale/locked/null
            let signingWallet = approval.wallet || {};

            // If the stored wallet object doesn't have a private key, try to fetch fresh one from storage
            // This handles the race condition where user just unlocked in the popup
            if (!signingWallet.privateKey && !signingWallet.privateKeyB64) {
                const freshWallet = await getWalletFromStorage();
                if (freshWallet && (freshWallet.privateKey || freshWallet.privateKeyB64)) {
                    signingWallet = freshWallet;
                    // console.log('[Background] Refreshed wallet session for signing');
                } else {
                    throw new Error('Wallet is locked. Please unlock the extension.');
                }
            }

            // EXTRA GUARD: Final check before signing
            if (!signingWallet || (!signingWallet.privateKey && !signingWallet.privateKeyB64)) {
                throw new Error('Critical: Wallet session invalid (missing key) after unlock.');
            }

            if (approval.type === 'sendTransaction') {
                const signed = await signAndBroadcastTransaction(approval.params, signingWallet);
                approval.resolve({ result: signed });
            }
            else if (approval.type === 'signTransaction') {
                const signed = await signTransactionOnly(approval.params, signingWallet);
                approval.resolve({ result: signed });
            }
            else if (approval.type === 'signMessage') {
                const pk = signingWallet.privateKey || signingWallet.privateKeyB64;
                if (!pk) throw new Error('Private key missing for message signing');

                const signature = await signMessageWithKey(approval.params.payload, pk);
                approval.resolve({
                    result: {
                        signature,
                        publicKey: signingWallet.publicKeyB64,
                        address: signingWallet.address,
                        payload: approval.params.payload
                    }
                });
            }
            else {
                // For 'connect'
                approval.resolve({ result: result });
            }
        } catch (err) {
            console.error('[Background] Resolve Error:', err);
            approval.reject({ code: 5000, message: err.message || 'Internal signing error' });
        }
    } else {
        approval.reject({ code: 4001, message: 'User rejected request' });
    }

    return { success: true };
}

/**
 * Helper: Sign Transaction ONLY (No Broadcast)
 */
async function signTransactionOnly(params, wallet) {
    // console.log('[Background] SignTransactionOnly requested');
    const privateKey = wallet.privateKey || wallet.privateKeyB64;

    const txParams = params.transaction || params;
    const from = wallet.address;
    const to = txParams.to;

    // Amount
    const μ = 1_000_000;
    const amount = typeof txParams.amount === 'string' ? txParams.amount : String(txParams.amount);
    let amountRaw;
    if (txParams.amountRaw) {
        amountRaw = txParams.amountRaw;
    } else {
        amountRaw = Math.floor(parseFloat(amount) * μ).toString();
    }

    const nonce = Number(txParams.nonce || Date.now());
    const timestamp = Date.now() / 1000;

    const tx = {
        from: from,
        to_: to,
        amount: amountRaw,
        nonce: nonce,
        ou: txParams.fee ? String(Math.floor(txParams.fee * μ)) : '2000',
        timestamp: timestamp
    };

    if (txParams.message) {
        tx.message = txParams.message;
    }

    const signPayload = JSON.stringify({
        from: tx.from,
        to_: tx.to_,
        amount: tx.amount,
        nonce: tx.nonce,
        ou: tx.ou,
        timestamp: tx.timestamp
    });

    // Validations
    if (!tx.from || !tx.to_) throw new Error("Invalid transaction parameters: From and To are required");
    if (isNaN(tx.nonce)) throw new Error("Invalid nonce");

    // Sign
    const messageBytes = new TextEncoder().encode(signPayload);
    const binaryKey = atob(privateKey);
    const seedBytes = new Uint8Array(binaryKey.length);
    for (let i = 0; i < binaryKey.length; i++) seedBytes[i] = binaryKey.charCodeAt(i);

    const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
    const signatureBytes = nacl.sign.detached(messageBytes, keyPair.secretKey);

    let signature = '';
    for (let i = 0; i < signatureBytes.length; i++) signature += String.fromCharCode(signatureBytes[i]);
    signature = btoa(signature);

    const signedTransaction = {
        ...tx,
        signature: signature,
        public_key: wallet.publicKeyB64
    };

    return signedTransaction;
}

/**
 * Helper: Sign and Broadcast Transaction
 */
async function signAndBroadcastTransaction(params, wallet) {
    // Reuse signing logic
    const signedTransaction = await signTransactionOnly(params, wallet);

    // Broadcast
    // console.log('[Background] Broadcasting transaction...');
    const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://octra.network';
    const broadcastUrl = `${RPC_URL.replace(/\/+$/, '')}/send-tx`;

    const rpcResponse = await fetch(broadcastUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signedTransaction)
    });

    const text = await rpcResponse.text();

    if (!rpcResponse.ok) {
        let errorMessage = `Broadcast failed: ${rpcResponse.status} ${rpcResponse.statusText}`;
        try {
            const json = JSON.parse(text);
            if (json.error) errorMessage = json.error;
        } catch (e) {
            if (text) errorMessage = text;
        }
        throw new Error(errorMessage);
    }

    let txHash = '';
    try {
        const json = JSON.parse(text);
        if (json.status === 'accepted' || json.tx_hash) {
            txHash = json.tx_hash;
        } else if (json.error) {
            throw new Error(json.error);
        }
    } catch (e) {
        if (text.toLowerCase().startsWith('ok')) {
            const parts = text.split(/\s+/);
            txHash = parts[parts.length - 1];
        } else {
            txHash = text;
        }
    }

    return {
        signedTransaction: signedTransaction,
        txHash: txHash,
        broadcast: true
    };
}

/**
 * Sign message with private key (OSM-1 format)
 */
async function signMessageWithKey(payload, privateKeyB64) {
    // 1. Decode Private Key
    const privateKeyBytes = Uint8Array.from(atob(privateKeyB64), c => c.charCodeAt(0));

    // Derive if seed (32 bytes = seed, 64 bytes = full keypair)
    let secretKey = privateKeyBytes;
    if (privateKeyBytes.length === 32) {
        const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
        secretKey = keyPair.secretKey;
    }

    // 2. Serialize Payload (Deterministic JSON - sorted keys)
    const sortedKeys = Object.keys(payload).sort();
    const sortedPayload = {};
    for (const key of sortedKeys) {
        if (payload[key] !== undefined) {
            sortedPayload[key] = payload[key];
        }
    }
    const serialized = JSON.stringify(sortedPayload);

    // 3. Apply OSM-1 Prefix (as per standard)
    const PREFIX = '\x19Octra Signed Message:\n';
    const fullMessage = PREFIX + serialized.length.toString() + '\n' + serialized;

    // 4. Sign
    const messageBytes = new TextEncoder().encode(fullMessage);
    const signatureBytes = nacl.sign.detached(messageBytes, secretKey);

    // 5. Base64 Encode Signature
    const signature = btoa(String.fromCharCode.apply(null, signatureBytes));

    return signature;
}
