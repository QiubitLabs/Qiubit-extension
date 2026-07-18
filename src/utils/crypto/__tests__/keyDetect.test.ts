import { describe, it, expect } from "vitest";
import { detectPrivateKey } from "../keyDetect";
import { base58Encode, bufferToBase64 } from "../format";
import { validateMnemonic, looksLikeMnemonic } from "../keys";

const HEX_64 =
  "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("detectPrivateKey — format detection", () => {
  it("detects EVM 0x-prefixed hex", () => {
    const detected = detectPrivateKey("0x" + HEX_64);
    expect(detected?.id).toBe("evm-hex");
    expect(detected?.key.length).toBe(32);
  });

  it("detects raw 64-char hex without prefix", () => {
    const detected = detectPrivateKey(HEX_64);
    expect(detected?.id).toBe("raw-hex");
    expect(detected?.key.length).toBe(32);
  });

  it("detects 128-char hex keypair and keeps the first 32 bytes", () => {
    const detected = detectPrivateKey(HEX_64 + HEX_64);
    expect(detected?.id).toBe("hex-keypair");
    expect(detected?.key.length).toBe(32);
  });

  it("detects Bitcoin WIF (compressed)", () => {
    // canonical WIF for private key 0x...01
    const wif = "KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn";
    const detected = detectPrivateKey(wif);
    expect(detected?.id).toBe("bitcoin-wif");
    expect(detected?.key.length).toBe(32);
    expect(detected?.key[31]).toBe(1);
  });

  it("detects Solana 64-byte keypair in base58", () => {
    const keypair = new Uint8Array(64).fill(7);
    const detected = detectPrivateKey(base58Encode(keypair));
    expect(detected?.id).toBe("solana-keypair-b58");
    expect(detected?.key.length).toBe(32);
  });

  it("detects bare 32-byte Solana secret in base58", () => {
    const seed = new Uint8Array(32).fill(9);
    const detected = detectPrivateKey(base58Encode(seed));
    expect(detected?.id).toBe("solana-seed-b58");
    expect(detected?.key).toEqual(seed);
  });

  it("detects Sui suiprivkey bech32", () => {
    const detected = detectPrivateKey("suiprivkey1" + "q".repeat(59));
    expect(detected?.id).toBe("sui-bech32");
    expect(detected?.key.length).toBe(32);
  });

  it("detects Octra base64 32-byte key", () => {
    const key = new Uint8Array(32).fill(3);
    const detected = detectPrivateKey(bufferToBase64(key));
    expect(detected?.id).toBe("octra-base64");
    expect(detected?.key).toEqual(key);
  });

  it("ignores surrounding whitespace", () => {
    const detected = detectPrivateKey("  0x" + HEX_64 + "\n");
    expect(detected?.id).toBe("evm-hex");
  });

  it("returns null for unrecognized input", () => {
    expect(detectPrivateKey("")).toBeNull();
    expect(detectPrivateKey("hello world")).toBeNull();
    expect(detectPrivateKey("0x1234")).toBeNull();
  });
});

describe("mnemonic input normalization", () => {
  const PHRASE = "test test test test test test test test test test test junk";

  it("validates a phrase pasted with newlines", () => {
    expect(validateMnemonic(PHRASE.replace(/ /g, "\n"))).toBe(true);
  });

  it("validates a phrase with double spaces and mixed case", () => {
    expect(validateMnemonic(PHRASE.toUpperCase().replace(/ /g, "  "))).toBe(
      true,
    );
  });

  it("rejects an invalid phrase", () => {
    expect(validateMnemonic("foo bar baz")).toBe(false);
  });

  it("looksLikeMnemonic accepts newline-separated words", () => {
    expect(looksLikeMnemonic(PHRASE.replace(/ /g, "\n"))).toBe(true);
    expect(looksLikeMnemonic("just a few words")).toBe(false);
  });
});
