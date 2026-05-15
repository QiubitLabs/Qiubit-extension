import { Wallet, Token } from '../../types';
import { balanceCache } from '../../utils/balanceCache';
import { getRpcClient } from '../network/RpcService';
import { ocs01Manager } from '../features/OCS01TokenService';
// import { privacyService } from '../features/PrivacyService';

/**
 * WalletService - Manages wallet data fetching and synchronization.
 * 
 * Responsibilities:
 * - Fetching balances (RPC + Cache)
 * - Fetching tokens (OCS01)
 * - Fetching privacy data
 * - Managed deduplication of requests
 * - Error handling for "Sender not found" (New wallets)
 */
class WalletServiceImpl {
    private static _instance: WalletServiceImpl | null = null;

    constructor() {
        if (WalletServiceImpl._instance) {
            return WalletServiceImpl._instance;
        }
        WalletServiceImpl._instance = this;
    }

    /**
     * Refresh balances for multiple wallets
     * Uses balanceCache for deduplication and caching.
     */
    async refreshBalances(wallets: Wallet[]): Promise<Wallet[]> {
        if (wallets.length === 0) return wallets;
        const rpcClient = getRpcClient();

        try {
            const updatedWallets = await Promise.all(wallets.map(async (w) => {
                try {
                    // Use balanceCache's fetchWithDedup to prevent race conditions
                    // and utilize the 3-layer caching strategy
                    const data = await balanceCache.fetchWithDedup(
                        w.address,
                        async (addr: string) => await rpcClient.getBalance(addr)
                    );

                    return {
                        ...w,
                        lastKnownBalance: data.balance
                    };
                } catch (err: any) {
                    // Handle "New Account" case
                    if (err.message && err.message.includes('Sender not found')) {
                        // Update cache with 0 balance for consistency
                        await balanceCache.set(w.address, {
                            balance: 0,
                            nonce: 0,
                            lastKnownBalance: 0
                        });
                        return { ...w, lastKnownBalance: 0 };
                    }
                    console.warn(`[WalletService] Failed to fetch balance for ${w.address}:`, err);
                    return w;
                }
            }));

            return updatedWallets;
        } catch (error) {
            console.error('[WalletService] Global refresh failed:', error);
            return wallets; // Return original on total failure
        }
    }

    /**
     * Get balance for a single address
     * Prefer this over direct RPC usage in components.
     */
    async getBalance(address: string, forceRefresh = false): Promise<any> {
        const rpcClient = getRpcClient();

        // If force refresh, clear cache first
        if (forceRefresh) {
            balanceCache.clear(address);
        }

        try {
            const data = await balanceCache.fetchWithDedup(
                address,
                async (addr: string) => await rpcClient.getBalance(addr)
            );
            return data;
        } catch (err: any) {
            if (err.message && err.message.includes('Sender not found')) {
                return { balance: 0, nonce: 0 };
            }
            throw err;
        }
    }

    /**
     * Get tokens (OCS01) for an address
     */
    async getTokens(address: string): Promise<Token[]> {
        try {
            // @ts-ignore - ocs01Manager might have typing issues with older strict settings
            const results = await ocs01Manager.getUserTokenBalances(address);

            return results.map((r: any) => ({
                symbol: r.contractName ? r.contractName.substring(0, 4).toUpperCase() : 'UNK',
                name: r.contractName || 'Unknown Token',
                balance: r.balance,
                contractAddress: r.contractAddress,
                isNative: false,
                decimals: 18,
                verified: r.verified
            }));
        } catch (error) {
            console.warn(`[WalletService] Failed to fetch tokens for ${address}:`, error);
            return [];
        }
    }

    /**
     * Get privacy balance
     */
    async getPrivacyBalance(address: string, _forceRefresh = false) {
        try {
            // TEMPORARILY DISABLED: Privacy features require migration to HFHE/PVAC architecture
            // Returning null prevents "404 Not Found" loops on legacy endpoints
            return null; 
            
            // return await privacyService.getEncryptedBalance(address, forceRefresh);
        } catch (error) {
            console.warn(`[WalletService] Failed to fetch privacy for ${address}:`, error);
            return null;
        }
    }

    /**
     * Refresh ALL state for a specific wallet (Native, Tokens, Privacy)
     * This acts as the Single Source of Truth aggregator.
     */
    async refreshAllState(address: string, isUnlocked: boolean) {
        // Parallel execution for performance
        const [balanceData, tokens, privacyData] = await Promise.all([
            this.getBalance(address).catch(() => ({ balance: 0, nonce: 0 })),
            this.getTokens(address).catch(() => []),
            isUnlocked ? this.getPrivacyBalance(address).catch(() => null) : Promise.resolve(null)
        ]);

        return {
            balance: balanceData.balance,
            nonce: balanceData.nonce,
            tokens,
            privacy: privacyData
        };
    }
}

export const WalletService = new WalletServiceImpl();
