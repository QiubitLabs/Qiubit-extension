/**
 * LOGIC: Defines constants for the Octra Native Bridge (OCT to wOCT bridge vault, ERC-20 wrapped token, and Ethereum-side bridge contract addresses, decimals, and endpoints).
 * Provides a lightweight client JSON-RPC fetch wrapper to communicate with the bridge relayer.
 * EXPORTS:
 *   - BRIDGE_VAULT (const string)
 *   - WOCT_ADDR (const string)
 *   - ETH_BRIDGE (const string)
 *   - OCT_DECIMALS (const number)
 *   - SIGNER_URL (const string)
 *   - RECOVERY_URL (const string)
 *   - signerPost (async function)
 * FUNCTIONS:
 *   - signerPost(method, params): Posts JSON-RPC 2.0 requests to the bridge relayer endpoint.
 */

export const BRIDGE_VAULT = "oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq";

export const WOCT_ADDR = "0x4647e1fE715c9e23959022C2416C71867F5a6E80";

export const ETH_BRIDGE = "0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE";

export const OCT_DECIMALS = 6;

const DEFAULT_RELAYER = "https://relayer-002838819188.octra.network";

export const SIGNER_URL = `${import.meta.env.VITE_BRIDGE_RELAYER_URL ?? DEFAULT_RELAYER}/rpc`;
export const RECOVERY_URL = `${import.meta.env.VITE_BRIDGE_RELAYER_URL ?? DEFAULT_RELAYER}/recovery.json`;

/** Thin JSON-RPC wrapper for the Octra bridge relayer */
export async function signerPost(
  method: string,
  params: unknown[],
): Promise<any> {
  const resp = await fetch(SIGNER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!resp.ok) throw new Error(`Relayer HTTP ${resp.status}`);
  return resp.json();
}
