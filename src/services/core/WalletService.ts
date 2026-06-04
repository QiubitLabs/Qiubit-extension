import { Wallet, Token } from '../../types';
import { balanceCache } from '../../utils/balanceCache';
import { getRpcClient } from '../network/RpcService';
import { ocs01Manager } from '../features/OCS01TokenService';
import { ethers } from 'ethers';
import { getBalanceRpcList } from '../../utils/evmProvider';
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
     * Fetch balance for a single token using standard direct RPC calls
     * EVM: Utilizes standard eth_getBalance or eth_call (balanceOf) to avoid heavy API scans.
     */
    async getSingleTokenBalance(
        walletAddressOrObject: string | any,
        token: Token,
        rpcUrl?: string
    ): Promise<number> {
        try {
            let walletAddress: string;
            if (typeof walletAddressOrObject === 'string') {
                walletAddress = walletAddressOrObject;
            } else if (walletAddressOrObject && typeof walletAddressOrObject === 'object') {
                const cid = token.chainId;
                if (cid === 1151111081099710) {
                    walletAddress = walletAddressOrObject.solanaAddress || walletAddressOrObject.address;
                } else if (cid === 9270000000000000) {
                    walletAddress = walletAddressOrObject.suiAddress || walletAddressOrObject.address;
                } else if (cid === 20000000000001) {
                    walletAddress = walletAddressOrObject.bitcoinAddress || walletAddressOrObject.address;
                } else if (cid === 9048201) {
                    walletAddress = walletAddressOrObject.address;
                } else {
                    walletAddress = walletAddressOrObject.evmAddress || walletAddressOrObject.address;
                }
            } else {
                walletAddress = '';
            }

            // Real-time Sui balance and token balance query
            if (token.chainId === 9270000000000000 && walletAddress) {
                const { suiRpc } = await import('../network/SuiRpcService');
                const coinType = (token.contractAddress === 'sui' || !token.contractAddress) ? '0x2::sui::SUI' : token.contractAddress;
                const rawBal = await suiRpc.getBalance(walletAddress, coinType);
                if (coinType !== '0x2::sui::SUI') {
                    const dec = token.decimals ?? 9;
                    return parseFloat(rawBal) / Math.pow(10, dec);
                }
                return parseFloat(rawBal);
            }

            // Ensure address is a valid hex format for EVM chains to avoid UNCONFIGURED_NAME throws
            const isEvmChain = token.chainId !== 9048201 && 
                               token.chainId !== 1151111081099710 && 
                               token.chainId !== 9270000000000000 && 
                               token.chainId !== 20000000000001;
            
            if (!isEvmChain) {
                return typeof token.balance === 'string' ? parseFloat(token.balance) : (token.balance || 0);
            }

            if (isEvmChain && (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length !== 42)) {
                return typeof token.balance === 'string' ? parseFloat(token.balance) : (token.balance || 0);
            }

            // EVM Fallback: Try getBalanceRpcList (public first, then private nodes pool on rate-limit/failure)
            const rpcUrls = rpcUrl ? [rpcUrl] : (token.chainId ? getBalanceRpcList(token.chainId) : []);
            if (rpcUrls.length === 0) {
                const defaultRpc = getRpcClient().getActualRpcUrl();
                if (defaultRpc) rpcUrls.push(defaultRpc);
            }

            let lastErr: unknown;
            for (const url of rpcUrls) {
                try {
                    const provider = new ethers.JsonRpcProvider(url);
                    
                    // 1. Native Token
                    if (token.isNative || !token.contractAddress || token.contractAddress === '0x0000000000000000000000000000000000000000') {
                        const balanceWei = await provider.getBalance(walletAddress);
                        return parseFloat(ethers.formatUnits(balanceWei, token.decimals ?? 18));
                    }

                    // 2. ERC-20 Token (Standard contract call)
                    const minAbi = ["function balanceOf(address) view returns (uint256)"];
                    const contract = new ethers.Contract(token.contractAddress, minAbi, provider);
                    const balanceRaw = await contract.balanceOf(walletAddress);
                    return parseFloat(ethers.formatUnits(balanceRaw, token.decimals ?? 18));
                } catch (err) {
                    lastErr = err;
                }
            }
            throw lastErr;
        } catch (err) {
            console.warn(`[WalletService] Single token balance query failed for ${token.symbol}:`, err);
            // Fallback to current balance if available
            return typeof token.balance === 'string' ? parseFloat(token.balance) : (token.balance || 0);
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
                symbol: r.symbol ?? (r.contractName ? r.contractName.substring(0, 4).toUpperCase() : 'UNK'),
                name: r.contractName || r.name || 'Unknown Token',
                balance: r.balance,
                contractAddress: r.contractAddress,
                isNative: false,
                decimals: r.decimals ?? 6,
                verified: r.verified,
                chainId: 9048201,
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
