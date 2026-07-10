/**
 * LOGIC: High-level wallet keys manager. Coordinates key generation (BIP-39 mnemonic, entropy), multi-chain derivations (Octra Ed25519, EVM BIP-44, Solana SLIP-0010, Sui SLIP-0010, Bitcoin BIP-84), private key normalization/import from multiple formats, and HD account derivation.
 * EXPORTS:
 *   - Re-exports from evm, octra, solana, sui, bitcoin derivation modules
 *   - WalletKeys (interface)
 *   - generateWallet (async function)
 *   - importFromMnemonic (async function)
 *   - importFromPrivateKey (async function)
 *   - deriveHdAccount (async function)
 *   - validateMnemonic (function)
 *   - looksLikeMnemonic (function)
 * FUNCTIONS:
 *   - generateWallet(): Creates new 128-bit entropy, outputs mnemonic, and derives address/keys for Octra, EVM, Solana, Sui, and Bitcoin.
 *   - importFromMnemonic(mnemonicPhrase, hdIndex, hdVersion): Imports mnemonic, derives master seed, and derives sub-accounts for all supported chains.
 *   - normalizePrivateKeyInput(input): Auto-detects and decodes private keys from formats like Sui bech32 (suiprivkey1), Bitcoin WIF, Solana base58 keypair, raw hex (64/128 chars), and base64.
 *   - importFromPrivateKey(input): Imports a raw 32-byte key and uses it directly across all supported elliptic curves (secp256k1 and Ed25519) to compute all chain-specific addresses.
 *   - deriveHdAccount(masterSeedB64, index, hdVersion): Derives a sub-account at a specific index across all chains from a master seed.
 *   - validateMnemonic(mnemonic): Validates the checksum of a BIP-39 mnemonic string.
 *   - looksLikeMnemonic(input): Evaluates if a string could be a mnemonic based on word count/spaces.
 */

import * as bip39 from "bip39";
import nacl from "tweetnacl";
import { ethers } from "ethers";
import {
  bufferToHex,
  hexToBuffer,
  bufferToBase64,
  base64ToBuffer,
  createOctraAddress,
  base58Encode,
  base58Decode,
} from "./format";

export {
  deriveEvmAddressFromMnemonic,
  deriveEvmKeyFromMnemonic,
} from "./derivation/evm";

export { hmacSha512, deriveHdSeed, mnemonicToSeed } from "./derivation/octra";

export {
  deriveSolanaKeysFromMnemonic,
  deriveSolanaKeysFromMasterSeed,
} from "./derivation/solana";

export {
  deriveSuiKeysFromMnemonic,
  deriveSuiKeysFromMasterSeed,
} from "./derivation/sui";

export { deriveBitcoinKeysFromMnemonic } from "./derivation/bitcoin";

import { deriveEvmKeyFromMnemonic } from "./derivation/evm";

import { deriveHdSeed, mnemonicToSeed } from "./derivation/octra";

import {
  deriveSolanaKeysFromMnemonic,
  deriveSolanaKeysFromMasterSeed,
} from "./derivation/solana";

import {
  deriveSuiKeysFromMnemonic,
  deriveSuiKeysFromMasterSeed,
} from "./derivation/sui";

import {
  deriveBitcoinKeysFromMnemonic,
  toBech32Address,
} from "./derivation/bitcoin";

export interface WalletKeys {
  mnemonic: string[] | null;
  seedHex?: string;
  privateKeyHex: string;
  publicKeyHex: string;
  privateKeyB64: string;
  publicKeyB64: string;
  address: string;
  evmAddress?: string;
  evmPrivateKeyHex?: string; // BIP44 m/44'/60'/0'/0/n — used for signing EVM txs
  solanaAddress?: string; // BIP44 m/44'/501'/index'/0' — used for Solana Address
  solanaPrivateKeyHex?: string; // Derived Solana Private Key (Ed25519)
  suiAddress?: string;
  suiPrivateKeyHex?: string;
  bitcoinAddress?: string;
  bitcoinPrivateKeyHex?: string;
  entropyHex?: string;
  hdIndex?: number;
  hdVersion?: number;
  masterSeedB64?: string;
}

/**
 * Generate new wallet with mnemonic
 * Matches CLI create_wallet() from wallet.hpp:
 *   1. generate_mnemonic_12()
 *   2. mnemonic_to_seed(mnemonic) -> 64 bytes
 *   3. derive_hd_seed(seed, 0, 2) -> 32 bytes
 *   4. keypair_from_seed(hd_seed) -> Ed25519 keypair
 *   5. derive_address(pk) -> "oct" + base58(sha256(pk))
 */
