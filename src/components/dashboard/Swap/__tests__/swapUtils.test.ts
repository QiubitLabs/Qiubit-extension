import { describe, it, expect } from "vitest";
import { parseUnitsOct, abiEncodeStringUint } from "../swapUtils";

describe("Swap Utilities", () => {
  describe("parseUnitsOct", () => {
    it("should correctly parse integer string to raw units", () => {
      const raw = parseUnitsOct("5");
      expect(raw).toBe("5000000");
    });

    it("should handle fractional parts correctly", () => {
      const raw = parseUnitsOct("5.123");
      expect(raw).toBe("5123000");
    });

    it("should truncate fractional parts longer than decimals", () => {
      const raw = parseUnitsOct("5.123456789");
      expect(raw).toBe("5123456");
    });

    it("should handle comma separation in decimal input", () => {
      const raw = parseUnitsOct("2,5");
      expect(raw).toBe("2500000");
    });

    it("should handle zero integer input with decimals", () => {
      const raw = parseUnitsOct("0.000005");
      expect(raw).toBe("5");
    });
  });

  describe("abiEncodeStringUint", () => {
    it("should properly encode string parameter and uint parameter as ABI hex data", async () => {
      const encoded = await abiEncodeStringUint("hello", "100");

      expect(encoded.slice(0, 64)).toBe(
        "0000000000000000000000000000000000000000000000000000000000000040",
      );

      const uintHex = BigInt("100").toString(16).padStart(64, "0");
      expect(encoded.slice(64, 128)).toBe(uintHex);

      const strLenHex = BigInt("5").toString(16).padStart(64, "0");
      expect(encoded.slice(128, 192)).toBe(strLenHex);

      const expectedStrHex = "68656c6c6f" + "0".repeat(54);
      expect(encoded.slice(192)).toBe(expectedStrHex);
    });
  });
});
