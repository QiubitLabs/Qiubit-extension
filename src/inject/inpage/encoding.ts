/**
 * Byte/string codecs used across the inpage providers: base58 (Solana keys),
 * base64 transport encoding, Solana tx serialization for the message pipeline,
 * and the SolanaPublicKey shim that mimics @solana/web3.js PublicKey.
 */

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Uint8Array(256).fill(255);
for (let i = 0; i < BASE58_ALPHABET.length; i++)
  BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i;

export function base58ToBytes(str: string): Uint8Array {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const val = BASE58_MAP[str.charCodeAt(i)];
    if (val === 255) throw new Error("Invalid base58 character");
    let carry: number = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === "1"; i++) bytes.push(0);
  return new Uint8Array(bytes.reverse());
}

export function bytesToBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry: number = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += "1";
  for (let i = digits.length - 1; i >= 0; i--) str += BASE58_ALPHABET[digits[i]];
  return str;
}

export function base64ToBytes(str: string): Uint8Array {
  try {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Serialize a Solana transaction (Transaction / VersionedTransaction object,
 * Uint8Array, number[], or already-base64 string) to a base64 string. This is
 * critical: a raw Uint8Array is corrupted when it crosses the extension
 * message pipeline (JSON), causing "Reached end of buffer" on the signer.
 */
export function solTxToBase64(tx: any): any {
  if (tx == null) return tx;
  if (typeof tx === "string") return tx; // assume base64 already
  if (tx instanceof Uint8Array) return bytesToBase64(tx);
  if (Array.isArray(tx)) return bytesToBase64(new Uint8Array(tx));
  if (typeof tx.serialize === "function") {
    let bytes: Uint8Array;
    try {
      // legacy Transaction (unsigned) needs these flags
      bytes = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
    } catch {
      // VersionedTransaction.serialize() takes no args
      bytes = tx.serialize();
    }
    return bytesToBase64(
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    );
  }
  return tx;
}

/**
 * Coerce any signed-tx / signature value from the background into raw bytes,
 * which is what @solana/wallet-standard requires.
 */
export function toUint8(value: any): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  if (value && typeof value === "object") {
    const keys = Object.keys(value)
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    if (keys.length) return new Uint8Array(keys.map((k) => value[k]));
  }
  if (typeof value === "string") {
    // base64 first (signed tx), then base58 (signature)
    const b64 = base64ToBytes(value);
    if (b64.length) return b64;
    try {
      return base58ToBytes(value);
    } catch {
      return new Uint8Array(0);
    }
  }
  return new Uint8Array(0);
}

/** Normalize a signature from the backend (base64 | number[] | bytes) → bytes. */
export function normalizeSolanaSignature(sig: any): Uint8Array {
  if (sig instanceof Uint8Array) return sig;
  if (Array.isArray(sig)) return new Uint8Array(sig);
  if (typeof sig === "string") {
    try {
      const bin = atob(sig);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return new Uint8Array(0);
    }
  }
  return new Uint8Array(0);
}

/**
 * Mimics @solana/web3.js PublicKey — dApp libraries call .toBase58(),
 * .toBuffer(), .toString(), .equals().
 */
export class SolanaPublicKey {
  private _base58: string;
  private _bytes: Uint8Array;

  constructor(value: SolanaPublicKey | Uint8Array | number[] | string) {
    if (value instanceof SolanaPublicKey) {
      this._base58 = value._base58;
      this._bytes = value._bytes;
    } else if (value instanceof Uint8Array || Array.isArray(value)) {
      this._bytes = new Uint8Array(value);
      this._base58 = bytesToBase58(this._bytes);
    } else if (typeof value === "string") {
      this._base58 = value;
      try {
        this._bytes = base58ToBytes(value);
      } catch {
        this._bytes = new Uint8Array(32);
      }
    } else {
      throw new Error("SolanaPublicKey: invalid input");
    }
  }
  toBase58(): string {
    return this._base58;
  }
  toString(): string {
    return this._base58;
  }
  toJSON(): string {
    return this._base58;
  }
  toBuffer(): Uint8Array {
    // Buffer isn't polyfilled in page context; return a Buffer only when the
    // host page provides one, otherwise the raw bytes (duck-compatible).
    return typeof Buffer !== "undefined" ? Buffer.from(this._bytes) : this._bytes;
  }
  toBytes(): Uint8Array {
    return this._bytes;
  }
  equals(other: SolanaPublicKey | Uint8Array | number[] | string): boolean {
    const o = other instanceof SolanaPublicKey ? other : new SolanaPublicKey(other);
    return this._base58 === o._base58;
  }
}
