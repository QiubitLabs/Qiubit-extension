/**
 * Sui RPC Service
 * Handles communication with the Sui network (Native balance, Sui tokens, and transaction history).
 * Single source of truth for all Sui API calls.
 */

export class SuiRpcService {
    private rpcUrl: string;

    constructor(rpcUrl: string = 'https://fullnode.mainnet.sui.io') {
        this.rpcUrl = rpcUrl;
    }

    /**
     * Fetch native SUI or custom SUI coin balance
     */
    async getBalance(address: string, coinType: string = '0x2::sui::SUI'): Promise<string> {
        try {
            const resp = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'suix_getBalance',
                    params: [address, coinType]
                })
            });
            if (!resp.ok) return '0';
            const data = await resp.json();
            if (data.result && typeof data.result.totalBalance === 'string') {
                if (coinType === '0x2::sui::SUI') {
                    return (parseFloat(data.result.totalBalance) / 1e9).toFixed(6);
                }
                return data.result.totalBalance;
            }
            return '0';
        } catch (e) {
            console.error('[SuiRpcService] Failed to fetch SUI balance:', e);
            return '0';
        }
    }

    /**
     * Get recent transaction history for a Sui address
     */
    async getTransactionHistory(address: string, limit: number = 20): Promise<any[]> {
        try {
            const resp = await fetch(this.rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'suix_queryTransactionBlocks',
                    params: [
                        {
                            filter: { ToAddress: address },
                            options: { showInput: true, showEffects: true }
                        },
                        null,
                        limit,
                        true
                    ]
                })
            });
            if (!resp.ok) return [];
            const data = await resp.json();
            const txs = data.result?.data || [];
            
            return txs.map((t: any) => {
                const timestamp = t.timestampMs ? parseFloat(t.timestampMs) : Date.now();
                const isSuccess = t.effects?.status?.status === 'success';
                return {
                    hash: t.digest,
                    type: 'in', // Sui query for ToAddress retrieves incoming transactions
                    amount: '0',
                    address: address,
                    timestamp,
                    status: isSuccess ? 'confirmed' : 'failed',
                    description: 'Sui Transaction',
                    networkId: 'sui'
                };
            });
        } catch (e) {
            console.error('[SuiRpcService] Failed to fetch Sui transaction history:', e);
            return [];
        }
    }
}

export const suiRpc = new SuiRpcService();
