/**
 * EIP-1193 provider error + normalization helper shared by every chain
 * provider in the inpage script.
 */

export class ProviderRpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "ProviderRpcError";
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

export function toRpcError(err: unknown): ProviderRpcError {
  if (err instanceof ProviderRpcError) return err;
  if (
    err &&
    typeof err === "object" &&
    typeof (err as any).code === "number"
  ) {
    const e = err as { code: number; message?: string; data?: unknown };
    return new ProviderRpcError(e.code, e.message || "Unknown error", e.data);
  }
  if (err instanceof Error) return new ProviderRpcError(-32603, err.message);
  return new ProviderRpcError(-32603, String(err));
}
