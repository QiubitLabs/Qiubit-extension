/**
 * RPC Client for Octra Blockchain
 * Handles communication with the Octra network
 * 
 * EXTENSION MODE: Direct RPC connection (no CORS restrictions)
 */

// Network RPC URLs
export const RPC_URLS = {
    mainnet: import.meta.env.VITE_RPC_URL || 'https://octra.network',
    testnet: import.meta.env.VITE_TESTNET_RPC_URL || '', // Testnet - not available yet
};

// EXTENSION MODE: Direct connection to blockchain node
// Browser extensions bypass CORS, no proxy needed!
const DEFAULT_RPC = RPC_URLS.mainnet;

class RPCClient {
    constructor(rpcUrl = DEFAULT_RPC) {
        this.rpcUrl = rpcUrl;
        // Detect if running as extension or website
        const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
        this.timeout = isExtension ? 15000 : 5000; // Faster timeout for website/dev mode
    }

    setRpcUrl(url) {
        // Direct connection - no proxy logic needed for extension
        this.rpcUrl = url || DEFAULT_RPC;
    }

    getActualRpcUrl() {
        return this.rpcUrl;
    }

    async request(method, path, data = null, headers = {}, retries = 2, timeoutMs = null) {
        const controller = new AbortController();

        // Logic: specific timeout -> default timeout. 
        // If timeoutMs is strictly 0, we Disable timeout (infinite wait).
        const effectiveTimeout = timeoutMs !== null ? timeoutMs : this.timeout;
        let timeoutId;

        if (effectiveTimeout > 0) {
            timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
        }

        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                signal: controller.signal
            };

            if (data && method === 'POST') {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`${this.rpcUrl}${path}`, options);
            if (timeoutId) clearTimeout(timeoutId);

            const text = await response.text();
            let json = null;

            try {
                json = text.trim() ? JSON.parse(text) : null;
            } catch (e) {
                console.warn(`[RPC] Invalid JSON from ${path}:`, text.substring(0, 200));
                json = null;
            }

