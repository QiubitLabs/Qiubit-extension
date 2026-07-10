import { describe, it, expect, vi, beforeEach } from "vitest";
import { logActivity } from "../activityLogger";
import { putData } from "../indexedDB";

vi.mock("../indexedDB", () => ({
  putData: vi.fn(),
  getDataByIndex: vi.fn(),
  getAllData: vi.fn(),
  clearStore: vi.fn(),
}));

vi.mock("../storage/adapter", () => ({
  storage: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("../logger", async () => {
  const actual = await vi.importActual("../logger");
  return {
    ...actual,
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
  };
});

describe("ActivityLogger Sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should redact sensitive data before saving", async () => {
    const sensitiveData = {
      wallet: "oct123",
      privateKey: "SECRET_KEY_123", // Should be redacted
      metadata: {
        mnemonic: "apple banana cherry", // Should be redacted
        publicInfo: "safe",
      },
    };

    await logActivity("test_action", sensitiveData);

    expect(putData).toHaveBeenCalledTimes(1);
    const savedLog = (putData as any).mock.calls[0][1];

    expect(savedLog.metadata.wallet).toBe("oct123");
    expect(savedLog.metadata.privateKey).toBe("[REDACTED]");
    expect(savedLog.metadata.metadata.mnemonic).toBe("[REDACTED]");
    expect(savedLog.metadata.metadata.publicInfo).toBe("safe");
  });

  it("should handle circular references or complex objects gracefully", async () => {
    const complex: any = { a: 1 };
    complex.self = complex; // Circular

    await expect(logActivity("test_circular", complex)).resolves.not.toThrow();
  });
});