export async function generateWallet(): Promise<WalletKeys> {
  const entropy = crypto.getRandomValues(new Uint8Array(16));
  const entropyHex = bufferToHex(entropy);

  const mnemonic = bip39.entropyToMnemonic(entropyHex);

  const seed = await mnemonicToSeed(mnemonic);

  const hdSeed = await deriveHdSeed(seed, 0, 2);

  const keyPair = nacl.sign.keyPair.fromSeed(hdSeed);
  const privateKey = hdSeed; // 32-byte seed IS the private key
  const publicKey = keyPair.publicKey;

  const address = await createOctraAddress(publicKey);

  const evmKey = deriveEvmKeyFromMnemonic(mnemonic, 0);

  const solanaKey = await deriveSolanaKeysFromMnemonic(mnemonic, 0);

  const suiKey = await deriveSuiKeysFromMnemonic(mnemonic, 0);

  const bitcoinKey = await deriveBitcoinKeysFromMnemonic(mnemonic, 0);

  const masterSeedB64 = bufferToBase64(seed);

  return {
    mnemonic: mnemonic.split(" "),
    seedHex: bufferToHex(seed),
    privateKeyHex: bufferToHex(privateKey),
    publicKeyHex: bufferToHex(publicKey),
    privateKeyB64: bufferToBase64(privateKey),
    publicKeyB64: bufferToBase64(publicKey),
    address,
    evmAddress: evmKey?.address,
    evmPrivateKeyHex: evmKey?.privateKeyHex,
    solanaAddress: solanaKey.address,
    solanaPrivateKeyHex: solanaKey.privateKeyHex,
    suiAddress: suiKey.address,
    suiPrivateKeyHex: suiKey.privateKeyHex,
    bitcoinAddress: bitcoinKey.address,
    bitcoinPrivateKeyHex: bitcoinKey.privateKeyHex,
    entropyHex,
    hdIndex: 0,
    hdVersion: 2,
    masterSeedB64,
  };
}

/**
 * Import wallet from mnemonic
 * Matches CLI import flow with hd_version=2
 */
export async function importFromMnemonic(
  mnemonicPhrase: string,
  hdIndex: number = 0,
  hdVersion: number = 2,
): Promise<WalletKeys> {
  const mnemonic = mnemonicPhrase.trim().toLowerCase();

  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const seed = await mnemonicToSeed(mnemonic);

  const hdSeed = await deriveHdSeed(seed, hdIndex, hdVersion);

  const keyPair = nacl.sign.keyPair.fromSeed(hdSeed);
  const privateKey = hdSeed;
  const publicKey = keyPair.publicKey;

  const address = await createOctraAddress(publicKey);

  const evmKey = deriveEvmKeyFromMnemonic(mnemonic, hdIndex);

  const solanaKey = await deriveSolanaKeysFromMnemonic(mnemonic, hdIndex);

  const suiKey = await deriveSuiKeysFromMnemonic(mnemonic, hdIndex);

  const bitcoinKey = await deriveBitcoinKeysFromMnemonic(mnemonic, hdIndex);

  const masterSeedB64 = bufferToBase64(seed);

  return {
    mnemonic: mnemonic.split(" "),
    seedHex: bufferToHex(seed),
    privateKeyHex: bufferToHex(privateKey),
    publicKeyHex: bufferToHex(publicKey),
    privateKeyB64: bufferToBase64(privateKey),
    publicKeyB64: bufferToBase64(publicKey),
    address,
    evmAddress: evmKey?.address,
    evmPrivateKeyHex: evmKey?.privateKeyHex,
    solanaAddress: solanaKey.address,
    solanaPrivateKeyHex: solanaKey.privateKeyHex,
    suiAddress: suiKey.address,
    suiPrivateKeyHex: suiKey.privateKeyHex,
    bitcoinAddress: bitcoinKey.address,
    bitcoinPrivateKeyHex: bitcoinKey.privateKeyHex,
    hdIndex,
    hdVersion,
    masterSeedB64,
  };
}

/**
 * Auto-detect and normalize any private key format to a 32-byte Uint8Array.
 * Tries (in order): Sui bech32, Bitcoin WIF, Solana base58 keypair, hex 64/128, base64.
 */
