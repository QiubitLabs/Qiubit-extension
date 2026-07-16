import { describe, it, expect } from "vitest";
import { cleanErrorMessage, getFriendlyErrorMessage } from "../errorMessages";

describe("swap/bridge error humanization (LI.FI)", () => {
  it("humanizes 'no available quotes' (no route / new chain like Arc)", () => {
    const msg = cleanErrorMessage(
      new Error("No available quotes for the requested transfer"),
      "Failed to fetch quote.",
    );
    expect(msg.toLowerCase()).toContain("no bridge route is available");
    expect(msg).not.toContain("quotes for the requested transfer");
  });

  it("humanizes 'could not find token' without leaking the raw address", () => {
    const msg = cleanErrorMessage(
      new Error(
        "Could not find token '5042-0x0000000000000000000000000000000000000000'",
      ),
    );
    expect(msg.toLowerCase()).toContain("isn't supported for swaps");
    expect(msg).not.toContain("0x0000");
  });

  it("humanizes an out-of-range amount", () => {
    const msg = cleanErrorMessage(
      new Error(
        "Transferred amount (100000000) out of acceptable range (min: 0, max: 30000000)",
      ),
    );
    expect(msg.toLowerCase()).toContain("amount");
    expect(msg).not.toContain("100000000");
  });

  it("humanizes rate-limit (429) responses", () => {
    const msg = getFriendlyErrorMessage(
      new Error("Request failed with status code 429"),
    );
    expect(msg.toLowerCase()).toContain("busy");
  });

  it("still returns a bounded fallback for unknown errors", () => {
    const msg = cleanErrorMessage(new Error("kaboom zxcv"), "fallback text");
    expect(msg.length).toBeGreaterThan(0);
  });
});
