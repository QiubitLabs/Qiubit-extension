/**
 * Octra SDK - Lightweight developer SDK to connect to Octra Wallet
 * Supports window.octra (Qiubit Protocol Native) and window.ethereum (EIP-1193)
 */
class OctraSDK {
    constructor() {
        this.provider = window.octra || window.ethereum;
        this.isConnected = false;
        this.address = null;
        this.octraAddress = null;
        this.evmAddress = null;
        this.chainId = null;
        this.networkId = null;
        this.listeners = new Map();

        // Listen for standard events from provider
        if (this.provider) {
            this.provider.on('accountsChanged', (accounts) => this._handleAccountsChanged(accounts));
            this.provider.on('chainChanged', (chainId) => this._handleChainChanged(chainId));
            this.provider.on('connect', (info) => this._handleConnect(info));
            this.provider.on('disconnect', (err) => this._handleDisconnect(err));
        }
    }

    /**
     * Check if the provider is available
     */
    isAvailable() {
        return !!(window.octra || window.ethereum);
    }

    /**
     * Connect to the wallet
     * @param {Object} options - Connection options (e.g. appInfo)
     * @returns {Promise<Object>} Connection result containing accounts and network details
     */
    async connect(options = {}) {
        if (!this.isAvailable()) {
            throw new Error('Octra Wallet provider not found. Please install the extension.');
        }
        this.provider = window.octra || window.ethereum;

        const appInfo = options.appInfo || {
            name: document.title,
            url: window.location.origin
        };

        const result = await this.provider.request({
            method: 'eth_requestAccounts',
            params: { appInfo }
        });

        // Query additional information from provider to populate SDK state
        const accounts = result || [];
        if (accounts.length > 0) {
            this.isConnected = true;
            this.address = accounts[0];
            // If the provider has custom native/EVM addresses stored:
            this.octraAddress = this.provider.octraAddress || (this.address.startsWith('oct') ? this.address : null);
            this.evmAddress = this.provider.evmAddress || (this.address.startsWith('0x') ? this.address : null);
            
            try {
                this.chainId = await this.provider.request({ method: 'eth_chainId' });
            } catch (e) {
                this.chainId = this.provider.chainId;
            }
            
            this.networkId = this.provider.networkId || (this.chainId === '0xaa36a7' || this.chainId === 11155111 ? 'sepolia' : 'mainnet');
        }

        return {
            accounts,
            address: this.address,
            octraAddress: this.octraAddress,
            evmAddress: this.evmAddress,
            chainId: this.chainId,
            networkId: this.networkId
        };
    }

    /**
     * Disconnect the active session
     */
    async disconnect() {
        if (!this.provider) return;
        if (typeof this.provider.disconnect === 'function') {
            await this.provider.disconnect();
        }
        this._handleDisconnect();
    }

    /**
     * Get active accounts
     */
    async getAccounts() {
        if (!this.provider) return [];
        return await this.provider.request({ method: 'eth_accounts' });
    }

    /**
     * Get wallet's public key (Base64)
     */
    async getPublicKey() {
        if (!this.provider) throw new Error('Provider not available');
        return await this.provider.request({ method: 'getPublicKey' });
    }

    /**
     * Get balance of an address
     * @param {string} address - Optional address to check, defaults to active address
     */
    async getBalance(address) {
        if (!this.provider) throw new Error('Provider not available');
        const target = address || this.address;
        if (!target) throw new Error('No address provided');
        
        // Use custom getBalance method
        return await this.provider.request({
            method: 'getBalance',
            params: { address: target }
        });
    }

    /**
     * Get encrypted balance (natively decrypted inside the wallet enclave)
     */
    async getEncryptedBalance() {
        if (!this.provider) throw new Error('Provider not available');
        return await this.provider.request({ method: 'getEncryptedBalance' });
    }

