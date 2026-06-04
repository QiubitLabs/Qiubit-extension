/**
 * RPC Client for Qiubit Blockchain
 * Handles communication with the Octra network
 * 
 * EXTENSION MODE: Direct RPC connection (no CORS restrictions)
 */

import { getPrimaryRpc } from '../../config/rpcEndpoints';

// Network RPC URLs
export const RPC_URLS = {
    mainnet: import.meta.env.VITE_RPC_URL,
    testnet: import.meta.env.VITE_TESTNET_RPC_URL || '',
    ethereum: getPrimaryRpc(1),
};

export const BRIDGE_CONFIG = {
    wOCT_CONTRACT: '0x3aa5eb23188ee27787f73966205844093952f9b8', // Placeholder, update if known
    BRIDGE_CONTRACT: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', // Placeholder
};

// EXTENSION MODE: Direct connection to blockchain node
// Browser extensions bypass CORS, no proxy needed!
const DEFAULT_RPC = RPC_URLS.mainnet;

const FALLBACK_OCTRA_RPCS = [
    'https://rpc.octra.network',
    'https://node1.octra.network',
];

import { buildContractCallTransaction, signTransaction, validateTransaction } from '../../utils/transactionBuilder';

export interface RPCResponse<T = any> {
    status: number;
    text: string;
    json: T | null;
    ok: boolean;
    error?: string;
}

export interface FeeEstimate {
    low: number;
    medium: number;
    high: number;
    baseFee: number;
}

export interface BalanceInfo {
    balance: number;
    nonce: number;
}

export interface EncryptedBalanceInfo {
    public: number;
    publicRaw: number;
    encrypted: number;
    encryptedRaw: number;
    total: number;
}

export interface TransactionResult {
    success: boolean;
    txHash?: string;
    poolInfo?: any;
    finality?: string;
    hashes?: string[]; // For batch
}

// Per-host 429 circuit breaker — Octra rate-limit must not block Ethereum etc.
const rateLimitByHost = new Map<string, number>();

function hostKey(url: string): string {
    try { return new URL(url).host; } catch { return url; }
}

function parseSafeNumber(val: any): number {
    if (val === undefined || val === null) return 0;
    const str = String(val).trim();
    if (!str || str.toLowerCase() === 'nan') return 0;
    
    // Handle hex encoded values
    if (str.startsWith('0x') || str.startsWith('0X')) {
        const parsedHex = parseInt(str, 16);
        return isNaN(parsedHex) ? 0 : parsedHex;
    }
    
    const parsedFloat = parseFloat(str);
    return isNaN(parsedFloat) ? 0 : parsedFloat;
}

class RPCClient {
    private rpcUrl: string;
    private timeout: number;
    private inFlightRequests: Map<string, Promise<RPCResponse>> = new Map();

    constructor(rpcUrl: string = DEFAULT_RPC) {
        // Detect if running as extension popup/background OR content script
        const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id;
        const isDev = import.meta.env.DEV;

        console.log(`[RPCClient] Init: isExtension=${isExtension}, isDev=${isDev}, passedUrl=${rpcUrl}`);

        // DEV MODE: Use Vite proxy (/api) if not an extension
        if (!isExtension && isDev) {
            console.log('[RPCClient] Dev mode (browser) - using /api proxy');
            this.rpcUrl = '/api';
        } else {
            this.rpcUrl = rpcUrl || DEFAULT_RPC;
        }

        console.log(`[RPCClient] Actual RPC URL: ${this.rpcUrl}`);
        this.timeout = isExtension ? 15000 : 8000; // Faster timeout for website/dev mode (slightly increased from 5s)
    }

    setRpcUrl(url: string) {
        // Direct connection - no proxy logic needed for extension
        this.rpcUrl = url || DEFAULT_RPC;
    }

    getActualRpcUrl() {
        return this.rpcUrl;
    }

