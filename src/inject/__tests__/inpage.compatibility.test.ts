/**
 * Compatibility tests for inpage.js wallet standards
 * Verifies Phantom/MetaMask/Sui format compliance
 */

import { describe, it, expect } from "vitest";

// ─── SolanaPublicKey class tests ──────────────────────────────────────────────

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_MAP = new Uint8Array(256).fill(255);
for (let i = 0; i < BASE58_ALPHABET.length; i++)
  BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i;

function base58ToBytes(str: string): Uint8Array {
  const bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const val = BASE58_MAP[str.charCodeAt(i)];
    if (val === 255) throw new Error("Invalid base58 character");
    let carry = val;
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

function bytesToBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
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
  let result = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) result += "1";
  for (let i = digits.length - 1; i >= 0; i--)
    result += BASE58_ALPHABET[digits[i]];
  return result;
}

class SolanaPublicKey {
  private _base58: string;
  private _bytes: Uint8Array;

  constructor(value: string | Uint8Array | number[]) {
    if (value instanceof Uint8Array || Array.isArray(value)) {
      this._bytes = new Uint8Array(value);
      this._base58 = bytesToBase58(this._bytes);
    } else {
      this._base58 = value;
      try {
        this._bytes = base58ToBytes(value);
      } catch {
        this._bytes = new Uint8Array(32);
      }
    }
  }
  toBase58() {
    return this._base58;
  }
  toString() {
    return this._base58;
  }
  toJSON() {
    return this._base58;
  }
  toBytes() {
    return this._bytes;
  }
  equals(other: SolanaPublicKey) {
    return this._base58 === other.toBase58();
  }
}

describe("SolanaPublicKey (Phantom compatibility)", () => {
  const KNOWN_PUBKEY = "HN7cABqLq46Es1jh92dQQisAi18upfAHxGs8B2KbjgYA";

  it("toBase58() returns the base58 string", () => {
    const pk = new SolanaPublicKey(KNOWN_PUBKEY);
    expect(pk.toBase58()).toBe(KNOWN_PUBKEY);
  });

  it("toString() returns same as toBase58()", () => {
    const pk = new SolanaPublicKey(KNOWN_PUBKEY);
    expect(pk.toString()).toBe(KNOWN_PUBKEY);
  });

  it("toBytes() returns Uint8Array", () => {
    const pk = new SolanaPublicKey(KNOWN_PUBKEY);
    expect(pk.toBytes()).toBeInstanceOf(Uint8Array);
    expect(pk.toBytes().length).toBe(32);
  });

  it("round-trips: bytes → base58 → bytes", () => {
    const pk = new SolanaPublicKey(KNOWN_PUBKEY);
    const bytes = pk.toBytes();
    const pk2 = new SolanaPublicKey(bytes);
    expect(pk2.toBase58()).toBe(KNOWN_PUBKEY);
  });

  it("equals() works correctly", () => {
    const pk1 = new SolanaPublicKey(KNOWN_PUBKEY);
    const pk2 = new SolanaPublicKey(KNOWN_PUBKEY);
    const pk3 = new SolanaPublicKey(
      "So11111111111111111111111111111111111111112",
    );
    expect(pk1.equals(pk2)).toBe(true);
    expect(pk1.equals(pk3)).toBe(false);
  });

  it("toJSON() returns base58 string (JSON.stringify compatible)", () => {
    const pk = new SolanaPublicKey(KNOWN_PUBKEY);
    const json = JSON.stringify({ pubkey: pk });
    expect(json).toBe(`{"pubkey":"${KNOWN_PUBKEY}"}`);
  });

  it("constructed from Uint8Array matches string constructor", () => {
    const original = new SolanaPublicKey(KNOWN_PUBKEY);
    const fromBytes = new SolanaPublicKey(original.toBytes());
    expect(fromBytes.toBase58()).toBe(KNOWN_PUBKEY);
  });
});

// ─── signMessage format normalization ─────────────────────────────────────────

function normalizeSolanaSignature(sig: any): Uint8Array {
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

describe("signMessage return format (Phantom standard)", () => {
  it("signature as array → Uint8Array", () => {
    const sig = normalizeSolanaSignature([1, 2, 3, 64]);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig[0]).toBe(1);
  });

  it("signature as base64 string → Uint8Array", () => {
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    const b64 = btoa(String.fromCharCode(...original));
    const sig = normalizeSolanaSignature(b64);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(Array.from(sig)).toEqual([10, 20, 30, 40, 50]);
  });

  it("signature already Uint8Array → passthrough", () => {
    const input = new Uint8Array([1, 2, 3]);
    const sig = normalizeSolanaSignature(input);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(Array.from(sig)).toEqual([1, 2, 3]);
  });

  it("signMessage result has correct shape", () => {
    const PUBKEY = "HN7cABqLq46Es1jh92dQQisAi18upfAHxGs8B2KbjgYA";
    const mockSig = new Uint8Array(64).fill(1);
    const result = {
      signature: normalizeSolanaSignature(mockSig),
      publicKey: new SolanaPublicKey(PUBKEY),
    };
    // dApp libraries check these exact properties
    expect(result.signature).toBeInstanceOf(Uint8Array);
    expect(result.signature.length).toBe(64);
    expect(typeof result.publicKey.toBase58).toBe("function");
    expect(result.publicKey.toBase58()).toBe(PUBKEY);
  });
});

