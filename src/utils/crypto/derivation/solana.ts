/**
 * LOGIC: Derives Solana keys and addresses from mnemonics or master seeds using the standard SLIP-0010 Ed25519 derivation path (m/44'/501'/index'/0'). Uses TweetNaCl for keypair derivation and base58 encoding for the address format.
 * EXPORTS:
 *   - deriveSolanaKeysFromMasterSeed (async function)
 *   - deriveSolanaKeysFromMnemonic (async function)
 * FUNCTIONS:
 *   - deriveSolanaKeysFromMasterSeed(masterSeed, index): Iteratively derives child keys using HMAC-SHA512 based on SLIP-0010 path components, generates an Ed25519 keypair from the derived seed, and outputs the base58 address and hex private key.
 *   - deriveSolanaKeysFromMnemonic(mnemonicPhrase, index): Resolves mnemonic to seed, then derives the key pair.
 */

import nacl from "tweetnacl";
import { hmacSha512, mnemonicToSeed } from "./octra";
import { base58Encode, bufferToHex } from "../format";

/**
 * Derive Solana keys from a 64-byte master seed using standard SLIP-0010 Ed25519 derivation.
 * Path: m/44'/501'/index'/0'
 */
export async function deriveSolanaKeysFromMasterSeed(
  masterSeed: Uint8Array,
  index: number = 0,
): Promise<{ address: string; privateKeyHex: string }> {
  const textEncoder = new TextEncoder();
  const masterKeyBytes = textEncoder.encode("ed25519 seed");
  const masterI = await hmacSha512(masterKeyBytes, masterSeed);

  let currentKey = masterI.slice(0, 32);
  let currentChainCode = masterI.slice(32, 64);

  const path = [
    44 + 0x80000000,
    501 + 0x80000000,
    index + 0x80000000,
    0 + 0x80000000,
  ];

  for (const pathIndex of path) {
    const data = new Uint8Array(1 + 32 + 4);
    data[0] = 0x00;
    data.set(currentKey, 1);

    data[33] = (pathIndex >> 24) & 0xff;
    data[34] = (pathIndex >> 16) & 0xff;
    data[35] = (pathIndex >> 8) & 0xff;
    data[36] = pathIndex & 0xff;

    const childI = await hmacSha512(currentChainCode, data);
    currentKey = childI.slice(0, 32);
    currentChainCode = childI.slice(32, 64);
  }

  const keyPair = nacl.sign.keyPair.fromSeed(currentKey);
  const publicKey = keyPair.publicKey;

  const address = base58Encode(publicKey);
  const privateKeyHex = bufferToHex(currentKey);

  return {
    address,
    privateKeyHex,
  };
}

/**
 * Derive Solana keys from a mnemonic using standard SLIP-0010 Ed25519 derivation.
 * Path: m/44'/501'/index'/0'
 */
export async function deriveSolanaKeysFromMnemonic(
  mnemonicPhrase: string,
  index: number = 0,
): Promise<{ address: string; privateKeyHex: string }> {
  try {
    const mnemonic = mnemonicPhrase.trim().toLowerCase();

    const seed = await mnemonicToSeed(mnemonic);

    return await deriveSolanaKeysFromMasterSeed(seed, index);
  } catch (e) {
    console.error("Failed to derive Solana keys from mnemonic:", e);
    throw new Error(
      "Failed to derive Solana keys: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}
