/**
 * LOGIC: Derives Sui keys and addresses from mnemonics or master seeds using the standard SLIP-0010 Ed25519 derivation path (m/44'/784'/index'/0'/0'). Generates the address using Blake2b hashing of the scheme flag (0x00) and the public key.
 * EXPORTS:
 *   - deriveSuiKeysFromMasterSeed (async function)
 *   - deriveSuiKeysFromMnemonic (async function)
 * FUNCTIONS:
 *   - deriveSuiKeysFromMasterSeed(masterSeed, index): Iteratively derives child keys using HMAC-SHA512, generates Ed25519 keypair, hashes (Blake2b) the public key with the Ed25519 flag, and outputs the address and private key.
 *   - deriveSuiKeysFromMnemonic(mnemonicPhrase, index): Translates a mnemonic phrase into a master seed and calls the seed derivation function.
 */

import nacl from "tweetnacl";
import { hmacSha512, mnemonicToSeed } from "./octra";
import { bufferToHex } from "../format";
import { blake2b } from "@noble/hashes/blake2b";

/**
 * Derive Sui keys from a 64-byte master seed using standard SLIP-0010 Ed25519 derivation.
 * Path: m/44'/784'/index'/0'/0'
 */
export async function deriveSuiKeysFromMasterSeed(
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
    784 + 0x80000000,
    index + 0x80000000,
    0 + 0x80000000,
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

  const suiData = new Uint8Array(1 + 32);
  suiData[0] = 0x00; // signature scheme flag for Ed25519
  suiData.set(publicKey, 1);

  const suiHash = blake2b(suiData, { dkLen: 32 });
  const address = "0x" + bufferToHex(suiHash);
  const privateKeyHex = bufferToHex(currentKey);

  return {
    address,
    privateKeyHex,
  };
}

/**
 * Derive Sui keys from a mnemonic using standard SLIP-0010 Ed25519 derivation.
 * Path: m/44'/784'/index'/0'/0'
 */
export async function deriveSuiKeysFromMnemonic(
  mnemonicPhrase: string,
  index: number = 0,
): Promise<{ address: string; privateKeyHex: string }> {
  try {
    const mnemonic = mnemonicPhrase.trim().toLowerCase();

    const seed = await mnemonicToSeed(mnemonic);

    return await deriveSuiKeysFromMasterSeed(seed, index);
  } catch (e) {
    console.error("Failed to derive Sui keys from mnemonic:", e);
    throw new Error(
      "Failed to derive Sui keys: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}