function normalizePrivateKeyInput(input: string): Uint8Array {
  let clean = input.replace(/\s+/g, "");

  if (clean.toLowerCase().startsWith("suiprivkey1")) {
    try {
      const b32chars = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
      const data = clean.slice(11).toLowerCase();
      const decoded: number[] = [];
      for (const ch of data.slice(0, -6)) {
        const v = b32chars.indexOf(ch);
        if (v < 0) throw new Error("bad char");
        decoded.push(v);
      }
      let acc = 0,
        bits = 0;
      const bytes: number[] = [];
      for (const val of decoded) {
        acc = (acc << 5) | val;
        bits += 5;
        while (bits >= 8) {
          bits -= 8;
          bytes.push((acc >> bits) & 0xff);
        }
      }
      if (bytes.length >= 33) return new Uint8Array(bytes.slice(1, 33));
    } catch (_) {
      /* fall through */
    }
  }

  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,52}$/.test(clean)) {
    try {
      const decoded = base58Decode(clean);
      if (decoded.length >= 37) return new Uint8Array(decoded.slice(1, 33));
    } catch (_) {
      /* fall through */
    }
  }

  if (/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(clean)) {
    try {
      const decoded = base58Decode(clean);
      if (decoded.length >= 32) return new Uint8Array(decoded.slice(0, 32));
    } catch (_) {
      /* fall through */
    }
  }

  if (clean.startsWith("0x") || clean.startsWith("0X")) {
    clean = clean.substring(2);
  }

  if (/^[a-fA-F0-9]{64}$/.test(clean)) {
    return new Uint8Array(hexToBuffer(clean));
  }

  if (/^[a-fA-F0-9]{128}$/.test(clean)) {
    return new Uint8Array(hexToBuffer(clean).slice(0, 32));
  }

  // Bare 32-byte Solana secret in base58 (~43-44 chars). Tried before the
  // base64 fallback: a real base64 32-byte key carries '='/'+'/'/' padding
  // that the base58 charset excludes, so Octra base64 keys are not shadowed.
  if (/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(clean)) {
    try {
      const decoded = base58Decode(clean);
      if (decoded.length === 32) return new Uint8Array(decoded);
    } catch (_) {
      /* fall through */
    }
  }

  try {
    const decoded = base64ToBuffer(clean);
    if (decoded.length >= 64) return new Uint8Array(decoded.slice(0, 32));
    if (decoded.length === 32) return new Uint8Array(decoded);
  } catch (_) {
    /* fall through */
  }

  throw new Error(
    "Unrecognized private key format. Supported: Octra base64/hex, EVM 0x hex, Solana base58, Sui suiprivkey1..., Bitcoin WIF.",
  );
}

/**
 * Import wallet from any private key format (auto-detected).
 * Supports: Octra base64/hex, EVM 0x hex, Solana base58 keypair, Sui bech32, Bitcoin WIF.
 * The extracted 32-byte seed derives all chain addresses.
 */
export async function importFromPrivateKey(input: string): Promise<WalletKeys> {
  if (!input) throw new Error("Private key is required");

  const privateKey = normalizePrivateKeyInput(input);

  if (privateKey.length !== 32) {
    throw new Error("Invalid private key length. Must be 32 bytes.");
  }

  const privateKeyB64 = bufferToBase64(privateKey);

  const keyPair = nacl.sign.keyPair.fromSeed(privateKey);
  const publicKey = keyPair.publicKey;
  const address = await createOctraAddress(publicKey);

  const evmPrivKeyHex = bufferToHex(privateKey);
  const evmWallet = new ethers.Wallet("0x" + evmPrivKeyHex);
  const evmAddress = evmWallet.address;

  const solPublicKey = nacl.sign.keyPair.fromSeed(privateKey).publicKey;
  const solanaAddress = base58Encode(solPublicKey);
  const solanaPrivateKeyHex = evmPrivKeyHex;

  const suiPublicKey = nacl.sign.keyPair.fromSeed(privateKey).publicKey;
  const blake2b = (await import("@noble/hashes/blake2b")).blake2b;
  const suiData = new Uint8Array(1 + 32);
  suiData[0] = 0x00;
  suiData.set(suiPublicKey, 1);
  const suiHash = blake2b(suiData, { dkLen: 32 });
  const suiAddress = "0x" + bufferToHex(suiHash);
  const suiPrivateKeyHex = evmPrivKeyHex;

  const ripemd160 = (await import("@noble/hashes/ripemd160")).ripemd160;
  const sha256fn = (await import("@noble/hashes/sha256")).sha256;
  const compressedPubKey = ethers.SigningKey.computePublicKey(
    "0x" + evmPrivKeyHex,
    true,
  );
  const pubKeyBytes = ethers.getBytes(compressedPubKey);
  const sha = sha256fn(pubKeyBytes);
  const rip = ripemd160(sha);
  const bitcoinAddress = toBech32Address(rip);
  const bitcoinPrivateKeyHex = evmPrivKeyHex;

  return {
    mnemonic: null,
    privateKeyHex: evmPrivKeyHex,
    publicKeyHex: bufferToHex(publicKey),
    privateKeyB64,
    publicKeyB64: bufferToBase64(publicKey),
    address,
    evmAddress,
    evmPrivateKeyHex: evmPrivKeyHex,
    solanaAddress,
    solanaPrivateKeyHex,
    suiAddress,
    suiPrivateKeyHex,
    bitcoinAddress,
    bitcoinPrivateKeyHex,
  };
}

