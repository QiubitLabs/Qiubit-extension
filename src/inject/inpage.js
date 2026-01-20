/**
 * Inpage Provider Script
 * Injected into every webpage to provide window.octra API
 * This runs in the page context, NOT extension context
 */

(function () {
    'use strict';

    // Prevent duplicate injection
    if (window.octra) {
        return;
    }

    const OSM_VERSION = 'OSM-1';
    let requestId = 0;
    const pendingRequests = new Map();

    // Listen for responses from content script
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data.type !== 'OCTRA_RESPONSE') return;

        const { id, result, error } = event.data;
        const pending = pendingRequests.get(id);

        if (pending) {
            pendingRequests.delete(id);
            if (error) {
                pending.reject(error);
            } else {
                pending.resolve(result);
            }
        }
    });

    // Send request to content script
    function sendRequest(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++requestId;
            pendingRequests.set(id, { resolve, reject });

            window.postMessage({
                type: 'OCTRA_REQUEST',
                id,
                method,
                params
            }, '*');

            // Timeout after 5 minutes (for user approval)
            setTimeout(() => {
                if (pendingRequests.has(id)) {
                    pendingRequests.delete(id);
                    reject({ code: 4100, message: 'Request timeout' });
                }
            }, 300000);
        });
    }

    // Event emitter
    const eventListeners = new Map();

    function emit(event, data) {
        const listeners = eventListeners.get(event) || [];
        listeners.forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error('[Octra] Event listener error:', e);
            }
        });
    }

    // Create provider object
    const provider = {
        isOctraWallet: true,
        isQiubit: true,
        version: '1.0.0',
        name: 'Qiubit',

        // State
        isConnected: false,
        selectedAddress: null,
        networkId: null,
        chainId: null,

        /**
         * Connect to the wallet
         */
        async connect(options = {}) {
            const result = await sendRequest('connect', {
                appInfo: options.appInfo || {
                    name: document.title,
                    url: window.location.origin
                }
            });

            if (result.accounts && result.accounts.length > 0) {
                this.isConnected = true;
                this.selectedAddress = result.selectedAddress || result.accounts[0];
                this.networkId = result.networkId;
                this.chainId = result.chainId;
                emit('connect', { accounts: result.accounts });
            }

            return result;
        },

        /**
         * Disconnect from wallet
         */
        async disconnect() {
            await sendRequest('disconnect');
            this.isConnected = false;
            this.selectedAddress = null;
            emit('disconnect');
        },

        /**
         * Get connected accounts
         */
        async getAccounts() {
            if (!this.isConnected) {
                return [];
            }
            return sendRequest('getAccounts');
        },

        /**
         * Get public key
         */
        async getPublicKey() {
            if (!this.isConnected) {
                throw { code: 4100, message: 'Not connected' };
            }
            return sendRequest('getPublicKey');
        },

        /**
         * Get balance
         */
        async getBalance(address) {
            return sendRequest('getBalance', { address: address || this.selectedAddress });
        },

        /**
         * Sign message (OSM-1)
         */
        async signMessage(messageOrPayload) {
            if (!this.isConnected) {
                throw { code: 4100, message: 'Not connected' };
            }

            // Accept string or OSM-1 payload
            let payload;
            if (typeof messageOrPayload === 'string') {
                payload = {
                    version: OSM_VERSION,
                    message: messageOrPayload,
                    address: this.selectedAddress,
                    domain: window.location.origin,
                    nonce: crypto.randomUUID(),
                    timestamp: Date.now()
                };
            } else {
                payload = {
                    version: OSM_VERSION,
                    ...messageOrPayload,
                    address: messageOrPayload.address || this.selectedAddress,
                    domain: messageOrPayload.domain || window.location.origin,
                    nonce: messageOrPayload.nonce || crypto.randomUUID(),
                    timestamp: messageOrPayload.timestamp || Date.now()
                };
            }

            return sendRequest('signMessage', { payload });
        },

        /**
         * Sign transaction (OTX-1)
         */
        async signTransaction(txParams) {
            if (!this.isConnected) {
                throw { code: 4100, message: 'Not connected' };
            }

            return sendRequest('signTransaction', {
                ...txParams,
                from: txParams.from || this.selectedAddress
            });
        },

        /**
         * Send transaction
         */
        async sendTransaction(txParams) {
            if (!this.isConnected) {
                throw { code: 4100, message: 'Not connected' };
            }

            return sendRequest('sendTransaction', {
                ...txParams,
                from: txParams.from || this.selectedAddress
            });
        },

        /**
         * Generic request method
         */
        async request(args) {
            const { method, params } = args;

            switch (method) {
                case 'octra_requestAccounts':
                    const connectResult = await this.connect();
                    return connectResult.accounts;

                case 'octra_accounts':
                    return this.getAccounts();

                case 'octra_chainId':
                    return this.chainId;

                case 'octra_signMessage':
                    return this.signMessage(params);

                case 'octra_sendTransaction':
                    return this.sendTransaction(params);

                default:
                    throw { code: 4200, message: `Method not supported: ${method}` };
            }
        },

        // Event handling
        on(event, callback) {
            if (!eventListeners.has(event)) {
                eventListeners.set(event, []);
            }
            eventListeners.get(event).push(callback);
        },

        off(event, callback) {
            const listeners = eventListeners.get(event);
            if (listeners) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        },

        once(event, callback) {
            const wrapped = (data) => {
                this.off(event, wrapped);
                callback(data);
            };
            this.on(event, wrapped);
        }
    };

    // Expose provider
    window.octra = provider;

    // Also expose as qiubit for branding
    window.qiubit = provider;

    // Dispatch initialization event
    window.dispatchEvent(new Event('octra#initialized'));

    console.log('[Qiubit] Provider injected');
})();
