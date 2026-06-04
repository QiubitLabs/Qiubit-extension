/**
 * Solana RPC Service
 * Handles communication with the Solana network (Native balance, SPL tokens, and transaction history).
 * Single source of truth for all Solana API calls.
 */

export class SolanaRpcService {
    private rpcUrl: string;

    constructor(rpcUrl: string = 'https://solana-rpc.publicnode.com') {
        this.rpcUrl = rpcUrl;
    }

    /**
     * Fetch native SOL balance using Moralis Solana Wallet API (with RPC fallback)
     */
    async getBalance(address: string): Promise<string> {
        try {
            const key = (import.meta.env.VITE_MORALIS_API_KEY as string) || '';
            if (key) {
                const resp = await fetch(`https://solana-gateway.moralis.io/account/mainnet/${address}/balance`, {
                    method: 'GET',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Api-Key': key
                    }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && typeof data.solana === 'string') {
                        return parseFloat(data.solana).toFixed(6);
                    }
                }
            }
        } catch (e) {
            console.warn('[SolanaRpcService] Moralis balance fetch failed, falling back to RPC:', e);
        }

        // Fallback: Try public RPC nodes in priority order
        const urls = [this.rpcUrl, 'https://solana.drpc.org', 'https://api.mainnet-beta.solana.com'];
        let lastErr: unknown;
        for (const url of urls) {
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'getBalance',
                        params: [address]
                    })
                });
                if (!resp.ok) continue;
                const data = await resp.json();
                if (data.result && typeof data.result.value === 'number') {
                    return (data.result.value / 1e9).toFixed(6);
                }
            } catch (e) {
                lastErr = e;
            }
        }
        console.error('[SolanaRpcService] Failed to fetch balance across all endpoints:', lastErr);
        return '0';
    }

    /**
     * Get recent transaction history for a Solana address
     */
    async getTransactionHistory(address: string, limit: number = 20): Promise<any[]> {
        const urls = [this.rpcUrl, 'https://solana.drpc.org', 'https://api.mainnet-beta.solana.com'];
        let lastErr: unknown;
        for (const url of urls) {
            try {
                const sigResp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'getSignaturesForAddress',
                        params: [address, { limit }]
                    })
                });
                if (!sigResp.ok) continue;
                const sigData = await sigResp.json();
                const signatures = sigData.result || [];
                
                // Map signatures to the standardized Wallet Transaction format
                return signatures.map((s: any) => {
                    const timestamp = s.blockTime ? s.blockTime * 1000 : Date.now();
                    return {
                        hash: s.signature,
                        type: 'unknown', // can be in/out/swap
                        amount: '0', // Native API signature lists don't include amounts directly
                        address: address,
                        timestamp,
                        status: s.err ? 'failed' : 'confirmed',
                        description: s.memo || 'Solana Transaction',
                        networkId: 'solana'
                    };
                });
            } catch (e) {
                lastErr = e;
            }
        }
        console.error('[SolanaRpcService] Failed to fetch Solana history across all endpoints:', lastErr);
        return [];
    }
}

export const solanaRpc = new SolanaRpcService();
