/**
 * SuiSignService — signs personal messages and transactions for dApps.
 *
 * Sui signatures are ed25519 over blake2b-256 of an intent message
 * (intent bytes ‖ bcs(payload)). Intent scopes: 0 = TransactionData,
 * 3 = PersonalMessage. The serialized signature is
 * flag(0x00) ‖ sig(64) ‖ pubkey(32), base64-encoded — the format
 * @mysten/wallet-standard expects.
 */

import nacl from "tweetnacl";
import { blake2b } from "@noble/hashes/blake2b";

function toBytes(
  input: number[] | Uint8Array | string | Record<string, number>,
): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (Array.isArray(input)) return new Uint8Array(input);
  if (typeof input === "string") {
    try {
      const bin = atob(input);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return new Uint8Array(0);
    }
  }
  const keys = Object.keys(input)
    .map(Number)
    .filter((k) => !isNaN(k))
    .sort((a, b) => a - b);
  return new Uint8Array(keys.map((k) => (input as any)[k]));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** ULEB128 length prefix (Sui BCS vector<u8> encoding for personal messages). */
function uleb128(n: number): Uint8Array {
  const out: number[] = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v >>= 7;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return new Uint8Array(out);
}

function serializeSignature(
  sig: Uint8Array,
  pubkey: Uint8Array,
): string {
  const out = new Uint8Array(1 + 64 + 32);
  out[0] = 0x00; // ed25519 flag
  out.set(sig, 1);
  out.set(pubkey, 65);
  return bytesToBase64(out);
}

function signIntent(
  scope: number,
  payload: Uint8Array,
  privateKeyHex: string,
): string {
  const seed = new Uint8Array(
    Buffer.from(privateKeyHex.replace(/^0x/i, ""), "hex"),
  );
  const kp = nacl.sign.keyPair.fromSeed(seed);
  const intent = new Uint8Array(3 + payload.length);
  intent.set([scope, 0, 0], 0); // scope, version, app id
  intent.set(payload, 3);
  const digest = blake2b(intent, { dkLen: 32 });
  const sig = nacl.sign.detached(digest, kp.secretKey);
  return serializeSignature(sig, kp.publicKey);
}

/**
 * Personal message (intent scope 3). The payload is BCS vector<u8>:
 * ULEB128 length ‖ message bytes.
 */
export function suiSignPersonalMessage(
  message: number[] | Uint8Array | string,
  privateKeyHex: string,
): { signature: string; messageBytes: string } {
  const msg = toBytes(message);
  const bcs = new Uint8Array(uleb128(msg.length).length + msg.length);
  const prefix = uleb128(msg.length);
  bcs.set(prefix, 0);
  bcs.set(msg, prefix.length);
  const signature = signIntent(3, bcs, privateKeyHex);
  return { signature, messageBytes: bytesToBase64(msg) };
}

/**
 * Transaction (intent scope 0). txBytes are the BCS-serialized
 * TransactionData the dApp provides.
 */
export function suiSignTransaction(
  txInput: number[] | Uint8Array | string | Record<string, number>,
  privateKeyHex: string,
): { signature: string; bytes: string } {
  const txBytes = toBytes(txInput);
  const signature = signIntent(0, txBytes, privateKeyHex);
  return { signature, bytes: bytesToBase64(txBytes) };
}

const SUI_RPC_URLS = [
  "https://fullnode.mainnet.sui.io",
  "https://sui-rpc.publicnode.com",
];

/**
 * Sign a transaction (intent scope 0) and execute it on-chain via
 * sui_executeTransactionBlock. Returns the execution result (digest + effects).
 */
export async function suiSignAndExecute(
  txInput: number[] | Uint8Array | string | Record<string, number>,
  privateKeyHex: string,
): Promise<any> {
  const { signature, bytes } = suiSignTransaction(txInput, privateKeyHex);
  let lastErr: unknown;
  for (const url of SUI_RPC_URLS) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sui_executeTransactionBlock",
          params: [
            bytes,
            [signature],
            { showEffects: true, showEvents: true, showBalanceChanges: true },
            "WaitForLocalExecution",
          ],
        }),
      });
      if (!resp.ok) throw new Error(`Sui RPC HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || "Sui exec error");
      const result = data.result;
      const status = result?.effects?.status;
      if (status && status.status !== "success") {
        throw new Error(status.error || "Sui transaction failed on-chain.");
      }
      return result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Sui transaction execution failed.");
}
