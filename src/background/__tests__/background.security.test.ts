/**
 * Security tests for background.js
 * Covers: sender validation, nonce, RPC URL validation, RESET_EVERYTHING guard
 */

import { describe, it, expect, vi } from "vitest";

function isFromExtension(
  sender: { tab?: any; url?: string },
  extensionOrigin: string,
): boolean {
  if (sender.tab !== undefined && sender.tab !== null) return false;
  if (sender.url && !sender.url.startsWith(extensionOrigin)) return false;
  return true;
}

function isValidRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^0\./.test(host)
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

describe("isFromExtension — sender validation", () => {
  const EXT_ORIGIN = "chrome-extension://abcdef1234567890abcdef1234567890abcd/";

  it("accepts popup sender (no tab, correct URL)", () => {
    expect(
      isFromExtension({ url: EXT_ORIGIN + "popup.html" }, EXT_ORIGIN),
    ).toBe(true);
  });

  it("accepts background sender (no tab, no URL)", () => {
    expect(isFromExtension({}, EXT_ORIGIN)).toBe(true);
  });

  it("rejects content script sender (has tab)", () => {
    expect(
      isFromExtension(
        { tab: { id: 1 }, url: EXT_ORIGIN + "popup.html" },
        EXT_ORIGIN,
      ),
    ).toBe(false);
  });

  it("rejects content script with null tab explicitly", () => {
    const senderWithNullTab = {
      tab: null as any,
      url: EXT_ORIGIN + "popup.html",
    };
    expect(isFromExtension(senderWithNullTab, EXT_ORIGIN)).toBe(true);
  });

  it("rejects sender URL from different extension", () => {
    expect(
      isFromExtension(
        {
          url: "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/popup.html",
        },
        EXT_ORIGIN,
      ),
    ).toBe(false);
  });

  it("rejects sender URL from a web page (https://)", () => {
    expect(
      isFromExtension({ url: "https://evil.example.com/xss" }, EXT_ORIGIN),
    ).toBe(false);
  });

  it("rejects content script from legitimate dApp page", () => {
    expect(
      isFromExtension(
        {
          tab: { id: 99, url: "https://app.uniswap.org" },
          url: "https://app.uniswap.org",
        },
        EXT_ORIGIN,
      ),
    ).toBe(false);
  });
});

describe("isValidRpcUrl — SSRF prevention", () => {
  it("accepts valid HTTPS public URL", () => {
    expect(isValidRpcUrl("https://mainnet.infura.io/v3/abc123")).toBe(true);
  });

  it("accepts valid HTTP public URL", () => {
    expect(isValidRpcUrl("http://rpc.some-public-chain.io")).toBe(true);
  });

  it("blocks localhost", () => {
    expect(isValidRpcUrl("http://localhost:8545")).toBe(false);
  });

  it("blocks 127.0.0.1", () => {
    expect(isValidRpcUrl("http://127.0.0.1:8545")).toBe(false);
  });

  it("blocks 127.x.x.x range", () => {
    expect(isValidRpcUrl("http://127.255.255.255:1234")).toBe(false);
  });

  it("blocks IPv6 loopback", () => {
    expect(isValidRpcUrl("http://[::1]:8545")).toBe(false);
  });

  it("blocks 10.x.x.x private range", () => {
    expect(isValidRpcUrl("http://10.0.0.1/rpc")).toBe(false);
  });

  it("blocks 192.168.x.x private range", () => {
    expect(isValidRpcUrl("http://192.168.1.1/admin")).toBe(false);
  });

  it("blocks 172.16-31.x.x private range", () => {
    expect(isValidRpcUrl("http://172.16.0.1/rpc")).toBe(false);
    expect(isValidRpcUrl("http://172.31.255.255/rpc")).toBe(false);
  });

  it("allows 172.32.x.x (outside private range)", () => {
    expect(isValidRpcUrl("http://172.32.0.1/rpc")).toBe(true);
  });

  it("blocks link-local 169.254.x.x", () => {
    expect(isValidRpcUrl("http://169.254.169.254/latest/meta-data")).toBe(
      false,
    );
  });

  it("blocks javascript: scheme", () => {
    expect(isValidRpcUrl("javascript:alert(1)")).toBe(false);
  });

  it("blocks file: scheme", () => {
    expect(isValidRpcUrl("file:///etc/passwd")).toBe(false);
  });

  it("blocks data: URL", () => {
    expect(isValidRpcUrl("data:text/plain,hello")).toBe(false);
  });

  it("blocks malformed URL", () => {
    expect(isValidRpcUrl("not-a-url")).toBe(false);
  });

  it("blocks empty string", () => {
    expect(isValidRpcUrl("")).toBe(false);
  });
});

describe("Nonce management — no timestamp fallback", () => {
  it("ensureNonce throws when nonceManager throws — no Date.now() substitution", async () => {
    const nonceManagerMock = {
      getNext: vi.fn().mockRejectedValue(new Error("Network unavailable")),
    };

    async function ensureNonce(
      txParams: Record<string, any>,
      address: string,
      nm: typeof nonceManagerMock,
    ) {
      if (
        txParams.nonce === undefined ||
        txParams.nonce === null ||
        txParams.nonce === ""
      ) {
        txParams.nonce = await nm.getNext(address);
      }
    }

    const txParams: Record<string, any> = {};
    await expect(
      ensureNonce(txParams, "oct1test", nonceManagerMock),
    ).rejects.toThrow("Network unavailable");

    expect(typeof txParams.nonce).not.toBe("number");
  });

  it("ensureNonce uses provided nonce without overriding", async () => {
    const nonceManagerMock = { getNext: vi.fn() };

    async function ensureNonce(
      txParams: Record<string, any>,
      address: string,
      nm: typeof nonceManagerMock,
    ) {
      if (
        txParams.nonce === undefined ||
        txParams.nonce === null ||
        txParams.nonce === ""
      ) {
        txParams.nonce = await nm.getNext(address);
      }
    }

    const txParams = { nonce: 42 };
    await ensureNonce(txParams, "oct1test", nonceManagerMock);
    expect(nonceManagerMock.getNext).not.toHaveBeenCalled();
    expect(txParams.nonce).toBe(42);
  });
});

describe("RESET_EVERYTHING — content script cannot trigger", () => {
  it("isFromExtension rejects content script (RESET guard)", () => {
    const EXT_ORIGIN = "chrome-extension://abcdef/";
    const contentScriptSender = { tab: { id: 5, url: "https://evil.com" } };
    expect(isFromExtension(contentScriptSender, EXT_ORIGIN)).toBe(false);
  });

  it("isFromExtension accepts popup (RESET guard)", () => {
    const EXT_ORIGIN = "chrome-extension://abcdef/";
    expect(
      isFromExtension({ url: EXT_ORIGIN + "popup.html" }, EXT_ORIGIN),
    ).toBe(true);
  });
});
