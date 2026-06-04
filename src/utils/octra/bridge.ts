/**
 * Octra Native Bridge constants.
 * Centralizes all addresses and relayer endpoints for the OCT↔wOCT bridge.
 * To update relayer: set VITE_BRIDGE_RELAYER_URL in .env
 */

// Octra-side vault that receives locked OCT
export const BRIDGE_VAULT = 'oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq';

// wOCT ERC-20 contract on Ethereum mainnet
export const WOCT_ADDR = '0x4647e1fE715c9e23959022C2416C71867F5a6E80';

// ETH-side bridge contract (lock/unlock/burn/claim)
export const ETH_BRIDGE = '0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE';

// OCT token has 6 decimal places (same as wOCT)
export const OCT_DECIMALS = 6;

// Relayer JSON-RPC endpoint — override via VITE_BRIDGE_RELAYER_URL
const DEFAULT_RELAYER = 'https://relayer-002838819188.octra.network';

export const SIGNER_URL   = `${import.meta.env.VITE_BRIDGE_RELAYER_URL ?? DEFAULT_RELAYER}/rpc`;
export const RECOVERY_URL = `${import.meta.env.VITE_BRIDGE_RELAYER_URL ?? DEFAULT_RELAYER}/recovery.json`;

/** Thin JSON-RPC wrapper for the Octra bridge relayer */
export async function signerPost(method: string, params: unknown[]): Promise<any> {
    const resp = await fetch(SIGNER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!resp.ok) throw new Error(`Relayer HTTP ${resp.status}`);
    return resp.json();
}
