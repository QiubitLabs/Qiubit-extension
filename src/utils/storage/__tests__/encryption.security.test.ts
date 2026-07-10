/**
 * Security tests for encryption module
 * Covers: HMAC integrity enforcement, vault format hardening, key derivation
 */

import { describe, it, expect } from "vitest";
import { encryptDataSecure, decryptDataSecure } from "../encryption";

const PASSWORD = "TestP@ssw0rd_Secure!";
const WRONG_PASSWORD = "WrongP@ssw0rd!";
const TEST_PAYLOAD = {
  wallets: [{ address: "oct1abc", privateKeyB64: "c2VjcmV0S2V5QmFzZTY0" }],
};

describe("HMAC integrity — hard fail", () => {
  it("throws when HMAC is tampered (v4)", async () => {
    const encrypted = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);
    const tampered = {
      ...encrypted,
      hmac: "X" + encrypted.hmac.slice(1),
    };

    await expect(decryptDataSecure(tampered as any, PASSWORD)).rejects.toThrow(
      /integrity|HMAC/i,
    );
  });

  it("throws when HMAC is entirely replaced (v4)", async () => {
    const encrypted = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);
    const tampered = {
      ...encrypted,
      hmac: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=",
    };

    await expect(decryptDataSecure(tampered as any, PASSWORD)).rejects.toThrow(
      /integrity|HMAC/i,
    );
  });

  it("throws when ciphertext is tampered (v4)", async () => {
    const encrypted = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);
    const dataBytes = atob(encrypted.data);
    const idx = Math.floor(dataBytes.length / 2);
    const tamperedBytes =
      dataBytes.slice(0, idx) +
      String.fromCharCode(dataBytes.charCodeAt(idx) ^ 0xff) +
      dataBytes.slice(idx + 1);
    const tampered = { ...encrypted, data: btoa(tamperedBytes) };

    await expect(decryptDataSecure(tampered as any, PASSWORD)).rejects.toThrow(
      /integrity|HMAC|Decryption/i,
    );
  });

  it("throws when salt is replaced (v4)", async () => {
    const encrypted = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);
    const fakeSalt = btoa(
      String.fromCharCode(...new Uint8Array(16).fill(0xab)),
    );
    const tampered = { ...encrypted, salt: fakeSalt };

    await expect(decryptDataSecure(tampered as any, PASSWORD)).rejects.toThrow(
      /integrity|HMAC|Decryption/i,
    );
  });

  it("does NOT silently succeed on wrong password — must throw", async () => {
    const encrypted = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);

    await expect(
      decryptDataSecure(encrypted as any, WRONG_PASSWORD),
    ).rejects.toThrow();
  });
});

describe("Encrypt / Decrypt round-trip", () => {
  it("correctly decrypts v4 vault with correct password", async () => {
    const encrypted = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);
    const result = await decryptDataSecure(encrypted as any, PASSWORD);
    expect(result).toEqual(TEST_PAYLOAD);
  });

  it("produces different ciphertext each encrypt call (random salt + IV)", async () => {
    const enc1 = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);
    const enc2 = await encryptDataSecure(TEST_PAYLOAD, PASSWORD);
    expect(enc1.data).not.toBe(enc2.data);
    expect(enc1.salt).not.toBe(enc2.salt);
  });

  it("encrypts and decrypts large payloads", async () => {
    const largePayload = {
      wallets: Array.from({ length: 50 }, (_, i) => ({
        address: `oct${i}`,
        privateKeyB64: btoa("x".repeat(32)),
      })),
    };
    const encrypted = await encryptDataSecure(largePayload, PASSWORD);
    const result = await decryptDataSecure(encrypted as any, PASSWORD);
    expect(result).toEqual(largePayload);
  });
});

describe("Key derivation properties", () => {
  it("v4 vault stores a salt field (random per-vault)", async () => {
    const enc = await encryptDataSecure({ test: true }, PASSWORD);
    expect(enc).toHaveProperty("salt");
    expect(typeof enc.salt).toBe("string");
    const saltBytes = atob(enc.salt);
    expect(saltBytes.length).toBeGreaterThanOrEqual(16);
  });

  it("v4 vault has version field set to 4", async () => {
    const enc = await encryptDataSecure({ test: true }, PASSWORD);
    expect(enc).toHaveProperty("version", 4);
  });

  it("v4 vault stores algorithm and iterations metadata", async () => {
    const enc = await encryptDataSecure({ test: true }, PASSWORD);
    expect(enc).toHaveProperty("algorithm");
    expect(typeof (enc as any).algorithm).toBe("string");
    expect(enc).toHaveProperty("iterations");
    expect((enc as any).iterations).toBeGreaterThanOrEqual(100_000);
  });
});

describe("HMAC bypass regression", () => {
  it("does NOT return data when HMAC fails — regression for soft-warning bypass", async () => {
    const encrypted = await encryptDataSecure({ secret: "value" }, PASSWORD);
    const tampered = { ...encrypted, hmac: "invalid_hmac_value==" };

    let result: any;
    try {
      result = await decryptDataSecure(tampered as any, PASSWORD);
    } catch {
      result = null; // expected: must throw
    }

    expect(result).toBeNull();
  });
});
