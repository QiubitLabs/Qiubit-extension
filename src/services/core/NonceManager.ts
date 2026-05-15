/**
 * NonceManager - Atomic local nonce tracking to prevent nonce collisions
 * when multiple transactions are sent in quick succession.
 */

import { getRpcClient } from '../network/RpcService';

class NonceManagerService {
    private static _instance: NonceManagerService | null = null;
    // Maps address → next nonce to use (undefined = fetch from network)
    private pending = new Map<string, number>();

    static getInstance(): NonceManagerService {
        if (!NonceManagerService._instance) {
            NonceManagerService._instance = new NonceManagerService();
        }
        return NonceManagerService._instance;
    }

    /**
     * Get the next nonce for an address, atomically incrementing the local counter.
     * On first call, fetches from network. Subsequent calls use local counter.
     */
    async getNext(address: string): Promise<number> {
        if (this.pending.has(address)) {
            const nonce = this.pending.get(address)!;
            this.pending.set(address, nonce + 1);
            return nonce;
        }
        // Fetch current nonce from network, next tx uses nonce+1
        const rpc = getRpcClient();
        const networkNonce = await rpc.getNonceForSend(address);
        const nextNonce = networkNonce + 1;
        this.pending.set(address, nextNonce + 1); // next call after this uses +2
        return nextNonce;
    }

    /**
     * Reset nonce for an address (call on transaction failure so next fetch is fresh).
     */
    reset(address: string): void {
        this.pending.delete(address);
    }

    /**
     * Sync local nonce to confirmed network nonce (call after confirmed transaction).
     */
    async sync(address: string): Promise<void> {
        this.pending.delete(address); // next call will re-fetch from network
    }
}

export const nonceManager = NonceManagerService.getInstance();
