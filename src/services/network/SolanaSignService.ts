/**
 * SolanaSignService — signs messages and transactions for connected dApps.
 *
 * Uses the wallet's ed25519 seed (solanaPrivateKeyHex). Message signing is a
 * plain detached ed25519 signature. Transaction signing deserializes the
 * dApp-provided bytes (legacy or versioned), adds our signature, and returns
 * the re-serialized transaction — matching the @solana/wallet-standard shape.
 */

import nacl from "tweetnacl";

/** Normalize any transport encoding into raw bytes. */
export function toBytes(
  input: number[] | Uint8Array | string | Record<string, number>,
): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (Array.isArray(input)) return new Uint8Array(input);
  if (typeof input === "string") {
    // try base64 first, then base58-ish fallback handled by caller
    try {
      const bin = atob(input);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return new Uint8Array(0);
    }
  }
  // JSON-serialized Uint8Array arrives as { "0": .., "1": .. }
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

function keypairFromHex(privateKeyHex: string) {
  const seed = new Uint8Array(Buffer.from(privateKeyHex, "hex"));
  return nacl.sign.keyPair.fromSeed(seed);
}

/** Detached ed25519 signature of a message → base64. */
export function solanaSignMessage(
  message: number[] | Uint8Array | string,
  privateKeyHex: string,
): string {
  const kp = keypairFromHex(privateKeyHex);
  const msg = toBytes(message);
  const sig = nacl.sign.detached(msg, kp.secretKey);
  return bytesToBase64(sig);
}

async function connect(cluster: "mainnet" | "devnet" | "testnet" = "mainnet") {
  const { Connection } = await import("@solana/web3.js");
  const { getSolanaEndpoints } = await import("./SolanaRpcService");
  const urls = getSolanaEndpoints(cluster);
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const conn = new Connection(url, "confirmed");
      await conn.getLatestBlockhash();
      return conn;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No Solana RPC endpoint reachable");
}

/**
 * Sign a serialized transaction and return the signed bytes (base64).
 * Handles both VersionedTransaction and legacy Transaction.
 */
export async function solanaSignTransaction(
  txInput: number[] | Uint8Array | string | Record<string, number>,
  privateKeyHex: string,
): Promise<string> {
  const web3 = await import("@solana/web3.js");
  const { VersionedTransaction, Transaction, Keypair } = web3;
  const seed = new Uint8Array(Buffer.from(privateKeyHex, "hex"));
  const keypair = Keypair.fromSeed(seed);
  const raw = toBytes(txInput);

  try {
    const vtx = VersionedTransaction.deserialize(raw);
    vtx.sign([keypair]);
    return bytesToBase64(vtx.serialize());
  } catch {
    const tx = Transaction.from(raw);
    tx.partialSign(keypair);
    return bytesToBase64(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    );
  }
}

/**
 * Sign then broadcast; returns the transaction signature string.
 * `chain` accepts a Wallet Standard id ("solana:devnet") or bare cluster name.
 */
export async function solanaSendTransaction(
  txInput: number[] | Uint8Array | string | Record<string, number>,
  privateKeyHex: string,
  chain?: string,
): Promise<string> {
  const cluster = chain?.includes("devnet")
    ? ("devnet" as const)
    : chain?.includes("testnet")
      ? ("testnet" as const)
      : ("mainnet" as const);
  const signedB64 = await solanaSignTransaction(txInput, privateKeyHex);
  const conn = await connect(cluster);
  const raw = toBytes(signedB64);
  return conn.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
}