            // Retry on 503, 502, 504 (server errors)
            if (!response.ok && [502, 503, 504].includes(response.status) && retries > 0) {
                // EXPONENTIAL BACKOFF + JITTER: 
                // If 503, server is overloaded. Wait LONGER.
                // Random delay between 2000ms and 3000ms to avoid thundering herd
                const baseDelay = 2000;
                const jitter = Math.floor(Math.random() * 1000);
                const delay = baseDelay + jitter;

                console.warn(`[RPC] Server error ${response.status}, retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.request(method, path, data, retries - 1);
            }

            return {
                status: response.status,
                text,
                json,
                ok: response.ok,
                error: !response.ok ? (json?.error || `HTTP ${response.status}`) : undefined
            };
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                return { status: 0, text: 'timeout', json: null, ok: false, error: 'Request timeout (Check if RPC is UP or CORS blocked)' };
            }

            // Detect CORS error (fetch error with no status)
            if (error.message === 'Failed to fetch') {
                return { status: 0, text: 'cors', json: null, ok: false, error: 'CORS Blocked: Access denied by browser (Test as Extension)' };
            }

            // Retry on network errors
            if (retries > 0) {
                const delay = (3 - retries) * 1000;
                console.warn(`[RPC] Network error, retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.request(method, path, data, retries - 1);
            }

            console.error(`[RPC] Connection error to ${path}:`, error);
            return { status: 0, text: error.message, json: null, ok: false, error: error.message };
        }
    }

    async get(path, headers = {}) {
        return this.request('GET', path, null, headers);
    }

    async post(path, data, headers = {}, timeoutMs = null) {
        return this.request('POST', path, data, headers, 2, timeoutMs);
    }

    /**
     * Get balance and nonce for an address
     */
    async getBalance(address) {
        const result = await this.get(`/balance/${address}`);

        if (result.status === 200 && result.json) {
            return {
                balance: parseFloat(result.json.balance || 0),
                nonce: parseInt(result.json.nonce || 0)
            };
        } else if (result.status === 404) {
            return { balance: 0, nonce: 0 };
        }

        throw new Error(result.error || 'Failed to get balance');
    }

    /**
     * Get address info including transaction history
     * Supports pagination via 'before' hash
     */
    async getAddressInfo(address, limit = 20, before = null) {
        let url = `/address/${address}?limit=${limit}`;
        if (before) {
            url += `&before=${before}`;
        }

        const result = await this.get(url);

        if (result.status === 200 && result.json) {
            return result.json;
        } else if (result.status === 404) {
            return {
                address,
                balance: '0',
                nonce: 0,
                recent_transactions: []
            };
        }

        throw new Error(result.error || 'Failed to get address info');
    }

    /**
     * Get transaction details by hash
     */
    async getTransaction(txHash) {
        const result = await this.get(`/tx/${txHash}`);

        if (result.status === 200 && result.json) {
            return result.json;
        }

        throw new Error(result.error || 'Transaction not found');
    }

    /**
     * Get staged transactions (pending in mempool)
     */
    async getStagedTransactions() {
        const result = await this.get('/staging');

        if (result.status === 200 && result.json) {
            return result.json.staged_transactions || [];
        }

        return [];
    }

    /**
     * Send a transaction
     */
    async sendTransaction(tx) {
        // No timeout (0) - Wait indefinitely for server response as per user request
        const result = await this.post('/send-tx', tx, {}, 0);

        if (result.status === 200) {
            if (result.json && result.json.status === 'accepted') {
                return {
                    success: true,
                    txHash: result.json.tx_hash,
                    poolInfo: result.json.pool_info
                };
            } else if (result.text && result.text.toLowerCase().startsWith('ok')) {
                const parts = result.text.split(/\s+/);
                return {
                    success: true,
                    txHash: parts[parts.length - 1]
                };
            }
        }

        const error = result.json?.error || result.text || 'Transaction failed';
        throw new Error(error);
    }

    /**
     * Get encrypted balance (for privacy features)
     */
    async getEncryptedBalance(address, privateKey) {
        try {
            // Include private key in headers as per Octra protocol
            const headers = {
                'X-Private-Key': privateKey
            };

            const result = await this.request('GET', `/view_encrypted_balance/${address}`, null, headers);

            if (result.status === 200 && result.json) {
                return {
                    public: parseFloat(result.json.public_balance?.split(' ')[0] || '0'),
                    publicRaw: parseInt(result.json.public_balance_raw || '0'),
                    encrypted: parseFloat(result.json.encrypted_balance?.split(' ')[0] || '0'),
                    encryptedRaw: parseInt(result.json.encrypted_balance_raw || '0'),
                    total: parseFloat(result.json.total_balance?.split(' ')[0] || '0')
                };
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Check if RPC is reachable
     */
    async checkConnection() {
        try {
            const result = await this.get('/health');
            return result.ok || result.status === 200;
        } catch {
            try {
                // Try alternate endpoint
                const result = await this.get('/staging');
                return result.status === 200;
            } catch {
                return false;
            }
        }
    }

    /**
     * Get fee estimate from network
     * Returns low, medium, high fee options
     */
    async getFeeEstimate(amount = 1) {
        try {
            // Try to get fee estimate from network
            const result = await this.get('/fee-estimate');

            if (result.status === 200 && result.json) {
                return {
                    low: parseFloat(result.json.low || 0.001),
                    medium: parseFloat(result.json.medium || 0.002),
                    high: parseFloat(result.json.high || 0.003),
                    baseFee: parseFloat(result.json.base_fee || 0.001)
                };
            }

            // Fallback: Based on 20 tx analysis from network
            // OU 1000 = 0.001 OCT (Slow)
            // OU 2000 = 0.002 OCT (Normal)
            // OU 3000 = 0.003 OCT (Fast)
            return {
                low: 0.001,
                medium: 0.002,
                high: 0.003,
                baseFee: 0.001
            };
        } catch {
            // Default fallback fees - from network analysis
            return {
                low: 0.001,
                medium: 0.002,
                high: 0.003,
                baseFee: 0.001
            };
        }
    }

    /**
     * Get network info
     */
    async getNetworkInfo() {
        try {
            const result = await this.get('/info');
            if (result.status === 200 && result.json) {
                return result.json;
            }
            return null;
        } catch {
            return null;
        }
    }
}

// Singleton instance
let rpcClientInstance = null;

export function getRpcClient() {
    if (!rpcClientInstance) {
        rpcClientInstance = new RPCClient();
    }
    return rpcClientInstance;
}

export function setRpcUrl(url) {
    const client = getRpcClient();
    client.setRpcUrl(url);
}

export default RPCClient;
