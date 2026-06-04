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

                case 'eth_chainId':
                    if (this.chainId != null) return '0x' + this.chainId.toString(16);
                    return sendRequest('eth_chainId', {}).then(r => r?.result ?? '0x1');

                case 'net_version':
                    if (this.chainId != null) return String(this.chainId);
                    return sendRequest('eth_chainId', {}).then(r => String(parseInt(r?.result ?? '0x1', 16)));

                case 'eth_sendTransaction': {
                    if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected');
                    const txParams = Array.isArray(params) ? params[0] : params;
                    const res = await sendRequest('eth_sendTransaction', { ...txParams, from: txParams.from || this.selectedAddress, chainId: this.chainId });
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
                    const res = await sendRequest('wallet_switchEthereumChain', switchParams);
                    if (res?.error) throw toRpcError(res.error);
                    if (res?.result === null && switchParams.chainId) {
                        const newChainId = parseInt(switchParams.chainId, 16);
                        this.chainId = newChainId;
                        evmEmitter.emit('chainChanged', switchParams.chainId);
                    }
                    return res?.result ?? null;
                }

                case 'wallet_getPermissions':
                    return [{ parentCapability: 'eth_accounts' }];

                case 'wallet_requestPermissions':
                    return this.request({ method: 'eth_requestAccounts', params: [] })
                        .then(accounts => [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: accounts }] }]);

                case 'wallet_revokePermissions': return null;

                case 'eth_gasPrice':
                case 'eth_blockNumber':
                case 'eth_maxPriorityFeePerGas':
                    try { const res = await sendRequest(method, params); return res?.result ?? (method === 'eth_gasPrice' ? '0x1DCD6500' : '0x0'); } catch { return method === 'eth_gasPrice' ? '0x1DCD6500' : '0x0'; }

                case 'eth_getTransactionCount': { const res = await sendRequest('eth_getTransactionCount', params); return res?.result ?? '0x0'; }
                case 'eth_estimateGas':
                    try { const res = await sendRequest('eth_estimateGas', params); return res?.result ?? '0x186A0'; } catch { return '0x186A0'; }

                case 'eth_getBalance': { const res = await sendRequest('eth_getBalance', params); return res?.result ?? '0x0'; }

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

                // Octra-native methods
                case 'octra_requestAccounts': { const res = await this.connect(); return res.accounts; }
                case 'octra_accounts': return this.getAccounts();
                case 'octra_chainId': return this.chainId;
                case 'octra_signMessage': return this.signMessage(params);
                case 'octra_sendTransaction': return this.sendTransaction(params);
                case 'octra_callContract': return this.callContract(params.address, params.method, params.params, params.options);
                case 'octra_callContractView': return this.callContractView(params.address, params.method, params.params);
                case 'octra_getPendingTransactions': return this.getPendingTransactions();
                case 'octra_disconnect': return this.disconnect();

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
    });
    evmEmitter.on('disconnect', () => {
        evmProvider.selectedAddress = null;
        evmProvider.isConnected = false;
    });

    registerProvider('octra', evmProvider);
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
        icon: 'data:image/svg+xml;base64,',
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
            const res = await sendRequest('solana_signTransaction', { transaction: serializedTx, publicKey: pkStr });
            if (res?.error) throw toRpcError(res.error);
            // Return signed transaction in same format as input (pass-through)
            return res?.result ?? res;
        },

        async signAllTransactions(transactions) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Solana');
            const pkStr = this.publicKey?.toBase58() ?? '';
            const res = await sendRequest('solana_signAllTransactions', { transactions, publicKey: pkStr });
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
            const res = await sendRequest('solana_sendTransaction', { transaction: serializedTx, options: opts, publicKey: pkStr });
            if (res?.error) throw toRpcError(res.error);
            return res?.result ?? res; // tx signature string
        },

        on(event, cb) { return solanaEmitter.on(event, cb); },
        off(event, cb) { return solanaEmitter.off(event, cb); },
        addListener(event, cb) { return solanaEmitter.on(event, cb); },
        removeListener(event, cb) { return solanaEmitter.off(event, cb); },
        once(event, cb) { return solanaEmitter.once(event, cb); },
    };

    // Handle accountChanged from background (user switched wallet)
    solanaEmitter.on('accountChanged', (pubkeyStr) => {
        if (pubkeyStr) {
            const newKey = new SolanaPublicKey(pubkeyStr);
            solanaProvider.publicKey = newKey;
            solanaProvider.isConnected = true;
            _updateSolanaWalletStandardAccounts(newKey);
            // Emit to dApp listeners
            solanaEmitter.emit('accountChanged', newKey);
        } else {
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
            ? [{ address: publicKey.toBase58(), publicKey: publicKey.toBytes(), chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'], features: ['solana:signMessage', 'solana:signTransaction', 'solana:signAndSendTransaction', 'standard:connect', 'standard:disconnect', 'standard:events'] }]
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
            signTransaction: async ({ transaction, account, chain }) => {
                const signed = await solanaProvider.signTransaction(transaction);
                return [{ signedTransaction: signed }];
            },
        },
        'solana:signAndSendTransaction': {
            version: '1.0.0',
            signAndSendTransaction: async ({ transaction, account, chain, options }) => {
                const sig = await solanaProvider.sendTransaction(transaction, options);
                return [{ signature: typeof sig === 'string' ? sig : sig?.signature ?? sig }];
            },
        },
    };

    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
        bubbles: false,
        cancelable: false,
        composed: false,
        detail: {
            register: (api) => {
                try {
                    api?.register?.({
                        version: '1.0.0',
                        name: 'Qiubit',
                        icon: 'data:image/svg+xml;base64,',
                        chains: ['solana:mainnet', 'solana:devnet', 'solana:testnet'],
                        features: _solanaWalletStandardFeatures,
                        get accounts() { return _solanaWalletStandardAccounts; },
                    });
                } catch (e) {
                    console.warn('[Qiubit] Solana Wallet Standard registration failed:', e);
                }
            }
        }
    }));

    // ═══════════════════════════════════════════════════════════════════════════
    // SUI PROVIDER  (window.sui)
    // ═══════════════════════════════════════════════════════════════════════════

    const suiEmitter = makeEmitter();
    registerEmitter('sui', suiEmitter);

    let _suiWalletStandardListeners = [];
    let _suiWalletStandardAccounts = [];

    function _updateSuiWalletStandardAccounts(address, publicKeyBytes) {
        _suiWalletStandardAccounts = address
            ? [{ address, publicKey: publicKeyBytes || new Uint8Array(32), chains: ['sui:mainnet', 'sui:testnet', 'sui:devnet'], features: ['sui:signPersonalMessage', 'sui:signTransaction', 'sui:signAndExecuteTransaction', 'standard:connect', 'standard:disconnect', 'standard:events'] }]
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
                _updateSuiWalletStandardAccounts(this.address, null);
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
            const res = await sendRequest('sui_signAndExecuteTransaction', { txBlock, options: opts, address: this.address });
            if (res?.error) throw toRpcError(res.error);
            return res?.result ?? res;
        },

        async signTransaction(txBlock) {
            if (!this.isConnected) throw new ProviderRpcError(4100, 'Not connected to Sui');
            const res = await sendRequest('sui_signTransaction', { txBlock, address: this.address });
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
    };

    // Register with Sui Wallet Standard event
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
        bubbles: false,
        cancelable: false,
        composed: false,
        detail: {
            register: (api) => {
                try {
                    api?.register?.({
                        version: '1.0.0',
                        name: 'Qiubit',
                        icon: 'data:image/svg+xml;base64,',
                        chains: ['sui:mainnet', 'sui:testnet', 'sui:devnet'],
                        features: _suiWalletStandardFeatures,
                        get accounts() { return _suiWalletStandardAccounts; },
                    });
                } catch (e) {
                    console.warn('[Qiubit] Sui Wallet Standard registration failed:', e);
                }
            }
        }
    }));

    // ─── Init events ──────────────────────────────────────────────────────────

    window.dispatchEvent(new Event('octra#initialized'));
    window.dispatchEvent(new Event('ethereum#initialized'));
    window.dispatchEvent(new Event('solana#initialized'));

})();
