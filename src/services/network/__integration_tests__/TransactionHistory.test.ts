
import { describe, it, expect } from 'vitest';
import { getRpcClient } from '../RpcService';

// Use live RPC for integration test
// WARNING: This test requires internet connection and valid RPC endpoint
const RPC_URL = process.env.VITE_RPC_URL || 'https://octra.network/rpc';

describe('RPC Integration: Transaction History', () => {
    const client = getRpcClient();
    client.setRpcUrl(RPC_URL);

    // User provided address
    const TARGET_ADDRESS = 'oct3SSKjCGK8pVxPHH1Y6LZEVqm94rZn3StXHt31AD1UUVN'; 
    // Wait, let's use a dynamic one or one that definitely has txs if possible.
    // Or just check if we get a valid response structure even if empty.
    
    it('should fetch address info (balance/nonce)', async () => {
        const start = performance.now();
        const info = await client.getBalance(TARGET_ADDRESS);
        const duration = performance.now() - start;
        
        console.log(`[Integration] getBalance took ${duration.toFixed(2)}ms`);
        console.log(`[Integration] Result:`, info);

        expect(info).toHaveProperty('balance');
        expect(info).toHaveProperty('nonce');
        expect(typeof info.balance).toBe('number');
    }, 50000);

    it('should fetch transaction list', async () => {
        const start = performance.now();
        // Use a tiny limit since this address has over 191,000 transactions to prevent node database scan delays
        const limit = 2;
        const info = await client.getAddressInfo(TARGET_ADDRESS, limit);
        const duration = performance.now() - start;
        
        console.log(`[Integration] getAddressInfo (limit=${limit}) took ${duration.toFixed(2)}ms`);
        console.log(`[Integration] Tx Count Fetched:`, info.recent_transactions.length);
        
        // Debug: Check if we have total count in info (we might need to patch RpcService if missing)
        // console.log('Info keys:', Object.keys(info));

        expect(info).toHaveProperty('recent_transactions');
        expect(Array.isArray(info.recent_transactions)).toBe(true);
    }, 50000);

    it('should batch fetch transactions efficiently', async () => {
        // Directly use valid 64-character dummy hashes to test batch logic/response structure without redundant address history queries
        const targetTxs = [
            { hash: '0000000000000000000000000000000000000000000000000000000000000123' },
            { hash: '0000000000000000000000000000000000000000000000000000000000000456' },
            { hash: '0000000000000000000000000000000000000000000000000000000000000789' }
        ];

        console.log(`[Integration] Testing batch fetch with ${targetTxs.length} items`);

        // 2. Construct batch request
        // Verify RpcService method names matching usage
        // Our RpcService.getTransaction calls octra_transaction.
        const batchCalls = targetTxs.map((tx: any) => ({
            method: 'octra_transaction', 
            params: [tx.hash]
        }));
        
        const start = performance.now();
        const results = await client.jsonRpcBatchCall(batchCalls);
        const duration = performance.now() - start;

        console.log(`[Integration] Batch fetch took ${duration.toFixed(2)}ms`);
        console.log(`[Integration] Batch Result Status: ${results.status}`);
        
        // Verify results
        expect(results.ok).toBe(true);
        expect(Array.isArray(results.json)).toBe(true);
        
        // Even if results are errors (due to dummy hash), the batch request itself should succeed (HTTP 200) 
        // and return an array of responses.
        if (results.json) {
            expect(results.json.length).toBe(targetTxs.length);
        }
    }, 50000);
});
