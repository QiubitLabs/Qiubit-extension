/**
 * OCS01 Token Service
 * 
 * Implementation for Qiubit's OCS01 Token Standard
 * Based on official ocs01-test implementation
 * 
 * OCS01 is Qiubit's token standard similar to ERC-20
 * Supports view methods (no signing) and call methods (requires signing)
 */

import { getRpcClient } from '../network/RpcService';
import { loadCustomTokensSecure, saveCustomTokensSecure } from '../../utils/storage';

// Well-known OCS01 contracts on Octra Network
export const KNOWN_CONTRACTS = {
    testnet: [
        {
            address: 'octBUHw585BrAMPMLQvGuWx4vqEsybYH9N7a3WNj1WBwrDn',
            name: 'OCS01 Test Contract',
            description: 'Official OCS01 test contract with token claiming',
            verified: true,
            methods: {
                view: ['greetCaller', 'getSpec', 'getCredits', 'dotProduct', 'vectorMagnitude', 'power', 'factorial', 'fibonacci', 'gcd', 'isPrime'],
                call: []
            }
        }
    ],
    mainnet: []
};

/**
 * OCS01 Contract Interface
 */
class OCS01Contract {
    public contractAddress: string;
    public network: string;
    private rpcClient: any; // Using any for RPCClient to avoid complex import circularity if any, or just to keep it simple

    constructor(contractAddress: string, network: string = 'testnet') {
        this.contractAddress = contractAddress;
        this.network = network;
        this.rpcClient = getRpcClient();
    }

    /**
     * Call a view method on the contract (no signing required)
     * Uses /contract/call-view endpoint
     */
    async callView(_method: string, _params: any[] = [], _callerAddress?: string) {
        // TODO: Implement contract view calls via JSON-RPC when available
        return {
            success: false,
            error: 'Contract view calls not yet implemented - waiting for JSON-RPC specification'
        };

        /*
        try {
            const result = await this.rpcClient.post('/contract/call-view', {
                contract: this.contractAddress,
                method: method,
                params: params,
                caller: callerAddress
            });

            if (result.ok && result.json && result.json.status === 'success') {
                return {
                    success: true,
                    result: result.json.result
                };
            }

            return {
                success: false,
                error: result.error || (result.json && result.json.error) || 'Call failed'
            };
        } catch (error: any) {
             console.error(`OCS01 callView error (${method}):`, error);
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
        */
    }

    /**
     * Call a contract method that modifies state (requires signing)
     * Uses /call-contract endpoint
     */
    async callMethod(_method: string, _params: any[], _callerAddress: string) {
        // TODO: Implement contract method calls via JSON-RPC when available
        return {
            success: false,
            error: 'Contract method calls not yet implemented - waiting for JSON-RPC specification'
        };

        /*
        try {
            // Get nonce
            const balanceData = await this.rpcClient.getBalance(callerAddress);
            const nonce = balanceData.nonce + 1;
            const timestamp = Date.now() / 1000;

            // Sign the contract call
            const signedData = await keyringService.signContractCall(callerAddress, {
                contract: this.contractAddress,
                method: method,
                params: params,
                nonce: nonce,
                timestamp: timestamp
            });

            // Submit to network
            const result = await this.rpcClient.post('/call-contract', {
                contract: this.contractAddress,
                method: method,
                params: params,
                caller: callerAddress,
                nonce: nonce,
                timestamp: timestamp,
                signature: signedData.signature,
                public_key: signedData.publicKey
            });

            if (result.ok && result.json && result.json.tx_hash) {
                return {
                    success: true,
                    txHash: result.json.tx_hash
                };
            }

            return {
                success: false,
                error: result.error || 'Contract call failed'
            };
        } catch (error: any) {
            console.error(`OCS01 callMethod error (${method}):`, error);
            return {
                success: false,
                error: error.message || 'Unknown error'
            };
        }
        */
    }

    /**
     * Wait for transaction confirmation
     */
    async waitForConfirmation(txHash: string, timeout: number = 60000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const tx = await this.rpcClient.getTransaction(txHash);
                if (tx.status === 'confirmed') {
                    return { confirmed: true, tx };
                }
            } catch (error) {
                // Transaction not found yet, keep waiting
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        return { confirmed: false };
    }

    // ===== Common OCS01 Methods =====

    /**
     * Get greeting message
     */
    async greetCaller(callerAddress: string) {
        return await this.callView('greetCaller', [], callerAddress);
    }

    /**
     * Get contract specification/info
     */
    async getSpec(callerAddress: string) {
        return await this.callView('getSpec', [], callerAddress);
    }

    /**
     * Get token balance for an address
     */
    async getCredits(address: string, callerAddress?: string) {
        return await this.callView('getCredits', [address], callerAddress || address);
    }

    /**
     * Transfer tokens to another address
     */
    async transfer(to: string, amount: string | number, callerAddress: string) {
        // Amount is already in raw units from SendView
        return await this.callMethod('transfer', [to, String(amount)], callerAddress);
    }
}

/**
 * OCS01 Token Manager
 * Manages OCS01 contracts and token interactions
 */
class OCS01Manager {
    private contracts: Map<string, OCS01Contract>;
    private userContracts: Map<string, Set<string>>;
    private _password: string | null;

    constructor() {
        this.contracts = new Map(); // address -> OCS01Contract
        this.userContracts = new Map(); // userAddress -> Set of contractAddresses
        this._password = null;
        // Do NOT load legacy tokens in constructor. Must wait for password.
    }