/**
 * Derive a new HD account from master seed
 * Matches CLI derive_hd_seed for index > 0
 */
export async function deriveHdAccount(
  masterSeedB64: string,
  index: number,
  hdVersion: number = 2,
): Promise<WalletKeys> {
  const masterSeed = new Uint8Array(base64ToBuffer(masterSeedB64));
  if (masterSeed.length !== 64) {
    throw new Error("Invalid master seed length. Must be 64 bytes.");
  }

  const hdSeed = await deriveHdSeed(masterSeed, index, hdVersion);
  const keyPair = nacl.sign.keyPair.fromSeed(hdSeed);
  const privateKey = hdSeed;
  const publicKey = keyPair.publicKey;
  const address = await createOctraAddress(publicKey);

  let evmAddress: string | undefined;
  try {
    const rootNode = ethers.HDNodeWallet.fromSeed(masterSeed);
    const childNode = rootNode.derivePath(`m/44'/60'/0'/0/${index}`);
    evmAddress = childNode.address;
  } catch (e) {
    console.error("Failed to derive EVM address from seed:", e);
  }

  let solanaAddress: string | undefined;
  let solanaPrivateKeyHex: string | undefined;
  try {
    const solKeys = await deriveSolanaKeysFromMasterSeed(masterSeed, index);
    solanaAddress = solKeys.address;
    solanaPrivateKeyHex = solKeys.privateKeyHex;
  } catch (e) {
    console.error("Failed to derive Solana address from seed:", e);
  }

  let suiAddress: string | undefined;
  let suiPrivateKeyHex: string | undefined;
  try {
    const suiKeys = await deriveSuiKeysFromMasterSeed(masterSeed, index);
    suiAddress = suiKeys.address;
    suiPrivateKeyHex = suiKeys.privateKeyHex;
  } catch (e) {
    console.error("Failed to derive Sui address from seed:", e);
  }

  let bitcoinAddress: string | undefined;
  let bitcoinPrivateKeyHex: string | undefined;
  try {
    const rootNode = ethers.HDNodeWallet.fromSeed(masterSeed);
    const childNode = rootNode.derivePath(`m/84'/0'/0'/0/${index}`);
    let privateKeyHex = childNode.privateKey;
    if (privateKeyHex.startsWith("0x")) privateKeyHex = privateKeyHex.slice(2);

    const compressedPubKey = childNode.publicKey;
    const pubKeyBytes = ethers.getBytes(compressedPubKey);
    const ripemd160 = (await import("@noble/hashes/ripemd160")).ripemd160;
    const sha256 = (await import("@noble/hashes/sha256")).sha256;
    const sha = sha256(pubKeyBytes);
    const rip = ripemd160(sha);
    bitcoinAddress = toBech32Address(rip);
    bitcoinPrivateKeyHex = childNode.privateKey;
  } catch (e) {
    console.error("Failed to derive Bitcoin address from seed:", e);
  }

  return {
    mnemonic: null,
    privateKeyHex: bufferToHex(privateKey),
    publicKeyHex: bufferToHex(publicKey),
    privateKeyB64: bufferToBase64(privateKey),
    publicKeyB64: bufferToBase64(publicKey),
    address,
    evmAddress,
    solanaAddress,
    solanaPrivateKeyHex,
    suiAddress,
    suiPrivateKeyHex,
    bitcoinAddress,
    bitcoinPrivateKeyHex,
    hdIndex: index,
    hdVersion,
    masterSeedB64,
  };
}

/**
 * Validate mnemonic phrase
 * Matches CLI validate_mnemonic()
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase());
}

/**
 * Check if input looks like a mnemonic (has 11+ spaces)
 * Matches CLI looks_like_mnemonic()
 */
export function looksLikeMnemonic(input: string): boolean {
  let spaces = 0;
  for (const c of input) {
    if (c === " ") spaces++;
  }
  return spaces >= 11;
}
