/**
 * Transaction Builder Utility
 * Based on webcli tx_builder implementation
 */

import { keyringService } from '../services/core/KeyringService';
import { getRpcClient } from '../services/network/RpcService';
import { canonicalJson, signMessage } from './crypto/transaction';

// Transaction structure matching webcli
export interface OctraTransaction {
    from: string;
    to_: string;
    amount: string;
    nonce: number;
    ou: string;
    timestamp: number;
    op_type?: string;
    encrypted_data?: string;
    message?: string;
    signature?: string;
    public_key?: string;
}

/**
 * Sign transaction using wallet keys (matches webcli signing)
 */
export async function signTransaction(tx: OctraTransaction, address: string): Promise<OctraTransaction> {
    try {
        // Get private key from keyring
        const privateKeyB64 = keyringService.getPrivateKey(address, 'signTransaction');
        if (!privateKeyB64) {
            throw new Error('No private key found for address');
        }

        // Use the correct canonical JSON and signing (from existing crypto utils)
        const signature = signMessage(canonicalJson(tx as any), privateKeyB64);
        const publicKey = keyringService.getPublicKey(address);

        return {
            ...tx,
            signature,
            public_key: publicKey || undefined
        };
    } catch (error: any) {
        throw new Error(`Failed to sign transaction: ${error.message}`);
    }
}

/**
 * Build contract call transaction
 */
export async function buildContractCallTransaction(
    contractAddress: string,
    method: string,
    params: any[],
    callerAddress: string,
    amount: string = '0'
): Promise<OctraTransaction> {
    const nonce = await getNextNonce(callerAddress);

    const tx: OctraTransaction = {
        from: callerAddress,
        to_: contractAddress,
        amount: amount,
        nonce: nonce,
        ou: '1000', // Default fee unit
        timestamp: Math.floor(Date.now() / 1000),
        op_type: 'call',
        encrypted_data: method,
        message: JSON.stringify(params)
    };

    return tx;
}

/**
 * Get next nonce for address (considering pending transactions)
 */
async function getNextNonce(address: string): Promise<number> {
    try {
        const rpc = getRpcClient();
        return await rpc.getNonceForSend(address);
    } catch {
        return 0;
    }
}

/**
 * Validate transaction parameters
 */
export function validateTransaction(tx: OctraTransaction): { valid: boolean; error?: string } {
    if (!tx.from || !tx.to_ || !tx.amount) {
        return { valid: false, error: 'Missing required transaction fields' };
    }

    if (tx.nonce < 0) {
        return { valid: false, error: 'Invalid nonce' };
    }

    if (parseFloat(tx.amount) < 0) {
        return { valid: false, error: 'Invalid amount' };
    }

    return { valid: true };
}