    async request<T = any>(
        method: string,
        path: string,
        data: any = null,
        headers: Record<string, string> = {},
        retries: number = 2,
        timeoutMs: number | null = null
    ): Promise<RPCResponse<T>> {
        // Per-host circuit breaker: block only the rate-limited host (e.g. Octra), not Ethereum
        const host = hostKey(this.rpcUrl);
        const blockedUntil = rateLimitByHost.get(host) ?? 0;
        if (blockedUntil > Date.now()) {
            const wait = blockedUntil - Date.now();
            console.warn(`[RPC ${host}] Rate-limited — waiting ${Math.ceil(wait / 1000)}s before next request`);
            return { status: 429, text: 'rate-limited', json: null, ok: false, error: 'Rate limited — backing off' };
        }

        const controller = new AbortController();

        // Logic: specific timeout -> default timeout. 
        // If timeoutMs is strictly 0, we Disable timeout (infinite wait).
        const effectiveTimeout = timeoutMs !== null ? timeoutMs : this.timeout;
        let timeoutId: any;

        if (effectiveTimeout > 0) {
            timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
        }

        try {
            const options: RequestInit = {
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
            let json: T | null = null;

            try {
                json = text.trim() ? JSON.parse(text) : null;
            } catch (e) {
                console.warn(`[RPC] Invalid JSON from ${path}:`, text.substring(0, 200));
                json = null;
            }

            // 429: activate per-host circuit breaker, do not retry
            if (response.status === 429) {
                rateLimitByHost.set(host, Date.now() + 90_000); // 90s cooldown for this host only
                console.warn(`[RPC ${host}] 429 Too Many Requests — circuit breaker activated for 90s`);
                return { status: 429, text, json: null, ok: false, error: 'Rate limited' };
            }

            // Retry on 503, 502, 504 (server errors)
            if (!response.ok && [502, 503, 504].includes(response.status) && retries > 0) {
                // EXPONENTIAL BACKOFF + JITTER
                const baseDelay = 2000;
                const jitter = Math.floor(Math.random() * 1000);
                const delay = baseDelay + jitter;

                console.warn(`[RPC] Server error ${response.status}, retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.request<T>(method, path, data, headers, retries - 1, timeoutMs);
            }

            if (!response.ok) {
                 return {
                    status: response.status,
                    text,
                    json,
                    ok: false,
                    error: `HTTP ${response.status}`
                };
            }

            // JSON-RPC 2.0 Handling
            const isJsonRpc = (json as any)?.jsonrpc === '2.0';
            if (isJsonRpc) {
                if ((json as any).error) {
                    const err = (json as any).error;
                    return {
                        status: response.status,
                        text,
                        json: null,
                        ok: false,
                        error: `RPC Error ${err.code}: ${err.message}`
                    };
                }
                // Success result
                return {
                    status: response.status,
                    text,
                    json: (json as any).result, // Unwrap result
                    ok: true
                };
            }

            // Legacy Fallback (or if endpoint returns raw JSON)
            return {
                status: response.status,
                text,
                json,
                ok: response.ok,
                error: undefined
            };
        } catch (error: any) {
            if (timeoutId) clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                return { status: 0, text: 'timeout', json: null, ok: false, error: 'Request timeout (Check if RPC is UP or CORS blocked)' };
            }

            // Detect CORS / network error — try fallback URLs before giving up
            const isCorsOrNetworkError = error.message === 'Failed to fetch' || error.name === 'TypeError';

            if (isCorsOrNetworkError && retries === 0) {
                // All retries exhausted — try each fallback URL once
                for (const fallbackUrl of FALLBACK_OCTRA_RPCS) {
                    if (fallbackUrl === this.rpcUrl) continue;
                    try {
                        const fallbackOptions: RequestInit = {
                            method,
                            headers: { 'Content-Type': 'application/json', ...headers },
                        };
                        if (data && method === 'POST') {
                            fallbackOptions.body = JSON.stringify(data);
                        }
                        const fallbackResp = await fetch(`${fallbackUrl}${path}`, fallbackOptions);
                        if (fallbackResp.ok) {
                            const fallbackText = await fallbackResp.text();
                            let fallbackJson: T | null = null;
                            try { fallbackJson = fallbackText.trim() ? JSON.parse(fallbackText) : null; } catch { /* ignore */ }
                            console.info(`[RPC] Fallback to ${fallbackUrl} succeeded`);
                            return { status: fallbackResp.status, text: fallbackText, json: fallbackJson, ok: true };
                        }
                    } catch { /* try next fallback */ }
                }
                const targetUrl = `${this.rpcUrl}${path}`;
                return {
                    status: 0,
                    text: 'cors',
                    json: null,
                    ok: false,
                    error: `Network/CORS error (all fallbacks failed): ${targetUrl}`
                };
            }

            if (error.message === 'Failed to fetch') {
                const targetUrl = `${this.rpcUrl}${path}`;
                return {
                    status: 0,
                    text: 'cors',
                    json: null,
                    ok: false,
                    error: `Network/CORS error: ${targetUrl}`
                };
            }

            // Retry on network errors
            if (retries > 0) {
                const delay = (3 - retries) * 1000;
                console.warn(`[RPC] Network error, retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.request<T>(method, path, data, headers, retries - 1, timeoutMs);
            }

            console.error(`[RPC] Connection error to ${path}:`, error);
            return { status: 0, text: error.message, json: null, ok: false, error: error.message };
        }
    }

    /**
     * Standard JSON-RPC 2.0 Call with in-flight deduplication
     */
    async jsonRpcCall<T = any>(method: string, params: any[] = [], timeoutMs: number | null = null): Promise<RPCResponse<T>> {
        const cacheKey = `${method}:${JSON.stringify(params)}`;

        // Check if there is an identical request already in flight
        if (this.inFlightRequests.has(cacheKey)) {
            return this.inFlightRequests.get(cacheKey) as Promise<RPCResponse<T>>;
        }

        const payload = {
            jsonrpc: '2.0',
            method,
            params,
            id: Date.now()
        };

        const requestPromise = this.request<T>('POST', '', payload, {}, 2, timeoutMs)
            .finally(() => {
                // Remove from in-flight cache once completed
                this.inFlightRequests.delete(cacheKey);
            });

        this.inFlightRequests.set(cacheKey, requestPromise);
        return requestPromise;
    }

    /**
     * Batch JSON-RPC Call
     * Sends multiple requests in a single HTTP payload
     */
    async jsonRpcBatchCall(calls: { method: string, params: any[] }[]): Promise<RPCResponse<any[]>> {
        if (calls.length === 0) return { status: 200, text: '[]', json: [], ok: true };

        const payload = calls.map((call, index) => ({
            jsonrpc: '2.0',
            method: call.method,
            params: call.params,
            id: Date.now() + index
        }));

        return this.request<any[]>('POST', '', payload, {}, 2, null);
    }

    // Deprecated helpers removed. Use jsonRpcCall instead.
    // async get<T = any>(path: string, headers: Record<string, string> = {}) { ... }
    // async post<T = any>(path: string, data: any, headers: Record<string, string> = {}, timeoutMs: number | null = null) { ... }

    /**
     * Get balance and nonce for an address
     * Single JSON-RPC call: octra_balance returns BOTH balance and nonce in one response.
     */
    async getBalance(address: string): Promise<BalanceInfo> {
        try {
            const res = await this.jsonRpcCall<any>('octra_balance', [address]);

            const data = res.ok && res.json ? res.json : null;
            const rawBalance = data?.balance ?? '0';
            const balance = parseSafeNumber(rawBalance);
            // octra_balance returns nonce in same response — no separate octra_nonce call needed
            const rawNonce = data?.pending_nonce ?? data?.nonce ?? 0;
            const nonce = parseSafeNumber(rawNonce);

            return { balance, nonce };
        } catch (e) {
            console.warn('[RpcService] Failed to fetch balance:', e);
            return { balance: 0, nonce: 0 };
        }
    }

    /**
     * Get address info including transaction history
     * JSON-RPC: octra_transactionsByAddress
     */
    async getAddressInfo(address: string, limit: number = 20, before: string | null = null): Promise<any> {
        const result = await this.jsonRpcCall<any>('octra_transactionsByAddress', [address, limit, before ? parseInt(before) : 0]);

        if (result.ok && result.json) {
             // Adapt new JSON-RPC format to legacy format expected by UI
             // Assuming result.json is { transactions: [...] } or just [...]
             const txs = Array.isArray(result.json) ? result.json : (result.json.transactions || []);
             
             return {
                address,
                balance: '0', // Not returned by this call anymore, handled by getBalance
                nonce: 0,
                recent_transactions: txs
            };
        }

        return {
            address,
            balance: '0',
            nonce: 0,
            recent_transactions: []
        };
    }

    /**
     * Get transaction details by hash
     * Migrated to JSON-RPC: octra_transaction
     */
    async getTransaction(txHash: string) {
        // Try JSON-RPC first (Confirmed Method)
        try {
            const result = await this.jsonRpcCall<any>('octra_transaction', [txHash]);
            if (result.ok && result.json) {
                // If it returns an array, take the first element (common pattern)
                const tx = Array.isArray(result.json) ? result.json[0] : result.json;
                if (tx) return tx;
            }
        } catch (e) {
            console.warn('[RpcService] JSON-RPC octra_transaction failed:', e);
        }

        throw new Error('Transaction not found (JSON-RPC)');
    }

    /**
     * Get staged transactions (pending in mempool)
     * Migrated to JSON-RPC: pool_view
     */
    async getStagedTransactions() {
        // Try JSON-RPC first (Confirmed Method)
        try {
            const result = await this.jsonRpcCall<any>('pool_view', []);
            if (result.ok && result.json) {
                // Returns array of pending transactions
                return Array.isArray(result.json) ? result.json : [];
            }
        } catch (e) {
            console.warn('[RpcService] JSON-RPC pool_view failed:', e);
        }

        return [];
    }

    /**
     * Send a transaction
     */
    async sendTransaction(tx: any): Promise<TransactionResult> {
        // No timeout (0) - Wait indefinitely for server response as per user request
        // JSON-RPC: octra_submit
        const result = await this.jsonRpcCall<any>('octra_submit', [tx], 0);

        if (result.status === 200) {
            if (result.json && result.json.status === 'accepted') return {
                success: true,
                txHash: result.json.tx_hash,
                poolInfo: result.json.pool_info,
                finality: 'pending' // JSON-RPC usually just accepts it
            };
        } else if (result.text && result.text.toLowerCase().startsWith('ok')) {
            const parts = result.text.split(/\s+/);
            return {
                success: true,
                txHash: parts[parts.length - 1]
            };
        }

        const error = result.json?.error || result.text || 'Transaction failed';
        throw new Error(error);
    }

    /**
     * Send multiple transactions in a batch
     */
    async sendBatchTransaction(txs: any[]): Promise<TransactionResult> {
        const result = await this.jsonRpcCall<any>('octra_submitBatch', [txs], 0);

        if (result.status === 200) {
            if (result.json && result.json.status === 'accepted') return {
                success: true,
                hashes: result.json.hashes,
                finality: result.json.finality || 'unknown'
            };
        }

        const error = result.json?.error || result.text || 'Batch transaction failed';
        throw new Error(error);
    }



    /**
     * Check if RPC is reachable
     */
    async checkConnection(): Promise<boolean> {
        try {
            // JSON-RPC: node_version or node_status
            const result = await this.jsonRpcCall('node_version', [], 5000);
            return result.ok;
        } catch {
            // Fallback removed
             return false;
        }
    }

    /**
     * Get fee estimate from network
     * Returns low, medium, high fee options
     */
    /**
     * Get mempool stats (JSON-RPC)
     */
    async getPoolStats() {
        try {
            const result = await this.jsonRpcCall<any>('pool_stats');
            if (result.status === 200 && result.json) {
                return result.json;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get fee estimate from network
     * Returns low, medium, high fee options
     */
    async getFeeEstimate(_amount: number = 1): Promise<FeeEstimate> {
        try {
            const poolStats = await this.getPoolStats();
            let multiplier = 1;
            if (poolStats && poolStats.total_transactions > 100) {
                multiplier = 2;
            } else if (poolStats && poolStats.total_transactions > 20) {
                multiplier = 1.5;
            }
            
            const baseFee = 0.01 * multiplier;
            return {
                low: baseFee * 0.75,
                medium: baseFee,
                high: baseFee * 1.5,
                baseFee: baseFee
            };
        } catch {
            return {
                low: 0.0075,
                medium: 0.01,
                high: 0.015,
                baseFee: 0.01
            };
        }
    }

    /**
     * Get network info
     */
    async getNetworkInfo() {
        try {
            // JSON-RPC: node_status
            const result = await this.jsonRpcCall('node_status');
            if (result.status === 200 && result.json) {
                return result.json;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get balance with nonce/balance_raw matching CLI get_nonce_balance()
     * JSON-RPC: octra_balance
     */
    async getBalanceRaw(address: string): Promise<{ nonce: number; balanceRaw: string; pendingNonce: number }> {
        try {
            const result = await this.jsonRpcCall<any>('octra_balance', [address]);
            if (result.ok && result.json) {
                const data = result.json;
                const nonce = parseSafeNumber(data.pending_nonce ?? data.nonce ?? 0);
                const pendingNonce = parseSafeNumber(data.pending_nonce ?? data.nonce ?? 0);
                let balanceRaw = '0';
                if (data.balance_raw !== undefined) {
                    balanceRaw = String(data.balance_raw);
                } else if (data.balance !== undefined) {
                    // Convert from display format to raw micro-units
                    const bal = parseSafeNumber(data.balance);
                    balanceRaw = String(Math.floor(bal * 1_000_000));
                }
                return { nonce, balanceRaw, pendingNonce };
            }
            return { nonce: 0, balanceRaw: '0', pendingNonce: 0 };
        } catch {
            return { nonce: 0, balanceRaw: '0', pendingNonce: 0 };
        }
    }

    /**
     * Get account info with transaction history
     * Matches CLI: octra_account
     */
    async getAccount(address: string, limit: number = 20): Promise<any> {
        const result = await this.jsonRpcCall<any>('octra_account', [address, limit]);
        return result.ok ? result.json : null;
    }

    /**
     * Get view pubkey for an address
     * Matches CLI: octra_viewPubkey
     */
    async getViewPubkey(address: string): Promise<string | null> {
        try {
            const result = await this.jsonRpcCall<any>('octra_viewPubkey', [address]);
            if (result.ok && result.json && result.json.view_pubkey) {
                return result.json.view_pubkey;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get public key for an address
     * Matches CLI: octra_publicKey
     */
    async getPublicKey(address: string): Promise<string | null> {
        try {
            const result = await this.jsonRpcCall<any>('octra_publicKey', [address]);
            if (result.ok && result.json && result.json.public_key) {
                return result.json.public_key;
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get encrypted balance
     * Matches CLI: octra_encryptedBalance
     */
    async getEncryptedBalance(address: string, sigB64: string, pubB64: string): Promise<any> {
        try {
            const result = await this.jsonRpcCall<any>('octra_encryptedBalance', [address, sigB64, pubB64]);
            return result.ok ? result.json : null;
        } catch {
            return null;
        }
    }

    /**
     * Get encrypted cipher
     * Matches CLI: octra_encryptedCipher
     */
    async getEncryptedCipher(address: string): Promise<any> {
        try {
            const result = await this.jsonRpcCall<any>('octra_encryptedCipher', [address]);
            return result.ok ? result.json : null;
        } catch {
            return null;
        }
    }

    /**
     * Register PVAC pubkey
     * Matches CLI: octra_registerPvacPubkey
     */
    async registerPvacPubkey(address: string, pkB64: string, sigB64: string, pubB64: string, aesKatHex: string = ''): Promise<any> {
        const result = await this.jsonRpcCall<any>('octra_registerPvacPubkey', [address, pkB64, sigB64, pubB64, aesKatHex]);
        return result.ok ? result.json : null;
    }

    /**
     * Get PVAC pubkey
     * Matches CLI: octra_pvacPubkey
     */
    async getPvacPubkey(address: string): Promise<any> {
        try {
            const result = await this.jsonRpcCall<any>('octra_pvacPubkey', [address]);
            return result.ok ? result.json : null;
        } catch {
            return null;
        }
    }

    /**
     * Register public key on-chain
     * Matches CLI: octra_registerPublicKey
     */
    async registerPublicKey(address: string, pubB64: string, sigB64: string): Promise<any> {
        const result = await this.jsonRpcCall<any>('octra_registerPublicKey', [address, pubB64, sigB64]);
        return result.ok ? result.json : null;
    }

    /**
     * Get stealth outputs
     * Matches CLI: octra_stealthOutputs
     */
    async getStealthOutputs(fromEpoch: number = 0): Promise<any[]> {
        try {
            const result = await this.jsonRpcCall<any>('octra_stealthOutputs', [fromEpoch]);
            if (result.ok && result.json) {
                return Array.isArray(result.json) ? result.json : [];
            }
            return [];
        } catch {
            return [];
        }
    }

    /**
     * Get staging/pending view
     * Matches CLI: staging_view
     */
    async stagingView(): Promise<any> {
        try {
            const result = await this.jsonRpcCall<any>('staging_view', [], 5000);
            return result.ok ? result.json : null;
        } catch {
            return null;
        }
    }

    /**
     * Get nonce with pending nonce awareness (matches CLI get_nonce_balance pattern)
     * Checks both confirmed nonce and staging/pending transactions
     */
    async getNonceForSend(address: string): Promise<number> {
        try {
            const balInfo = await this.getBalanceRaw(address);
            let nonce = balInfo.pendingNonce || balInfo.nonce;

            // Also check staging to find highest nonce from pending txs (like CLI does)
            try {
                const staging = await this.stagingView();
                if (staging && staging.transactions) {
                    for (const tx of staging.transactions) {
                        if (tx.from === address) {
                            const pn = tx.nonce || 0;
                            if (pn > nonce) nonce = pn;
                        }
                    }
                }
            } catch {
                // Staging check is optional
            }

            return nonce;
        } catch {
            return 0;
        }
    }

    /**
     * Get network metrics (REST)
     * Direct call to https://octra.network/metrics
     */
    async getNetworkMetrics() {
        try {
            // Determine base URL - Force 'https://octra.network' if using mainnet RPC
            // This prevents using 'https://octra.network/rpc/metrics' which is 404
            let baseUrl = 'https://octra.network';

            if (this.rpcUrl.includes('testnet') || this.rpcUrl.includes('localhost') || this.rpcUrl.includes('127.0.0.1')) {
                  baseUrl = this.rpcUrl.replace(/\/rpc\/?$/, '');
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${baseUrl}/metrics`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                return await response.json();
            }
            return null;
        } catch (e) {
            console.warn('[RpcService] Failed to fetch metrics:', e);
            return null;
        }
    }

    /**
     * Call contract method (state-modifying)
     * Based on webcli implementation with proper signing
     */
    async callContractMethod(contractAddress: string, method: string, params: any[], callerAddress: string, amount: string = '0'): Promise<any> {
        try {
            // Build and sign transaction using proper utilities
            const tx = await buildContractCallTransaction(contractAddress, method, params, callerAddress, amount);
            const signedTx = await signTransaction(tx, callerAddress);

            // Validate before submitting
            const validation = validateTransaction(signedTx);
            if (!validation.valid) {
                throw new Error(validation.error);
            }

            // Submit transaction
            const result = await this.sendTransaction(signedTx);
            return result;
        } catch (err) {
            console.error('[RpcService] Contract call failed:', err);
            throw err;
        }
    }

    /**
     * Call contract view method (read-only)
     * Based on webcli implementation
     */
    async callContractView(contractAddress: string, method: string, params: any[], callerAddress: string): Promise<any> {
        try {
            const result = await this.jsonRpcCall<any>('contract_call', [contractAddress, method, params, callerAddress], 15000);
            return result.ok ? result.json : null;
        } catch (err) {
            console.error('[RpcService] Contract view failed:', err);
            return null;
        }
    }

    // Bridge specific methods (proxied via /api/bridge/signer in webcli)
    async getBridgeStatus() {
        return this.request('POST', '/api/bridge/signer', { method: 'bridgeStatus' });
    }

    async getBridgeHeader(epoch: number) {
        return this.request('POST', '/api/bridge/signer', { method: 'bridgeHeader', params: [epoch] });
    }

    async getBridgeMessagesByEpoch(epoch: number) {
        return this.request('POST', '/api/bridge/signer', { method: 'bridgeMessagesByEpoch', params: [epoch] });
    }

    async getBridgeProofByLeafIndex(leafIndex: number) {
        return this.request('POST', '/api/bridge/signer', { method: 'bridgeProofByLeafIndex', params: [leafIndex] });
    }

    async getBridgeClaimCalldata(msgHash: string) {
        return this.request('POST', '/api/bridge/signer', { method: 'bridgeClaimCalldata', params: [msgHash] });
    }
}

// Singleton instance
let rpcClientInstance: RPCClient | null = null;

export function getRpcClient(): RPCClient {
    if (!rpcClientInstance) {
        rpcClientInstance = new RPCClient();
    }
    return rpcClientInstance;
}

export function setRpcUrl(url: string) {
    const client = getRpcClient();
    client.setRpcUrl(url);
}

export default RPCClient;
