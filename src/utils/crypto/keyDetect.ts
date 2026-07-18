/**
 * LOGIC: Lightweight private-key format detection shared by the import UIs
 * (live "Detected: …" badge) and by normalizePrivateKeyInput in keys.ts.
 * Deliberately depends only on format.ts so UI code can import it statically
 * without dragging heavy crypto deps (ethers, bip39) into the initial bundle.
 * EXPORTS:
 *   - DetectedKey (interface)
 *   - detectPrivateKey (function)
 * FUNCTIONS:
 *   - detectPrivateKey(input): Identifies the key format (Sui bech32, Bitcoin
 *     WIF, Solana base58 keypair/seed, EVM/raw hex, 64-byte hex keypair,
 *     Octra base64) and extracts the normalized 32-byte seed. Returns null
 *     when the input matches no supported format. Detection order mirrors the
 *     historical normalizePrivateKeyInput order so behavior is unchanged.
 */

import { base58Decode, hexToBuffer, base64ToBuffer } from "./format";

export interface DetectedKey {
  /** Stable identifier for programmatic use. */
  id:
    | "sui-bech32"
    | "bitcoin-wif"
    | "solana-keypair-b58"
    | "evm-hex"
    | "raw-hex"
    | "hex-keypair"
    | "solana-seed-b58"
    | "octra-base64";
  /** Human-readable label shown in the import UI. */
  label: string;
  /** Normalized 32-byte private key / seed. */
  key: Uint8Array;
}

function decodeSuiBech32(clean: string): Uint8Array | null {
  try {
    const b32chars = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const data = clean.slice(11).toLowerCase();
    const decoded: number[] = [];
    for (const ch of data.slice(0, -6)) {
      const v = b32chars.indexOf(ch);
      if (v < 0) return null;
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
  return null;
}

/**
 * Detect the format of a pasted private key and extract the 32-byte seed.
 * Returns null for unrecognized input. Order matters: more specific formats
 * are tried before generic hex/base64 fallbacks.
 */
export function detectPrivateKey(input: string): DetectedKey | null {
  if (!input) return null;
  let clean = input.replace(/\s+/g, "");
  if (!clean) return null;

  if (clean.toLowerCase().startsWith("suiprivkey1")) {
    const key = decodeSuiBech32(clean);
    if (key) return { id: "sui-bech32", label: "Sui (suiprivkey)", key };
  }

  if (/^[5KL][1-9A-HJ-NP-Za-km-z]{50,52}$/.test(clean)) {
    try {
      const decoded = base58Decode(clean);
      if (decoded.length >= 37) {
        return {
          id: "bitcoin-wif",
          label: "Bitcoin (WIF)",
          key: new Uint8Array(decoded.slice(1, 33)),
        };
      }
    } catch (_) {
      /* fall through */
    }
  }

  if (/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(clean)) {
    try {
      const decoded = base58Decode(clean);
      if (decoded.length >= 32) {
        return {
          id: "solana-keypair-b58",
          label: "Solana keypair (Base58)",
          key: new Uint8Array(decoded.slice(0, 32)),
        };
      }
    } catch (_) {
      /* fall through */
    }
  }

  const hadHexPrefix = clean.startsWith("0x") || clean.startsWith("0X");
  const hex = hadHexPrefix ? clean.substring(2) : clean;

  if (/^[a-fA-F0-9]{64}$/.test(hex)) {
    return {
      id: hadHexPrefix ? "evm-hex" : "raw-hex",
      label: hadHexPrefix ? "EVM (0x hex)" : "Raw hex (EVM / any chain)",
      key: new Uint8Array(hexToBuffer(hex)),
    };
  }

  if (/^[a-fA-F0-9]{128}$/.test(hex)) {
    return {
      id: "hex-keypair",
      label: "Hex keypair (64-byte)",
      key: new Uint8Array(hexToBuffer(hex).slice(0, 32)),
    };
  }

  // Bare 32-byte Solana secret in base58 (~43-44 chars). Tried before the
  // base64 fallback: a real base64 32-byte key carries '='/'+'/'/' padding
  // that the base58 charset excludes, so Octra base64 keys are not shadowed.
  if (/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(clean)) {
    try {
      const decoded = base58Decode(clean);
      if (decoded.length === 32) {
        return {
          id: "solana-seed-b58",
          label: "Solana secret (Base58)",
          key: new Uint8Array(decoded),
        };
      }
    } catch (_) {
      /* fall through */
    }
  }

  try {
    const decoded = base64ToBuffer(clean);
    if (decoded.length >= 64) {
      return {
        id: "octra-base64",
        label: "Octra (Base64 keypair)",
        key: new Uint8Array(decoded.slice(0, 32)),
      };
    }
    if (decoded.length === 32) {
      return {
        id: "octra-base64",
        label: "Octra (Base64)",
        key: new Uint8Array(decoded),
      };
    }
  } catch (_) {
    /* fall through */
  }

  return null;
}
