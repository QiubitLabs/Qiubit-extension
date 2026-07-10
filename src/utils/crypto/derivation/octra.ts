/**
 * LOGIC: Handles key/seed derivation for the Octra network. It provides Web Crypto-based HMAC-SHA512, BIP-39 mnemonic seed generation, and Octra-specific HD seed derivation matching the CLI implementation.
 * EXPORTS:
 *   - hmacSha512 (async function)
 *   - deriveHdSeed (async function)
 *   - mnemonicToSeed (async function)
 * FUNCTIONS:
 *   - hmacSha512(key, data): Computes a SHA-512 HMAC of the provided data using Web Crypto API.
 *   - deriveHdSeed(masterSeed, index, hdVersion): Derives a 32-byte sub-seed using either direct slice or HMAC-SHA512 depending on version and index parameter.
 *   - mnemonicToSeed(mnemonic): Converts a mnemonic string into a 64-byte seed buffer using bip39 library (PBKDF2-HMAC-SHA512).
 */

import * as bip39 from "bip39";

/**
 * HMAC-SHA512 using Web Crypto API
 * Matches CLI: hmac_sha512(key, key_len, data, data_len)
 */
export async function hmacSha512(
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const keyBuffer = key.buffer.slice(
    key.byteOffset,
    key.byteOffset + key.byteLength,
  ) as ArrayBuffer;
  const dataBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  return new Uint8Array(sig);
}

/**
 * Derive HD seed from master seed
 * Exact port of CLI derive_hd_seed() from crypto_utils.hpp
 *
 * hd_version=1, index=0: first 32 bytes of master_seed directly
 * hd_version=2, index=0: HMAC-SHA512("Octra seed", master_seed)[0:32]
 * else: HMAC-SHA512("Octra seed", master_seed || index_le32)[0:32]
 */
export async function deriveHdSeed(
  masterSeed: Uint8Array,
  index: number = 0,
  hdVersion: number = 2,
): Promise<Uint8Array> {
  if (hdVersion === 1 && index === 0) {
    return masterSeed.slice(0, 32);
  } else if (hdVersion === 2 && index === 0) {
    const key = new TextEncoder().encode("Octra seed");
    const mac = await hmacSha512(key, masterSeed);
    return mac.slice(0, 32);
  } else {
    const data = new Uint8Array(masterSeed.length + 4);
    data.set(masterSeed, 0);
    data[masterSeed.length] = index & 0xff;
    data[masterSeed.length + 1] = (index >> 8) & 0xff;
    data[masterSeed.length + 2] = (index >> 16) & 0xff;
    data[masterSeed.length + 3] = (index >> 24) & 0xff;

    const key = new TextEncoder().encode("Octra seed");
    const mac = await hmacSha512(key, data);
    return mac.slice(0, 32);
  }
}

/**
 * Convert mnemonic to 64-byte seed
 * Matches CLI: PKCS5_PBKDF2_HMAC(mnemonic, "mnemonic", 2048, SHA512, 64)
 * bip39.mnemonicToSeed does exactly this
 */
export async function mnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
  const seedBuffer = await bip39.mnemonicToSeed(mnemonic);
  return new Uint8Array(seedBuffer);
}