    /**
     * Initialize with password for secure storage
     */
    async initializeSecure(password: string) {
        this._password = password;

        // 1. Load Secure Tokens First
        await this.loadCustomTokensSecure();

        // 2. Check & Migrate Legacy Tokens (if any, and if secure is empty/partial)
        // Migration ensures we don't lose user data from previous version
        await this.migrateLegacyTokens();
    }

    /**
     * Get or create contract instance
     */
    getContract(contractAddress: string, network: string = 'testnet'): OCS01Contract {
        if (!this.contracts.has(contractAddress)) {
            this.contracts.set(contractAddress, new OCS01Contract(contractAddress, network));
        }
        return this.contracts.get(contractAddress)!;
    }

    /**
     * Load custom tokens from secure storage
     */
    async loadCustomTokensSecure() {
        if (!this._password) return;
        try {
            const data = await loadCustomTokensSecure(this._password);
            if (data) {
                Object.entries(data).forEach(([userAddress, contracts]: [string, any]) => {
                    const existing = this.userContracts.get(userAddress) || new Set();
                    // Merge
                    const set = new Set([...existing, ...(contracts || [])]);
                    this.userContracts.set(userAddress, set);
                });
            }
        } catch (error) {
            console.error('Failed to load secure custom tokens', error);
        }
    }

    /**
     * Migrate legacy tokens from localStorage to Secure Storage
     */
    async migrateLegacyTokens() {
        if (!this._password) return;

        try {
            const legacyKey = 'qiubit_custom_tokens';
            const stored = localStorage.getItem(legacyKey);

            if (stored) {
                console.log('[OCS01] Migrating legacy custom tokens...');
                const parsed = JSON.parse(stored);
                let changed = false;

                Object.entries(parsed).forEach(([userAddress, contracts]: [string, any]) => {
                    if (Array.isArray(contracts)) {
                        const existing = this.userContracts.get(userAddress) || new Set();
                        contracts.forEach((c: string) => {
                            if (!existing.has(c)) {
                                existing.add(c);
                                changed = true;
                            }
                        });
                        this.userContracts.set(userAddress, existing);
                    }
                });

                if (changed) {
                    await this.saveCustomTokens();
                    console.log('[OCS01] Migration complete. Secure storage updated.');
                }

                // Clean up legacy key
                localStorage.removeItem(legacyKey);
            }
        } catch (e) {
            console.warn('[OCS01] Migration failed (non-critical):', e);
        }
    }

    /**
     * Add contract to user's list and persist
     */
    async addUserContract(userAddress: string, contractAddress: string) {
        if (!this._password) {
            throw new Error('Wallet locked: Cannot add custom token');
        }

        if (!this.userContracts.has(userAddress)) {
            this.userContracts.set(userAddress, new Set());
        }
        this.userContracts.get(userAddress)!.add(contractAddress);
        await this.saveCustomTokens();
    }

    async saveCustomTokens() {
        if (!this._password) return;

        try {
            const data = {};
            this.userContracts.forEach((contracts, userAddress) => {
                (data as any)[userAddress] = Array.from(contracts);
            });

            await saveCustomTokensSecure(data, this._password);
        } catch (e) {
            console.error('Failed to save custom tokens', e);
        }
    }

    /**
     * Get known contracts for network
     */
    getKnownContracts(network: string = 'testnet'): any[] {
        return (KNOWN_CONTRACTS as any)[network] || [];
    }

    /**
     * Get user's token balances from all known contracts (PARALLEL OPTIMIZATION)
     */
    async getUserTokenBalances(userAddress: string, network: string = 'testnet') {
        const contracts = this.getKnownContracts(network);
        const customContracts = this.userContracts.get(userAddress) || new Set();

        // Combine all contracts to fetch
        const allTargets = [
            ...contracts.map(c => ({ address: c.address, name: c.name, verified: c.verified, isCustom: false })),
            ...Array.from(customContracts)
                .filter(addr => !contracts.some(c => c.address === addr))
                .map(addr => ({ address: addr, name: 'Custom Contract', verified: false, isCustom: true }))
        ];

        if (allTargets.length === 0) return [];

        // OPTIMIZED PARALLEL EXECUTION: Batched requests (Concurrency: 3)
        // Solves performance issues while respecting RPC limits
        const results = [];
        const CONCURRENCY_LIMIT = 3;

        for (let i = 0; i < allTargets.length; i += CONCURRENCY_LIMIT) {
            const batch = allTargets.slice(i, i + CONCURRENCY_LIMIT);

            // Wait slightly between batches to be gentle
            if (i > 0) await new Promise(r => setTimeout(r, 200));

            const batchResults = await Promise.all(batch.map(async (target) => {
                try {
                    const contract = this.getContract(target.address, network);

                    // 10s Timeout
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout')), 10000)
                    );

                    const response: any = await Promise.race([
                        contract.getCredits(userAddress, userAddress),
                        timeoutPromise
                    ]);

                    if (response && response.success) {
                        return {
                            contractAddress: target.address,
                            contractName: target.name,
                            balance: parseFloat(response.result) || 0,
                            verified: target.verified,
                            isCustom: target.isCustom
                        };
                    }
                } catch (error: any) {
                    console.warn(`[OCS01] Failed to fetch ${target.name}:`, error.message);
                }
                return null;
            }));

            results.push(...batchResults.filter(Boolean));
        }

        return results;
    }
}

// Singleton instance
export const ocs01Manager = new OCS01Manager();

// Export classes (KNOWN_CONTRACTS already exported at declaration)
export { OCS01Contract, OCS01Manager };
