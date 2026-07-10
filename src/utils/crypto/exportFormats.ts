/**
 * Key export formats for cross-wallet interoperability.
 *
 * The wallet stores Solana/Bitcoin private keys as raw 32-byte hex, which most
 * external wallets can't import directly. These helpers produce the canonical
 * import formats:
 *   - Solana → base58 of the 64-byte secret key (Phantom / Solflare).
 *   - Bitcoin → WIF (Wallet Import Format), compressed (Electrum / Core).
 */

import nacl from "tweetnacl";
import { sha256 } from "@noble/hashes/sha256";
import { base58Encode, hexToBuffer } from "./format";

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(hexToBuffer(hex.replace(/^0x/i, "")));
}

/**
 * Solana secret key as base58 (64 bytes = 32-byte seed + 32-byte public key).
 * This is the string Phantom/Solflare accept in "Import private key".
 */
export function solanaSecretKeyBase58(seedHex: string): string {
  const seed = hexToBytes(seedHex);
  if (seed.length !== 32) {
    throw new Error("Solana seed must be 32 bytes");
  }
  const keyPair = nacl.sign.keyPair.fromSeed(seed);
  return base58Encode(keyPair.secretKey);
}

/**
 * Bitcoin private key in WIF. The wallet derives BIP-84 compressed keys, so the
 * compressed flag (0x01 suffix) is set by default to match its bc1 addresses.
 */
export function bitcoinWIF(privateKeyHex: string, compressed = true): string {
  const key = hexToBytes(privateKeyHex);
  if (key.length !== 32) {
    throw new Error("Bitcoin private key must be 32 bytes");
  }
  const payload = new Uint8Array(1 + 32 + (compressed ? 1 : 0));
  payload[0] = 0x80; // mainnet prefix
  payload.set(key, 1);
  if (compressed) payload[33] = 0x01;

  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return base58Encode(full);
}
