/**
 * Qiubit Wallet — Inpage Provider
 * Injected into every webpage. Implements EIP-1193 + EIP-6963 + Solana Wallet + Sui Wallet.
 *
 * Architecture: shared bridge + per-chain provider objects.
 */

(function () {
    'use strict';

    if (window.__qiubitInjected) return;
    window.__qiubitInjected = true;

    // ─── Error class ─────────────────────────────────────────────────────────

    class ProviderRpcError extends Error {
        constructor(code, message, data) {
            super(message);
            this.name = 'ProviderRpcError';
            this.code = code;
            if (data !== undefined) this.data = data;
        }
    }

    function toRpcError(err) {
        if (err instanceof ProviderRpcError) return err;
        if (err && typeof err === 'object' && typeof err.code === 'number')
            return new ProviderRpcError(err.code, err.message || 'Unknown error', err.data);
        if (err instanceof Error) return new ProviderRpcError(-32603, err.message);
        return new ProviderRpcError(-32603, String(err));
    }

    // ─── Base58 codec (for SolanaPublicKey.toBuffer) ──────────────────────────

    const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const BASE58_MAP = new Uint8Array(256).fill(255);
    for (let i = 0; i < BASE58_ALPHABET.length; i++) BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i;

    function base58ToBytes(str) {
        const bytes = [0];
        for (let i = 0; i < str.length; i++) {
            const val = BASE58_MAP[str.charCodeAt(i)];
            if (val === 255) throw new Error('Invalid base58 character');
            let carry = val;
            for (let j = 0; j < bytes.length; j++) {
                carry += bytes[j] * 58;
                bytes[j] = carry & 0xff;
                carry >>= 8;
            }
            while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
        }
        for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
        return new Uint8Array(bytes.reverse());
    }

    function bytesToBase58(bytes) {
        const digits = [0];
        for (const byte of bytes) {
            let carry = byte;
            for (let j = 0; j < digits.length; j++) {
                carry += digits[j] << 8;
                digits[j] = carry % 58;
                carry = (carry / 58) | 0;
            }
            while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
        }
        let str = '';
        for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += '1';
        for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
        return str;
    }

    function base64ToBytes(str) {
        try {
            const bin = atob(str);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        } catch { return new Uint8Array(0); }
    }

    function bytesToBase64(bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    // Serialize a Solana transaction (Transaction / VersionedTransaction object,
    // Uint8Array, number[], or already-base64 string) to a base64 string. This
    // is critical: a raw Uint8Array is corrupted when it crosses the extension
    // message pipeline (JSON), causing "Reached end of buffer" on the signer.
    function solTxToBase64(tx) {
        if (tx == null) return tx;
        if (typeof tx === 'string') return tx; // assume base64 already
        if (tx instanceof Uint8Array) return bytesToBase64(tx);
        if (Array.isArray(tx)) return bytesToBase64(new Uint8Array(tx));
        if (typeof tx.serialize === 'function') {
            let bytes;
            try {
                // legacy Transaction (unsigned) needs these flags
                bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
            } catch (_) {
                // VersionedTransaction.serialize() takes no args
                bytes = tx.serialize();
            }
            return bytesToBase64(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        }
        return tx;
    }

    // Coerce any signed-tx / signature value from the background into raw bytes,
    // which is what @solana/wallet-standard requires.
    function toUint8(value) {
        if (value instanceof Uint8Array) return value;
        if (Array.isArray(value)) return new Uint8Array(value);
        if (value && typeof value === 'object') {
            const keys = Object.keys(value).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
            if (keys.length) return new Uint8Array(keys.map(k => value[k]));
        }
        if (typeof value === 'string') {
            // base64 first (signed tx), then base58 (signature)
            const b64 = base64ToBytes(value);
            if (b64.length) return b64;
            try { return base58ToBytes(value); } catch { return new Uint8Array(0); }
        }
        return new Uint8Array(0);
    }

    // ─── SolanaPublicKey — mimics @solana/web3.js PublicKey ───────────────────
    // dApp libraries call .toBase58(), .toBuffer(), .toString(), .equals()

    class SolanaPublicKey {
        constructor(value) {
            if (value instanceof SolanaPublicKey) {
                this._base58 = value._base58;
                this._bytes = value._bytes;
            } else if (value instanceof Uint8Array || Array.isArray(value)) {
                this._bytes = new Uint8Array(value);
                this._base58 = bytesToBase58(this._bytes);
            } else if (typeof value === 'string') {
                this._base58 = value;
                try { this._bytes = base58ToBytes(value); } catch { this._bytes = new Uint8Array(32); }
            } else {
                throw new Error('SolanaPublicKey: invalid input');
            }
        }
        toBase58()  { return this._base58; }
        toString()  { return this._base58; }
        toJSON()    { return this._base58; }
        toBuffer()  { return Buffer ? Buffer.from(this._bytes) : this._bytes; }
        toBytes()   { return this._bytes; }
        equals(other) {
            const o = other instanceof SolanaPublicKey ? other : new SolanaPublicKey(other);
            return this._base58 === o._base58;
        }
    }

    // ─── Secure channel token ─────────────────────────────────────────────────

    const QIUBIT_ICON = 'data:image/png;base64,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';

    const CHANNEL_TOKEN = crypto.randomUUID();
    window.postMessage({ type: 'OCTRA_CHANNEL_INIT', channelToken: CHANNEL_TOKEN }, window.location.origin);

    // ─── Shared bridge ────────────────────────────────────────────────────────

    let requestId = 0;
    const pendingRequests = new Map();

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        if (event.data.type === 'OCTRA_RESPONSE') {
            const { id, result, error } = event.data;
            const pending = pendingRequests.get(id);
            if (pending) {
                pendingRequests.delete(id);
                if (error) pending.reject(toRpcError(error));
                else pending.resolve(result);
            }
            return;
        }

        if (event.data.type === 'OCTRA_EVENT') {
            routeEvent(event.data.event, event.data.data);
        }
    });

    function sendRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++requestId;
            pendingRequests.set(id, { resolve, reject });
            window.postMessage(
                { type: 'OCTRA_REQUEST', channelToken: CHANNEL_TOKEN, id, method, params },
                window.location.origin
            );
            // 2-minute timeout (was 5 min — reduced to match Phantom/MetaMask)
            setTimeout(() => {
                if (pendingRequests.has(id)) {
                    pendingRequests.delete(id);
                    reject(new ProviderRpcError(4100, 'Request timeout'));
                }
            }, 120_000);
        });
    }

    // ─── Event emitter factory ────────────────────────────────────────────────

    function makeEmitter() {
        const listeners = new Map();
        return {
            emit(event, data) {
                (listeners.get(event) || []).forEach(cb => {
                    try { cb(data); } catch (e) { console.error('[Qiubit] listener error:', e); }
                });
            },
            on(event, cb) {
                if (!listeners.has(event)) listeners.set(event, []);
                listeners.get(event).push(cb);
                return this;
            },
            off(event, cb) {
                const arr = listeners.get(event);
                if (arr) { const i = arr.indexOf(cb); if (i > -1) arr.splice(i, 1); }
                return this;
            },
            once(event, cb) {
                const wrap = (d) => { this.off(event, wrap); cb(d); };
                return this.on(event, wrap);
            },
            addListener(event, cb) { return this.on(event, cb); },
            removeListener(event, cb) { return this.off(event, cb); },
            removeAllListeners(event) {
                if (event) listeners.delete(event); else listeners.clear();
                return this;
            },
            listeners(event) { return [...(listeners.get(event) || [])]; },
        };
    }

    // ─── Event router ─────────────────────────────────────────────────────────

    const emitters = {};

    function routeEvent(event, data) {
        const colonIdx = event.indexOf(':');
        if (colonIdx !== -1) {
            const chain = event.slice(0, colonIdx);
            const evName = event.slice(colonIdx + 1);
            emitters[chain]?.emit(evName, data);
        } else {
            emitters['evm']?.emit(event, data);
        }
    }

    function registerEmitter(chain, emitter) { emitters[chain] = emitter; }
    function registerProvider(windowKey, provider) { window[windowKey] = provider; }

    // ─── Wallet Standard registration (Solana & Sui) ──────────────────────────
    // Mirrors @wallet-standard/wallet registerWallet(): dispatch register-wallet
    // (detail = a callback the app invokes with its { register } api) and answer
    // app-ready for dApps that load after us. We keep the callbacks so we can
    // re-dispatch register-wallet later — some dApps attach their listener after
    // our initial dispatch and never emit app-ready, so a single dispatch misses
    // them. Re-dispatching register-wallet only (never touching navigator.wallets)
    // is safe because registries dedupe by wallet identity.
    const _wsCallbacks = [];
    function registerWalletStandard(wallet) {
        const callback = (api) => {
            try {
                (api && api.register ? api.register : api)(wallet);
            } catch (e) {
                console.warn('[Qiubit] Wallet Standard register failed:', e);
            }
        };
        _wsCallbacks.push(callback);
        announceWallet(callback);
        try {
            window.addEventListener('wallet-standard:app-ready', (event) => {
                callback(event.detail);
            });
        } catch (_) {}
    }

    function announceWallet(callback) {
        try {
            window.dispatchEvent(
                new CustomEvent('wallet-standard:register-wallet', { detail: callback })
            );
        } catch (_) {}
    }

    function reannounceWallets() {
        for (const cb of _wsCallbacks) announceWallet(cb);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EVM PROVIDER  (window.ethereum + window.octra)
    // ═══════════════════════════════════════════════════════════════════════════

    const evmEmitter = makeEmitter();
    registerEmitter('evm', evmEmitter);

    const OSM_VERSION = 'OSM-1';

    const evmProvider = {
        isOctraWallet: true,
        isQiubitWallet: true,
        isOctra: true,
        isMetaMask: false,
        version: '1.0.0',
        name: 'Qiubit',

        isConnected: false,
        selectedAddress: null,
        networkId: null,
        chainId: null,
        networkSetting: null,

        // MetaMask compatibility: _metamask.isUnlocked()
        _metamask: {
            isUnlocked: () => Promise.resolve(evmProvider.isConnected),
        },

        getNetwork() {
            return { networkId: this.networkId, chainId: this.chainId, networkSetting: this.networkSetting, isTestnet: this.networkSetting === 'sepolia' };
        },

        async connect(options = {}) {
            const result = await sendRequest('connect', {
                appInfo: options.appInfo || { name: document.title, url: window.location.origin }
            });
            if (result.accounts && result.accounts.length > 0) {
                this.isConnected = true;
                // Ensure we use EVM address (0x...) as selectedAddress
                const evmAddr = result.evmAddress || result.accounts.find(a => a && a.startsWith('0x'));
                this.selectedAddress = evmAddr || result.selectedAddress || result.accounts[0];
                this.octraAddress = result.octraAddress || null;
                this.evmAddress = result.evmAddress || null;
                this.networkId = result.networkId;
                this.chainId = result.chainId;
                this.networkSetting = result.networkSetting || 'octra';
                const chainHex = result.chainId ? '0x' + result.chainId.toString(16) : '0x1';
                evmEmitter.emit('connect', { chainId: chainHex });
            }
            return result;
        },

        async disconnect() {
            await sendRequest('disconnect');
            this.isConnected = false;
            this.selectedAddress = null;
            evmEmitter.emit('accountsChanged', []);
            evmEmitter.emit('disconnect', new ProviderRpcError(4900, 'Disconnected from chain'));
        },

        async getAccounts() {
            if (!this.isConnected) return [];
            return sendRequest('getAccounts');
        },

        async getPublicKey() {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
            return sendRequest('getPublicKey');
        },

        async getBalance(address) {
            return sendRequest('getBalance', { address: address || this.selectedAddress });
        },

        async getEncryptedBalance() {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
            return sendRequest('getEncryptedBalance');
        },

        async signMessage(messageOrPayload) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
            let payload;
            if (typeof messageOrPayload === 'string') {
                payload = { version: OSM_VERSION, message: messageOrPayload, address: this.selectedAddress, domain: window.location.origin, nonce: crypto.randomUUID(), timestamp: Date.now() };
            } else {
                payload = { version: OSM_VERSION, ...messageOrPayload, address: messageOrPayload.address || this.selectedAddress, domain: messageOrPayload.domain || window.location.origin, nonce: messageOrPayload.nonce || crypto.randomUUID(), timestamp: messageOrPayload.timestamp || Date.now() };
            }
            return sendRequest('signMessage', { payload });
        },

        async signTransaction(txParams) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
            return sendRequest('signTransaction', { ...txParams, from: txParams.from || this.selectedAddress });
        },

        async sendTransaction(txParams) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
            return sendRequest('sendTransaction', { ...txParams, from: txParams.from || this.selectedAddress });
        },

        async callContract(contractAddress, method, params = [], options = {}) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
            return sendRequest('contractCall', { address: contractAddress, method, params, amount: options.amount || '0' });
        },

        async callContractView(contractAddress, method, params = []) {
            return sendRequest('contractView', { address: contractAddress, method, params, caller: this.selectedAddress });
        },

        async getPendingTransactions() {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
            return sendRequest('getPendingTransactions');
        },

        async request(args) {
            const method = args.method;
            const params = args.params ?? [];

            switch (method) {
                case 'eth_requestAccounts': {
                    const res = await this.connect();
                    // Return ONLY EVM addresses (0x...) — MetaMask standard
                    if (res.evmAddress) return [res.evmAddress];
                    const evmAccounts = (res.accounts || []).filter(a => a && a.startsWith('0x'));
                    return evmAccounts.length > 0 ? evmAccounts : (res.accounts || []);
                }

                case 'eth_accounts': {
                    // Forward directly to background — no isConnected guard.
                    // MetaMask returns accounts based on permissions, not in-page state.
                    // This also lets the page know it's connected after a page reload
                    // without requiring the user to call eth_requestAccounts again.
                    const accounts = await sendRequest('eth_accounts', {});
                    if (Array.isArray(accounts)) {
                        const evm = accounts.filter(a => a && a.startsWith('0x'));
                        const result = evm.length > 0 ? evm : accounts;
                        // Sync local state so subsequent sendTransaction checks pass
                        if (result.length > 0 && !this.isConnected) {
                            this.isConnected = true;
                            this.selectedAddress = result[0];
                        }
                        return result;
                    }
                    return this.selectedAddress ? [this.selectedAddress] : [];
                }

                case 'eth_chainId': {
                    if (this.chainId != null) return '0x' + this.chainId.toString(16);
                    // sendRequest resolves the unwrapped result (a hex string)
                    const hex = await sendRequest('eth_chainId', {});
                    if (typeof hex === 'string' && hex.startsWith('0x')) {
                        this.chainId = parseInt(hex, 16);
                        return hex;
                    }
                    return '0x1';
                }

                case 'net_version': {
                    if (this.chainId != null) return String(this.chainId);
                    const hex = await sendRequest('eth_chainId', {});
                    return String(parseInt(typeof hex === 'string' ? hex : '0x1', 16));
                }

                case 'eth_sendTransaction': {
                    if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
                    const txParams = Array.isArray(params) ? params[0] : params;
                    // A dApp-supplied chainId must win over the cached one
                    const res = await sendRequest('eth_sendTransaction', { ...txParams, from: txParams.from || this.selectedAddress, chainId: txParams.chainId ?? this.chainId });
                    if (res?.error) throw toRpcError(res.error);
                    const raw = res?.result ?? res;
                    if (typeof raw === 'string') return raw;
                    return raw?.hash ?? raw?.txHash ?? raw;
                }

                case 'personal_sign': {
                    const message = Array.isArray(params) ? params[0] : params.message;
                    const fromAddr = (Array.isArray(params) ? params[1] : params.from) || this.selectedAddress;
                    if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
                    const res = await sendRequest('personal_sign', { message, from: fromAddr, chainId: this.chainId });
                    if (res?.error) throw toRpcError(res.error);
                    return res?.result ?? res;
                }

                case 'eth_sign': {
                    const fromAddr = Array.isArray(params) ? params[0] : params.from;
                    const message = Array.isArray(params) ? params[1] : params.message;
                    if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
                    const res = await sendRequest('personal_sign', { message, from: fromAddr, chainId: this.chainId });
                    if (res?.error) throw toRpcError(res.error);
                    return res?.result ?? res;
                }

                case 'eth_signTypedData':
                case 'eth_signTypedData_v1':
                case 'eth_signTypedData_v3':
                case 'eth_signTypedData_v4': {
                    const fromAddr = Array.isArray(params) ? params[0] : params.from;
                    const typedData = Array.isArray(params) ? params[1] : params.typedData;
                    if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
                    const res = await sendRequest('eth_signTypedData_v4', { from: fromAddr, typedData, chainId: this.chainId });
                    if (res?.error) throw toRpcError(res.error);
                    return res?.result ?? res;
                }

                case 'wallet_addEthereumChain': {
                    const networkParams = Array.isArray(params) ? params[0] : params;
                    const res = await sendRequest('wallet_addEthereumChain', networkParams);
                    if (res?.error) throw toRpcError(res.error);
                    return res?.result ?? null;
                }

                case 'wallet_switchEthereumChain': {
                    const switchParams = Array.isArray(params) ? params[0] : params;
                    // A failed switch rejects sendRequest and throws; reaching
                    // this point means the background accepted the switch.
                    // (The background also broadcasts 'chainChanged' to this
                    // origin, which emits the event to dApp listeners.)
                    await sendRequest('wallet_switchEthereumChain', switchParams);
                    if (switchParams.chainId) {
                        this.chainId = parseInt(switchParams.chainId, 16);
                    }
                    return null;
                }

                case 'wallet_getPermissions':
                    return [{ parentCapability: 'eth_accounts' }];

                case 'wallet_requestPermissions':
                    return this.request({ method: 'eth_requestAccounts', params: [] })
                        .then(accounts => [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts }] }]);

                case 'wallet_revokePermissions': return null;

                // sendRequest resolves the unwrapped RPC result directly
                case 'eth_gasPrice':
                case 'eth_blockNumber':
                case 'eth_maxPriorityFeePerGas':
                    try { const res = await sendRequest(method, params); return res ?? (method === 'eth_gasPrice' ? '0x1DCD6500' : '0x0'); } catch { return method === 'eth_gasPrice' ? '0x1DCD6500' : '0x0'; }

                case 'eth_getTransactionCount': { const res = await sendRequest('eth_getTransactionCount', params); return res ?? '0x0'; }
                case 'eth_estimateGas':
                    try { const res = await sendRequest('eth_estimateGas', params); return res ?? '0x186A0'; } catch { return '0x186A0'; }

                case 'eth_getBalance': { const res = await sendRequest('eth_getBalance', params); return res ?? '0x0'; }

                case 'eth_call':
                case 'eth_getBlockByNumber':
                case 'eth_getBlockByHash':
                case 'eth_getTransactionReceipt':
                case 'eth_getTransactionByHash':
                case 'eth_getCode':
                case 'eth_getLogs': {
                    const res = await sendRequest(method, params);
                    if (res?.error) throw toRpcError(res.error);
                    return res?.result ?? res;
                }

                // Octra-native methods (supporting both prefixed and EIP-1193/custom non-prefixed versions for dApps)
                case 'requestAccounts':
                case 'octra_requestAccounts': { const res = await this.connect(); return res.accounts; }
                
                case 'accounts':
                case 'octra_accounts': return this.getAccounts();
                
                case 'chainId':
                case 'octra_chainId': return this.chainId;
                
                case 'signMessage':
                case 'octra_signMessage': return this.signMessage(params);
                
                case 'sendTransaction':
                case 'octra_sendTransaction': return this.sendTransaction(params);
                
                case 'contractCall':
                case 'octra_callContract': {
                    const addr = Array.isArray(params) ? params[0] : params.address;
                    const contractMethod = Array.isArray(params) ? params[1] : params.method;
                    const contractArgs = Array.isArray(params) ? (params[2] || []) : (params.params || []);
                    const opts = Array.isArray(params) ? (params[3] || {}) : (params.options || { amount: params.amount || '0' });
                    return this.callContract(addr, contractMethod, contractArgs, opts);
                }
                
                case 'contractView':
                case 'octra_callContractView': {
                    const addr = Array.isArray(params) ? params[0] : params.address;
                    const contractMethod = Array.isArray(params) ? params[1] : params.method;
                    const contractArgs = Array.isArray(params) ? (params[2] || []) : (params.params || []);
                    return this.callContractView(addr, contractMethod, contractArgs);
                }
                
                case 'getPendingTransactions':
                case 'octra_getPendingTransactions': return this.getPendingTransactions();
                
                case 'disconnect':
                case 'octra_disconnect': return this.disconnect();

                case 'getPublicKey':
                case 'octra_getPublicKey': return this.getPublicKey();

                case 'getBalance':
                case 'octra_getBalance': return this.getBalance(params?.address);

                case 'getEncryptedBalance':
                case 'octra_getEncryptedBalance': return this.getEncryptedBalance();

                case 'signTransaction':
                case 'octra_signTransaction': return this.signTransaction(params);

                default:
                    throw new ProviderRpcError(4200, `Method not supported: ${method}`);
            }
        },

        on(event, cb) { return evmEmitter.on(event, cb); },
        off(event, cb) { return evmEmitter.off(event, cb); },
        addListener(event, cb) { return evmEmitter.on(event, cb); },
        removeListener(event, cb) { return evmEmitter.off(event, cb); },
        removeAllListeners(event) { return evmEmitter.removeAllListeners(event); },
        once(event, cb) { return evmEmitter.once(event, cb); },
        listeners(event) { return evmEmitter.listeners(event); },
    };

    // Handle wallet lock/account change events from background
    evmEmitter.on('accountsChanged', (accounts) => {
        const newAddr = Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
        evmProvider.selectedAddress = newAddr;
        evmProvider.isConnected = !!newAddr;
        if (typeof octraProvider !== 'undefined') {
            octraProvider.selectedAddress = newAddr;
            octraProvider.isConnected = !!newAddr;
        }
    });
    evmEmitter.on('disconnect', () => {
        evmProvider.selectedAddress = null;
        evmProvider.isConnected = false;
        if (typeof octraProvider !== 'undefined') {
            octraProvider.selectedAddress = null;
            octraProvider.isConnected = false;
        }
    });
    // Keep the cached chainId in sync when the background announces a chain
    // switch (e.g. triggered from another tab of the same origin).
    evmEmitter.on('chainChanged', (chainIdHex) => {
        if (typeof chainIdHex === 'string' && chainIdHex.startsWith('0x')) {
            evmProvider.chainId = parseInt(chainIdHex, 16);
        }
    });

    const octraProvider = Object.create(evmProvider);
    octraProvider.connect = async function(options = {}) {
        const result = await sendRequest('connect', {
            appInfo: options.appInfo || { name: document.title, url: window.location.origin },
            networkSetting: 'octra'
        });
        if (result.accounts && result.accounts.length > 0) {
            this.isConnected = true;
            this.selectedAddress = result.selectedAddress || result.accounts[0];
            this.octraAddress = result.octraAddress || null;
            this.evmAddress = result.evmAddress || null;
            this.networkId = 'octra';
            this.chainId = 1;
            this.networkSetting = 'octra';
            evmEmitter.emit('connect', { chainId: '0x1' });
        }
        return result;
    };
    octraProvider.request = async function(args) {
        const method = args.method;
        const params = args.params ?? [];
        if (method === 'eth_requestAccounts' || method === 'octra_requestAccounts') {
            const res = await this.connect();
            return [res.selectedAddress || res.accounts[0]];
        }
        return evmProvider.request.call(this, args);
    };

    registerProvider('octra', octraProvider);
    registerProvider('ethereum', evmProvider);

    // Auto-restore EVM connection state on page load.
    // When the page reloads, isConnected resets to false. Ask the background
    // if this origin already has a connection (saved from a prior session).
    // If it does, restore selectedAddress / chainId so dApps don't need to
    // call eth_requestAccounts again.
    (async () => {
        try {
            const accounts = await sendRequest('eth_accounts', {});
            if (Array.isArray(accounts) && accounts.length > 0) {
                const evmAddr = accounts.find(a => a && a.startsWith('0x')) || accounts[0];
                evmProvider.isConnected = true;
                evmProvider.selectedAddress = evmAddr;
                try {
                    const chainHex = await sendRequest('eth_chainId', {});
                    if (typeof chainHex === 'string' && chainHex.startsWith('0x')) {
                        evmProvider.chainId = parseInt(chainHex, 16);
                    }
                } catch (_) {}
                evmEmitter.emit('connect', { chainId: '0x' + (evmProvider.chainId || 1).toString(16) });
                evmEmitter.emit('accountsChanged', [evmAddr]);
            }
        } catch (_) {}
    })();

    // ─── EIP-6963 ─────────────────────────────────────────────────────────────

    const eip6963Info = Object.freeze({
        uuid: 'b8f8b5a0-4e2d-4c6a-9f3b-1d7e5c9a2f40',
        name: 'Qiubit Wallet',
        icon: QIUBIT_ICON,
        rdns: 'io.qiubit.wallet',
    });

    function announceEvmProvider() {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
            detail: Object.freeze({ info: eip6963Info, provider: evmProvider })
        }));
    }
    announceEvmProvider();
    window.addEventListener('eip6963:requestProvider', announceEvmProvider);

    // ═══════════════════════════════════════════════════════════════════════════
    // SOLANA PROVIDER  (window.solana)
    // ═══════════════════════════════════════════════════════════════════════════

    const solanaEmitter = makeEmitter();
    registerEmitter('solana', solanaEmitter);

    // Normalize signature from backend: base64 string | number[] | Uint8Array → Uint8Array
    function normalizeSolanaSignature(sig) {
        if (sig instanceof Uint8Array) return sig;
        if (Array.isArray(sig)) return new Uint8Array(sig);
        if (typeof sig === 'string') {
            try {
                const bin = atob(sig);
                const out = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                return out;
            } catch { return new Uint8Array(0); }
        }
        return new Uint8Array(0);
    }

    const solanaProvider = {
        isQiubitWallet: true,
        isPhantom: false,       // do not impersonate Phantom
        isSolflare: false,
        name: 'Qiubit',

        // publicKey is a SolanaPublicKey object (not a plain string) — matches Phantom API
        publicKey: null,
        isConnected: false,

        async connect(opts = {}) {
            const result = await sendRequest('solana_connect', {
                appInfo: opts.appInfo || { name: document.title, url: window.location.origin },
                onlyIfTrusted: opts.onlyIfTrusted ?? false,
            });
            if (result?.publicKey) {
                this.publicKey = new SolanaPublicKey(result.publicKey);
                this.isConnected = true;
                solanaEmitter.emit('connect', this.publicKey);
                // Update Wallet Standard accounts
                _updateSolanaWalletStandardAccounts(this.publicKey);
            }
            return { publicKey: this.publicKey };
        },

        async disconnect() {
            await sendRequest('solana_disconnect', {});
            this.publicKey = null;
            this.isConnected = false;
            solanaEmitter.emit('disconnect', undefined);
            _updateSolanaWalletStandardAccounts(null);
        },

        async signTransaction(serializedTx) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Solana');
            const pkStr = this.publicKey?.toBase58() ?? '';
            const res = await sendRequest('solana_signTransaction', { transaction: solTxToBase64(serializedTx), publicKey: pkStr });
            if (res?.error) throw toRpcError(res.error);
            // Return signed transaction in same format as input (pass-through)
            return res?.result ?? res;
        },

        async signAllTransactions(transactions) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Solana');
            const pkStr = this.publicKey?.toBase58() ?? '';
            const encoded = Array.isArray(transactions) ? transactions.map(solTxToBase64) : transactions;
            const res = await sendRequest('solana_signAllTransactions', { transactions: encoded, publicKey: pkStr });
            if (res?.error) throw toRpcError(res.error);
            return res?.result ?? res;
        },

        async signMessage(message, encoding = 'utf8') {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Solana');
            const pkStr = this.publicKey?.toBase58() ?? '';
            // Normalize input message
            let msgData;
            if (message instanceof Uint8Array) {
                msgData = Array.from(message);
            } else if (typeof message === 'string') {
                msgData = Array.from(new TextEncoder().encode(message));
            } else if (Array.isArray(message)) {
                msgData = message;
            } else {
                msgData = Array.from(new TextEncoder().encode(String(message)));
            }
            const res = await sendRequest('solana_signMessage', { message: msgData, encoding, publicKey: pkStr });
            if (res?.error) throw toRpcError(res.error);
            const raw = res?.result ?? res;
            // Normalize to Phantom-compatible format: { signature: Uint8Array, publicKey: SolanaPublicKey }
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                return {
                    signature: normalizeSolanaSignature(raw.signature ?? raw),
                    publicKey: new SolanaPublicKey(raw.publicKey ?? pkStr),
                };
            }
            // raw is the signature bytes directly
            return {
                signature: normalizeSolanaSignature(raw),
                publicKey: this.publicKey,
            };
        },

        async sendTransaction(serializedTx, opts = {}) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Solana');
            const pkStr = this.publicKey?.toBase58() ?? '';
            const res = await sendRequest('solana_sendTransaction', { transaction: solTxToBase64(serializedTx), options: opts, publicKey: pkStr });
            if (res?.error) throw toRpcError(res.error);
            return res?.result ?? res; // tx signature string
        },

        on(event, cb) { return solanaEmitter.on(event, cb); },
        off(event, cb) { return solanaEmitter.off(event, cb); },
        addListener(event, cb) { return solanaEmitter.on(event, cb); },
        removeListener(event, cb) { return solanaEmitter.off(event, cb); },
        once(event, cb) { return solanaEmitter.once(event, cb); },
    };

    // Handle accountChanged from background (user switched wallet).
    // Only raw strings (or null) come from the background; the re-emit below
    // delivers a SolanaPublicKey (or undefined) to dApp listeners. Guarding on
    // the incoming type prevents the re-emit from looping back into this
    // handler forever.
    solanaEmitter.on('accountChanged', (pubkeyStr) => {
        if (typeof pubkeyStr === 'string' && pubkeyStr) {
            const newKey = new SolanaPublicKey(pubkeyStr);
            solanaProvider.publicKey = newKey;
            solanaProvider.isConnected = true;
            _updateSolanaWalletStandardAccounts(newKey);
            // Emit to dApp listeners
            solanaEmitter.emit('accountChanged', newKey);
        } else if (pubkeyStr === null) {
            solanaProvider.publicKey = null;
            solanaProvider.isConnected = false;
            _updateSolanaWalletStandardAccounts(null);
            solanaEmitter.emit('accountChanged', undefined);
        }
    });

    registerProvider('solana', solanaProvider);

    // ─── Solana Wallet Standard ───────────────────────────────────────────────
    // Full implementation of @solana/wallet-standard features
    // Required for @solana/wallet-adapter-react compatibility

    let _solanaWalletStandardListeners = [];
    let _solanaWalletStandardAccounts = [];

    function _updateSolanaWalletStandardAccounts(publicKey) {
        _solanaWalletStandardAccounts = publicKey
            ? [{ address: publicKey.toBase58(), publicKey: publicKey.toBytes(), chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'], features: ['solana:signMessage', 'solana:signTransaction', 'solana:signAndSendTransaction', 'solana:signIn', 'standard:connect', 'standard:disconnect', 'standard:events'] }]
            : [];
        _solanaWalletStandardListeners.forEach(cb => {
            try { cb({ accounts: _solanaWalletStandardAccounts }); } catch {}
        });
    }

    const _solanaWalletStandardFeatures = {
        'standard:connect': {
            version: '1.0.0',
            connect: async ({ silent } = {}) => {
                if (silent && solanaProvider.isConnected && solanaProvider.publicKey) {
                    return { accounts: _solanaWalletStandardAccounts };
                }
                await solanaProvider.connect({ onlyIfTrusted: silent ?? false });
                return { accounts: _solanaWalletStandardAccounts };
            },
        },
        'standard:disconnect': {
            version: '1.0.0',
            disconnect: () => solanaProvider.disconnect(),
        },
        'standard:events': {
            version: '1.0.0',
            on: (event, listener) => {
                if (event === 'change') {
                    _solanaWalletStandardListeners.push(listener);
                    return () => {
                        _solanaWalletStandardListeners = _solanaWalletStandardListeners.filter(l => l !== listener);
                    };
                }
                return () => {};
            },
        },
        'solana:signMessage': {
            version: '1.0.0',
            signMessage: async ({ message, account }) => {
                const result = await solanaProvider.signMessage(new Uint8Array(message));
                return [{ signedMessage: message, signature: result.signature }];
            },
        },
        'solana:signTransaction': {
            version: '1.0.0',
            // Required by @solana/wallet-standard adapters; its absence makes
            // the StandardWalletAdapter constructor read `.length` of undefined
            // and crash the whole dApp (Jupiter/Meteora "Oops"). We handle both
            // legacy and v0 (versioned) transactions in signTransaction.
            supportedTransactionVersions: ['legacy', 0],
            signTransaction: async ({ transaction, account, chain }) => {
                const signed = await solanaProvider.signTransaction(transaction);
                // Wallet Standard requires raw bytes, not a base64 string.
                return [{ signedTransaction: toUint8(signed) }];
            },
        },
        'solana:signAndSendTransaction': {
            version: '1.0.0',
            supportedTransactionVersions: ['legacy', 0],
            signAndSendTransaction: async ({ transaction, account, chain, options }) => {
                const sig = await solanaProvider.sendTransaction(transaction, options);
                // Signature must be raw bytes (base58 string → bytes).
                return [{ signature: toUint8(typeof sig === 'string' ? sig : sig?.signature ?? sig) }];
            },
        },
        // Sign In With Solana (SIWS) — optional but expected by auth flows.
        'solana:signIn': {
            version: '1.0.0',
            signIn: async (...inputs) => {
                const list = inputs.length ? inputs : [{}];
                const outputs = [];
                for (const input of list) {
                    if (!solanaProvider.isConnected || !solanaProvider.publicKey) {
                        await solanaProvider.connect({ onlyIfTrusted: false });
                    }
                    const address = input.address || solanaProvider.publicKey.toBase58();
                    const domain = input.domain || window.location.host;
                    const text = createSignInMessageText({ ...input, address, domain });
                    const messageBytes = new TextEncoder().encode(text);
                    const result = await solanaProvider.signMessage(messageBytes);
                    outputs.push({
                        account: _solanaWalletStandardAccounts[0],
                        signedMessage: messageBytes,
                        signature: toUint8(result.signature),
                        signatureType: 'ed25519',
                    });
                }
                return outputs;
            },
        },
    };

    // Build the canonical Sign In With Solana message text (matches
    // @solana/wallet-standard-util createSignInMessageText).
    function createSignInMessageText(input) {
        let message = `${input.domain} wants you to sign in with your Solana account:\n`;
        message += `${input.address}`;
        if (input.statement) message += `\n\n${input.statement}`;
        const fields = [];
        if (input.uri) fields.push(`URI: ${input.uri}`);
        if (input.version) fields.push(`Version: ${input.version}`);
        if (input.chainId) fields.push(`Chain ID: ${input.chainId}`);
        if (input.nonce) fields.push(`Nonce: ${input.nonce}`);
        if (input.issuedAt) fields.push(`Issued At: ${input.issuedAt}`);
        if (input.expirationTime) fields.push(`Expiration Time: ${input.expirationTime}`);
        if (input.notBefore) fields.push(`Not Before: ${input.notBefore}`);
        if (input.requestId) fields.push(`Request ID: ${input.requestId}`);
        if (input.resources && input.resources.length) {
            fields.push('Resources:');
            for (const r of input.resources) fields.push(`- ${r}`);
        }
        if (fields.length) message += `\n\n${fields.join('\n')}`;
        return message;
    }

    // NOTE: Solana and Sui are NOT registered as two separate wallets — two
    // wallets sharing the name "Qiubit" collide in registries that dedupe by
    // name (e.g. @mysten/dapp-kit), so one shadows the other. Instead a single
    // multichain "Qiubit" wallet is registered further below, advertising both
    // solana:* and sui:* chains and all features at once (Phantom/Backpack
    // pattern). The feature objects above are reused there.

    // ═══════════════════════════════════════════════════════════════════════════
    // SUI PROVIDER  (window.sui)
    // ═══════════════════════════════════════════════════════════════════════════

    const suiEmitter = makeEmitter();
    registerEmitter('sui', suiEmitter);

    let _suiWalletStandardListeners = [];
    let _suiWalletStandardAccounts = [];

    function _updateSuiWalletStandardAccounts(address, publicKeyBytes) {
        _suiWalletStandardAccounts = address
            ? [{ address, publicKey: publicKeyBytes || new Uint8Array(32), chains: ['sui:mainnet', 'sui:testnet', 'sui:devnet'], features: ['sui:signPersonalMessage', 'sui:signTransaction', 'sui:signAndExecuteTransaction', 'sui:signTransactionBlock', 'sui:signAndExecuteTransactionBlock', 'sui:reportTransactionEffects', 'standard:connect', 'standard:disconnect', 'standard:events'] }]
            : [];
        _suiWalletStandardListeners.forEach(cb => {
            try { cb({ accounts: _suiWalletStandardAccounts }); } catch {}
        });
    }

    const suiProvider = {
        isQiubitWallet: true,
        name: 'Qiubit',

        address: null,
        isConnected: false,

        async connect(opts = {}) {
            const result = await sendRequest('sui_connect', {
                appInfo: opts.appInfo || { name: document.title, url: window.location.origin }
            });
            if (result?.address) {
                this.address = result.address;
                this.isConnected = true;
                suiEmitter.emit('connect', { address: this.address });
                const pubBytes = result.suiPublicKey ? base64ToBytes(result.suiPublicKey) : null;
                _updateSuiWalletStandardAccounts(this.address, pubBytes);
            }
            return { address: this.address, accounts: _suiWalletStandardAccounts };
        },

        async disconnect() {
            await sendRequest('sui_disconnect', {});
            this.address = null;
            this.isConnected = false;
            suiEmitter.emit('disconnect', undefined);
            _updateSuiWalletStandardAccounts(null, null);
        },

        async signAndExecuteTransaction(txBlock, opts = {}) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Sui');
            const res = await sendRequest('sui_signAndExecuteTransaction', { txBlock: solTxToBase64(txBlock), options: opts, address: this.address });
            if (res?.error) throw toRpcError(res.error);
            return res?.result ?? res;
        },

        async signTransaction(txBlock) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Sui');
            const res = await sendRequest('sui_signTransaction', { txBlock: solTxToBase64(txBlock), address: this.address });
            if (res?.error) throw toRpcError(res.error);
            return res?.result ?? res;
        },

        async signMessage(input) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Sui');
            // Normalize message input
            let msgBytes;
            if (input.message instanceof Uint8Array) {
                msgBytes = input.message;
            } else if (Array.isArray(input.message)) {
                msgBytes = new Uint8Array(input.message);
            } else if (typeof input.message === 'string') {
                msgBytes = new TextEncoder().encode(input.message);
            } else {
                msgBytes = new Uint8Array(0);
            }
            // Encode as base64 for transport
            const msgBase64 = btoa(String.fromCharCode(...msgBytes));
            const res = await sendRequest('sui_signMessage', { message: msgBase64, address: this.address });
            if (res?.error) throw toRpcError(res.error);
            const raw = res?.result ?? res;
            // Return in Sui standard format
            return {
                messageBytes: msgBase64,
                signature: raw?.signature ?? raw ?? '',
            };
        },

        async getAccounts() {
            if (!this.isConnected) return [];
            const res = await sendRequest('sui_getAccounts', { address: this.address });
            return res?.result ?? (this.address ? [{ address: this.address }] : []);
        },

        on(event, cb) { return suiEmitter.on(event, cb); },
        off(event, cb) { return suiEmitter.off(event, cb); },
        addListener(event, cb) { return suiEmitter.on(event, cb); },
        removeListener(event, cb) { return suiEmitter.off(event, cb); },
        once(event, cb) { return suiEmitter.once(event, cb); },
    };

    // Handle account changes from background
    suiEmitter.on('accountChanged', (address) => {
        suiProvider.address = address || null;
        suiProvider.isConnected = !!address;
        _updateSuiWalletStandardAccounts(address || null, null);
    });

    registerProvider('sui', suiProvider);

    // ─── Sui Wallet Standard (@mysten/wallet-standard) ───────────────────────

    const _suiWalletStandardFeatures = {
        'standard:connect': {
            version: '1.0.0',
            connect: async () => {
                await suiProvider.connect();
                return { accounts: _suiWalletStandardAccounts };
            },
        },
        'standard:disconnect': {
            version: '1.0.0',
            disconnect: () => suiProvider.disconnect(),
        },
        'standard:events': {
            version: '1.0.0',
            on: (event, listener) => {
                if (event === 'change') {
                    _suiWalletStandardListeners.push(listener);
                    return () => {
                        _suiWalletStandardListeners = _suiWalletStandardListeners.filter(l => l !== listener);
                    };
                }
                return () => {};
            },
        },
        'sui:signPersonalMessage': {
            version: '1.0.0',
            signPersonalMessage: async ({ message, account }) => {
                const result = await suiProvider.signMessage({ message });
                return { messageBytes: result.messageBytes, signature: result.signature };
            },
        },
        'sui:signTransaction': {
            version: '2.0.0',
            signTransaction: async ({ transaction, account, chain }) => {
                const result = await suiProvider.signTransaction(transaction);
                return { bytes: result?.bytes ?? '', signature: result?.signature ?? result ?? '' };
            },
        },
        'sui:signAndExecuteTransaction': {
            version: '2.0.0',
            signAndExecuteTransaction: async ({ transaction, account, chain }) => {
                return await suiProvider.signAndExecuteTransaction(transaction);
            },
        },
        // Legacy *Block features: older @mysten/dapp-kit / wallet-adapter
        // versions filter wallets by these names in isWalletWithRequiredFeatureSet,
        // so a wallet exposing only the v2 features above is not detected.
        'sui:signTransactionBlock': {
            version: '1.0.0',
            signTransactionBlock: async ({ transactionBlock, account, chain }) => {
                const result = await suiProvider.signTransaction(transactionBlock);
                return {
                    transactionBlockBytes: result?.bytes ?? result?.transactionBlockBytes ?? '',
                    signature: result?.signature ?? result ?? '',
                };
            },
        },
        'sui:signAndExecuteTransactionBlock': {
            version: '1.0.0',
            signAndExecuteTransactionBlock: async ({ transactionBlock, account, chain, options }) => {
                return await suiProvider.signAndExecuteTransaction(transactionBlock, options || {});
            },
        },
        'sui:reportTransactionEffects': {
            version: '1.0.0',
            reportTransactionEffects: async () => {
                // No-op: some adapters require the feature to exist.
            },
        },
    };

    // ─── Single multichain wallet (Solana + Sui) ─────────────────────────────
    // One "Qiubit" that advertises both chains so it appears in Solana dApps
    // (Jupiter) and Sui dApps (Cetus/SuiVision) without name collision.
    const _mergedWsListeners = [];
    function fireMergedChange() {
        const accounts = [..._solanaWalletStandardAccounts, ..._suiWalletStandardAccounts];
        for (const cb of _mergedWsListeners) { try { cb({ accounts }); } catch (_) {} }
    }

    // Unified connect: one approval grants both addresses (same underlying key).
    async function multichainConnect() {
        const res = await sendRequest('multichain_connect', {
            appInfo: { name: document.title, url: window.location.origin },
        });
        if (res?.solana) {
            solanaProvider.publicKey = new SolanaPublicKey(res.solana);
            solanaProvider.isConnected = true;
            _updateSolanaWalletStandardAccounts(solanaProvider.publicKey);
            solanaEmitter.emit('connect', solanaProvider.publicKey);
        }
        if (res?.sui) {
            suiProvider.address = res.sui;
            suiProvider.isConnected = true;
            const suiPubBytes = res.suiPublicKey ? base64ToBytes(res.suiPublicKey) : null;
            _updateSuiWalletStandardAccounts(res.sui, suiPubBytes);
            suiEmitter.emit('connect', { address: res.sui });
        }
        return { accounts: [..._solanaWalletStandardAccounts, ..._suiWalletStandardAccounts] };
    }

    const _mergedFeatures = {
        'standard:connect': { version: '1.0.0', connect: multichainConnect },
        'standard:disconnect': {
            version: '1.0.0',
            disconnect: async () => {
                await solanaProvider.disconnect().catch(() => {});
                await suiProvider.disconnect().catch(() => {});
            },
        },
        'standard:events': {
            version: '1.0.0',
            on: (event, listener) => {
                if (event !== 'change') return () => {};
                _mergedWsListeners.push(listener);
                return () => {
                    const i = _mergedWsListeners.indexOf(listener);
                    if (i > -1) _mergedWsListeners.splice(i, 1);
                };
            },
        },
        // Solana signing features
        'solana:signMessage': _solanaWalletStandardFeatures['solana:signMessage'],
        'solana:signTransaction': _solanaWalletStandardFeatures['solana:signTransaction'],
        'solana:signAndSendTransaction': _solanaWalletStandardFeatures['solana:signAndSendTransaction'],
        'solana:signIn': _solanaWalletStandardFeatures['solana:signIn'],
        // Sui signing features (v2 + legacy *Block + report)
        'sui:signPersonalMessage': _suiWalletStandardFeatures['sui:signPersonalMessage'],
        'sui:signTransaction': _suiWalletStandardFeatures['sui:signTransaction'],
        'sui:signAndExecuteTransaction': _suiWalletStandardFeatures['sui:signAndExecuteTransaction'],
        'sui:signTransactionBlock': _suiWalletStandardFeatures['sui:signTransactionBlock'],
        'sui:signAndExecuteTransactionBlock': _suiWalletStandardFeatures['sui:signAndExecuteTransactionBlock'],
        'sui:reportTransactionEffects': _suiWalletStandardFeatures['sui:reportTransactionEffects'],
    };

    // Report account changes from either chain to standard:events listeners.
    suiEmitter.on('accountChanged', fireMergedChange);
    solanaEmitter.on('accountChanged', fireMergedChange);

    registerWalletStandard({
        version: '1.0.0',
        name: 'Qiubit',
        icon: QIUBIT_ICON,
        chains: [
            'solana:mainnet', 'solana:devnet', 'solana:testnet',
            'sui:mainnet', 'sui:testnet', 'sui:devnet',
        ],
        features: _mergedFeatures,
        get accounts() {
            return [..._solanaWalletStandardAccounts, ..._suiWalletStandardAccounts];
        },
    });

    // ─── Init events ──────────────────────────────────────────────────────────

    window.dispatchEvent(new Event('octra#initialized'));
    window.dispatchEvent(new Event('ethereum#initialized'));
    window.dispatchEvent(new Event('solana#initialized'));
    window.dispatchEvent(new Event('sui#initialized'));

    // Re-announce so dApps that attach their wallet-standard listener after our
    // document_start dispatch (and never emit app-ready) still discover us.
    // Deduped by wallet identity in the registry, so repeats are harmless.
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', reannounceWallets, { once: true });
        }
        window.addEventListener('load', reannounceWallets, { once: true });
        setTimeout(reannounceWallets, 500);
        setTimeout(reannounceWallets, 1500);
    } catch (_) {}

})();