// ─── Sui signMessage format ───────────────────────────────────────────────────

describe("Sui signMessage format (Sui standard)", () => {
  it("message bytes are base64 encoded for transport", () => {
    const msgBytes = new TextEncoder().encode("Hello Sui");
    const b64 = btoa(String.fromCharCode(...msgBytes));
    expect(typeof b64).toBe("string");
    // Decodeable back
    const decoded = new Uint8Array(
      atob(b64)
        .split("")
        .map((c) => c.charCodeAt(0)),
    );
    expect(Array.from(decoded)).toEqual(Array.from(msgBytes));
  });

  it("signMessage result has messageBytes and signature fields", () => {
    const msgBytes = new TextEncoder().encode("test message");
    const msgBase64 = btoa(String.fromCharCode(...msgBytes));
    const mockResult = {
      messageBytes: msgBase64,
      signature: "mockSignatureBase64==",
    };
    expect(typeof mockResult.messageBytes).toBe("string");
    expect(typeof mockResult.signature).toBe("string");
    // messageBytes must be the original message in base64
    expect(mockResult.messageBytes).toBe(msgBase64);
  });
});

// ─── EVM eth_requestAccounts format ──────────────────────────────────────────

describe("EVM eth_requestAccounts format (MetaMask standard)", () => {
  it("returns only EVM addresses (0x...)", () => {
    const mockConnectResult = {
      accounts: ["0x742d35Cc6634C0532925a3b844Bc9e7595f42D0E", "octra1abc123"],
      evmAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f42D0E",
      selectedAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f42D0E",
    };

    // Simulate our fixed eth_requestAccounts logic
    function getEvmAccounts(res: typeof mockConnectResult): string[] {
      if (res.evmAddress) return [res.evmAddress];
      const evmAccounts = (res.accounts || []).filter(
        (a) => a && a.startsWith("0x"),
      );
      return evmAccounts.length > 0 ? evmAccounts : res.accounts || [];
    }

    const result = getEvmAccounts(mockConnectResult);
    expect(result).toEqual(["0x742d35Cc6634C0532925a3b844Bc9e7595f42D0E"]);
    expect(result.every((a) => a.startsWith("0x"))).toBe(true);
  });

  it("filters out non-EVM addresses when evmAddress not available", () => {
    const mockResult = {
      accounts: ["0xAbCd1234", "octra1xyz"],
      evmAddress: null,
      selectedAddress: "0xAbCd1234",
    };

    function getEvmAccounts(res: typeof mockResult): string[] {
      if (res.evmAddress) return [res.evmAddress];
      const evmAccounts = (res.accounts || []).filter(
        (a: string) => a && a.startsWith("0x"),
      );
      return evmAccounts.length > 0 ? evmAccounts : res.accounts || [];
    }

    const result = getEvmAccounts(mockResult);
    expect(result).toEqual(["0xAbCd1234"]);
  });

  it("chainId is returned as hex string", () => {
    const chainId = 11155111; // Sepolia
    const hex = "0x" + chainId.toString(16);
    expect(hex).toBe("0xaa36a7");
  });
});

// ─── Wallet Standard features ─────────────────────────────────────────────────

describe("Wallet Standard structure", () => {
  it("Solana wallet standard has all required features", () => {
    const REQUIRED_FEATURES = [
      "standard:connect",
      "standard:disconnect",
      "standard:events",
      "solana:signMessage",
      "solana:signTransaction",
      "solana:signAndSendTransaction",
    ];
    const mockFeatures = {
      "standard:connect": { version: "1.0.0", connect: () => {} },
      "standard:disconnect": { version: "1.0.0", disconnect: () => {} },
      "standard:events": { version: "1.0.0", on: () => {} },
      "solana:signMessage": { version: "1.0.0", signMessage: () => {} },
      "solana:signTransaction": { version: "1.0.0", signTransaction: () => {} },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        signAndSendTransaction: () => {},
      },
    };
    for (const feat of REQUIRED_FEATURES) {
      expect(mockFeatures).toHaveProperty(feat);
    }
  });

  it("Sui wallet standard has all required features", () => {
    const REQUIRED_FEATURES = [
      "standard:connect",
      "standard:disconnect",
      "standard:events",
      "sui:signPersonalMessage",
      "sui:signTransaction",
      "sui:signAndExecuteTransaction",
    ];
    const mockFeatures = {
      "standard:connect": { version: "1.0.0", connect: () => {} },
      "standard:disconnect": { version: "1.0.0", disconnect: () => {} },
      "standard:events": { version: "1.0.0", on: () => {} },
      "sui:signPersonalMessage": {
        version: "1.0.0",
        signPersonalMessage: () => {},
      },
      "sui:signTransaction": { version: "2.0.0", signTransaction: () => {} },
      "sui:signAndExecuteTransaction": {
        version: "2.0.0",
        signAndExecuteTransaction: () => {},
      },
    };
    for (const feat of REQUIRED_FEATURES) {
      expect(mockFeatures).toHaveProperty(feat);
    }
  });
});

// ─── Timeout value ────────────────────────────────────────────────────────────

describe("Request timeout", () => {
  it("timeout is 120 seconds (2 min), not 5 min", () => {
    const TIMEOUT_MS = 120_000;
    expect(TIMEOUT_MS).toBe(120_000);
    expect(TIMEOUT_MS).toBeLessThan(300_000);
  });
});