    /**
     * Sign message (OCS-01 compliant)
     * @param {string|Object} messageOrPayload - Plain text string or custom message payload
     */
    async signMessage(messageOrPayload) {
        if (!this.provider) throw new Error('Provider not available');
        
        let payload;
        if (typeof messageOrPayload === 'string') {
            payload = {
                message: messageOrPayload,
                address: this.address,
                timestamp: Date.now()
            };
        } else {
            payload = messageOrPayload;
        }

        return await this.provider.request({
            method: 'signMessage',
            params: { payload }
        });
    }

    /**
     * Sign native transaction
     * @param {Object} txParams - Transaction details (to, amount, nonce, payload, etc.)
     */
    async signTransaction(txParams) {
        if (!this.provider) throw new Error('Provider not available');
        return await this.provider.request({
            method: 'signTransaction',
            params: txParams
        });
    }

    /**
     * Send native transaction (sign & broadcast)
     * @param {Object} txParams - Transaction details (to, amount, nonce, payload, etc.)
     */
    async sendTransaction(txParams) {
        if (!this.provider) throw new Error('Provider not available');
        return await this.provider.request({
            method: 'sendTransaction',
            params: txParams
        });
    }

    /**
     * Call native smart contract method (state-modifying, requires user gas approval)
     * @param {string} contractAddress - Target smart contract address
     * @param {string} method - Contract function name
     * @param {Array} params - Function arguments
     * @param {Object} options - Call options (e.g. { amount: '0' })
     */
    async contractCall(contractAddress, method, params = [], options = {}) {
        if (!this.provider) throw new Error('Provider not available');
        return await this.provider.request({
            method: 'contractCall',
            params: {
                address: contractAddress,
                method,
                params,
                amount: options.amount || '0'
            }
        });
    }

    /**
     * Call native smart contract view (read-only, zero gas, no popup)
     * @param {string} contractAddress - Target smart contract address
     * @param {string} method - Contract function name
     * @param {Array} params - Function arguments
     */
    async contractView(contractAddress, method, params = []) {
        if (!this.provider) throw new Error('Provider not available');
        return await this.provider.request({
            method: 'contractView',
            params: {
                address: contractAddress,
                method,
                params,
                caller: this.address || contractAddress
            }
        });
    }

    /**
     * Get pending transactions in the pool
     */
    async getPendingTransactions() {
        if (!this.provider) throw new Error('Provider not available');
        return await this.provider.request({ method: 'getPendingTransactions' });
    }

    // --- Event Emitter helpers ---

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(callback);
        return this;
    }

    off(event, callback) {
        const list = this.listeners.get(event);
        if (list) {
            const idx = list.indexOf(callback);
            if (idx > -1) list.splice(idx, 1);
        }
        return this;
    }

    emit(event, data) {
        const list = this.listeners.get(event) || [];
        list.forEach(cb => {
            try { cb(data); } catch (e) { console.error('[OctraSDK] Event dispatch error:', e); }
        });
    }

    _handleAccountsChanged(accounts) {
        if (accounts.length > 0) {
            this.isConnected = true;
            this.address = accounts[0];
            this.octraAddress = this.provider?.octraAddress || (this.address.startsWith('oct') ? this.address : null);
            this.evmAddress = this.provider?.evmAddress || (this.address.startsWith('0x') ? this.address : null);
        } else {
            this.isConnected = false;
            this.address = null;
            this.octraAddress = null;
            this.evmAddress = null;
        }
        this.emit('accountsChanged', accounts);
    }

    _handleChainChanged(chainId) {
        this.chainId = chainId;
        this.networkId = this.provider?.networkId || (this.chainId === '0xaa36a7' || this.chainId === 11155111 ? 'sepolia' : 'mainnet');
        this.emit('chainChanged', chainId);
    }

    _handleConnect(info) {
        this.isConnected = true;
        this.emit('connect', info);
    }

    _handleDisconnect(err) {
        this.isConnected = false;
        this.address = null;
        this.octraAddress = null;
        this.evmAddress = null;
        this.chainId = null;
        this.networkId = null;
        this.emit('disconnect', err);
    }
}

// Export for common module systems, otherwise attach to window
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { OctraSDK };
} else {
    window.OctraSDK = OctraSDK;
}
