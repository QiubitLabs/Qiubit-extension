/**
 * Bitcoin RPC Service
 * Handles communication with the Bitcoin network (Native balance and transaction history).
 * Uses Mempool.space's free public REST API (rate-limit safe, no API keys).
 */

export class BitcoinRpcService {
    private apiUrl: string;

    constructor(apiUrl: string = 'https://mempool.space/api') {
        this.apiUrl = apiUrl;
    }

    /**
     * Fetch native BTC balance
     */
    async getBalance(address: string): Promise<string> {
        try {
            const resp = await fetch(`${this.apiUrl}/address/${address}`);
            if (!resp.ok) return '0';
            const data = await resp.json();
            const chainStats = data.chain_stats;
            const mempoolStats = data.mempool_stats;
            if (chainStats && mempoolStats) {
                const chainBal = (chainStats.funded_txo_sum || 0) - (chainStats.spent_txo_sum || 0);
                const mempoolBal = (mempoolStats.funded_txo_sum || 0) - (mempoolStats.spent_txo_sum || 0);
                const totalSat = chainBal + mempoolBal;
                return (totalSat / 1e8).toFixed(8);
            }
            return '0';
        } catch (e) {
            console.error('[BitcoinRpcService] Failed to fetch Bitcoin balance:', e);
            return '0';
        }
    }

    /**
     * Get recent transaction history for a Bitcoin address
     */
    async getTransactionHistory(address: string): Promise<any[]> {
        try {
            const resp = await fetch(`${this.apiUrl}/address/${address}/txs`);
            if (!resp.ok) return [];
            const txs = await resp.json();
            
            return txs.map((t: any) => {
                const isConfirmed = t.status?.confirmed === true;
                const timestamp = isConfirmed ? t.status.block_time * 1000 : Date.now();
                return {
                    hash: t.txid,
                    type: 'unknown',
                    amount: '0',
                    address: address,
                    timestamp,
                    status: isConfirmed ? 'confirmed' : 'pending',
                    description: 'Bitcoin Transaction',
                    networkId: 'bitcoin'
                };
            });
        } catch (e) {
            console.error('[BitcoinRpcService] Failed to fetch Bitcoin transaction history:', e);
            return [];
        }
    }
}

export const bitcoinRpc = new BitcoinRpcService();
