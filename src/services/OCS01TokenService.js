/**
 * OCS01 Token Service
 * 
 * Implementation for Octra's OCS01 Token Standard
 * Based on official ocs01-test implementation
 * 
 * OCS01 is Octra's token standard similar to ERC-20
 * Supports view methods (no signing) and call methods (requires signing)
 */

import { getRpcClient } from '../utils/rpc';
import { keyringService } from './KeyringService';

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
    constructor(contractAddress, network = 'testnet') {
        this.contractAddress = contractAddress;
        this.network = network;
        this.rpcClient = getRpcClient();
    }

    /**
     * Call a view method on the contract (no signing required)
     * Uses /contract/call-view endpoint
     */
    async callView(method, params = [], callerAddress) {
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
        } catch (error) {
            console.error(`OCS01 callView error (${method}):`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Call a contract method that modifies state (requires signing)
     * Uses /call-contract endpoint
     */
    async callMethod(method, params, callerAddress) {
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
        } catch (error) {
            console.error(`OCS01 callMethod error (${method}):`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Wait for transaction confirmation
     */
    async waitForConfirmation(txHash, timeout = 60000) {
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
    async greetCaller(callerAddress) {
        return await this.callView('greetCaller', [], callerAddress);
    }

    /**
     * Get contract specification/info
     */
    async getSpec(callerAddress) {
        return await this.callView('getSpec', [], callerAddress);
    }

    /**
     * Get token balance for an address
     */
    async getCredits(address, callerAddress) {
        return await this.callView('getCredits', [address], callerAddress || address);
    }

    /**
     * Transfer tokens to another address
     */
    async transfer(to, amount, callerAddress) {
        // Amount is already in raw units from SendView
        return await this.callMethod('transfer', [to, String(amount)], callerAddress);
    }
}

/**
 * OCS01 Token Manager
 * Manages OCS01 contracts and token interactions
 */
class OCS01Manager {
    constructor() {
        this.contracts = new Map(); // address -> OCS01Contract
        this.userContracts = new Map(); // userAddress -> Set of contractAddresses
        this._password = null;
        // Legacy load (non-secure)
        this.loadCustomTokens();
    }

    /**
     * Initialize with password for secure storage
     */
    async initializeSecure(password) {
        this._password = password;
        await this.loadCustomTokensSecure();
    }

    /**
     * Get or create contract instance
     */
    getContract(contractAddress, network = 'testnet') {
        if (!this.contracts.has(contractAddress)) {
            this.contracts.set(contractAddress, new OCS01Contract(contractAddress, network));
        }
        return this.contracts.get(contractAddress);
    }

    /**
     * Load custom tokens from storage
     */
    loadCustomTokens() {
        try {
            const stored = localStorage.getItem('octra_custom_tokens');
            if (stored) {
                const parsed = JSON.parse(stored);
                Object.entries(parsed).forEach(([userAddress, contracts]) => {
                    this.userContracts.set(userAddress, new Set(contracts));
                });
            }
        } catch (e) {
            console.error('Failed to load custom tokens', e);
        }
    }

    /**
     * Load custom tokens from secure storage
     */
    async loadCustomTokensSecure() {
        if (!this._password) return;
        try {
            const { loadCustomTokensSecure } = await import('../utils/storageSecure');
            const data = await loadCustomTokensSecure(this._password);
            if (data) {
                Object.entries(data).forEach(([userAddress, contracts]) => {
                    this.userContracts.set(userAddress, new Set(contracts));
                });
            }
        } catch (error) {
            console.error('Failed to load secure custom tokens', error);
        }
    }

    /**
     * Add contract to user's list and persist
     */
    addUserContract(userAddress, contractAddress) {
        if (!this.userContracts.has(userAddress)) {
            this.userContracts.set(userAddress, new Set());
        }
        this.userContracts.get(userAddress).add(contractAddress);
        this.saveCustomTokens();
    }

    async saveCustomTokens() {
        try {
            const data = {};
            this.userContracts.forEach((contracts, userAddress) => {
                data[userAddress] = Array.from(contracts);
            });

            if (this._password) {
                const { saveCustomTokensSecure } = await import('../utils/storageSecure');
                await saveCustomTokensSecure(data, this._password);
            } else {
                // Fallback to legacy if no password (should not happen in secure mode)
                localStorage.setItem('octra_custom_tokens', JSON.stringify(data));
            }
        } catch (e) {
            console.error('Failed to save custom tokens', e);
        }
    }

    /**
     * Get known contracts for network
     */
    getKnownContracts(network = 'testnet') {
        return KNOWN_CONTRACTS[network] || [];
    }

    /**
     * Get user's token balances from all known contracts
     */
    /**
     * Get user's token balances from all known contracts (PARALLEL OPTIMIZATION)
     */
    async getUserTokenBalances(userAddress, network = 'testnet') {
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

                    const response = await Promise.race([
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
                } catch (error) {
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
