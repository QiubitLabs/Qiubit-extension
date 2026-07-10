/**
 * LOGIC: Implements the OSM-1 (Qiubit Signed Message Standard) formatting, serializing, signing payload validation, and signature verification for the Octra network.
 * Also provides amount conversion utility routines (OCT to micro-OCT) and OSM-1 transaction payload helper builders.
 * EXPORTS:
 *   - OSM_VERSION (const string)
 *   - MESSAGE_PREFIX (const string)
 *   - OSM1Payload (interface)
 *   - VerifyResponse (interface)
 *   - TransactionPayload (interface)
 *   - base64ToUint8Array (function)
 *   - uint8ArrayToBase64 (function)
 *   - base58Encode (re-export function)
 *   - sha256 (async function)
 *   - bufferToHex (function)
 *   - serializePayload (function)
 *   - createSigningMessage (function)
 *   - createOSM1Payload (function)
 *   - verifyOSM1Signature (async function)
 *   - octToMicro (function)
 *   - microToOct (function)
 *   - createTransactionPayload (function)
 * FUNCTIONS:
 *   - base64ToUint8Array / uint8ArrayToBase64 / bufferToHex: Type conversion buffers and base64.
 *   - sha256(data): Hashes byte arrays.
 *   - serializePayload(payload): Serializes JSON properties in sorted alphabetical key order.
 *   - createSigningMessage(payload): Prefixes serialized JSON with message length and standard prefix "\x19Qiubit Signed Message:\n".
 *   - createOSM1Payload(options): Assembles standard OSM1 parameters (version, message, address, uuid nonce, timestamp).
 *   - verifyOSM1Signature(response, nacl, options): Decodes signature and public key, runs TweetNaCl verification, evaluates address match, domain match, and expiry.
 *   - octToMicro(oct): Converts standard token balance units to micro-units (10^6) using string positioning.
 *   - microToOct(micro): Converts micro-units to decimal representation.
 *   - createTransactionPayload(options): Generates transaction payload fields with basic fee (OU) heuristics (1 or 3).
 */

import {
  base58Encode,
  sha256 as cryptoSha256,
  bufferToHex as cryptoBufferToHex,
  base64ToBuffer,
  bufferToBase64,
} from "../crypto";

export const OSM_VERSION = "OSM-1";
export const MESSAGE_PREFIX = "\x19Qiubit Signed Message:\n";

export interface OSM1Payload {
  version: string;
  message: string;
  address: string;
  domain: string;
  nonce: string;
  timestamp: number;
  chainId?: number;
  expiresAt?: number;
}

export interface VerifyResponse {
  valid: boolean;
  validations?: {
    signatureValid: boolean;
    versionValid: boolean;
    domainMatch: boolean;
    notExpired: boolean;
    addressMatch: boolean;
  };
  error?: string;
}

export interface TransactionPayload {
  from: string;
  to_: string;
  amount: string; // Micro units as string
  nonce: number;
  ou: string;
  timestamp: number;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(base64ToBuffer(base64));
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  return bufferToBase64(bytes);
}

export { base58Encode };

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buffer = await cryptoSha256(data);
  return new Uint8Array(buffer);
}

export function bufferToHex(buffer: Uint8Array): string {
  return cryptoBufferToHex(buffer);
}

export function serializePayload(payload: any): string {
  const sortedKeys = Object.keys(payload).sort();
  const sortedPayload: any = {};
  for (const key of sortedKeys) {
    if (payload[key] !== undefined) {
      sortedPayload[key] = payload[key];
    }
  }
  return JSON.stringify(sortedPayload);
}

export function createSigningMessage(payload: any): string {
  const serialized = serializePayload(payload);
  return MESSAGE_PREFIX + serialized.length.toString() + "\n" + serialized;
}

export function createOSM1Payload(options: {
  message: string;
  address: string;
  domain?: string;
  chainId?: number;
  expiresIn?: number;
}): OSM1Payload {
  const { message, address, domain, chainId, expiresIn } = options;

  const payload: OSM1Payload = {
    version: OSM_VERSION,
    message,
    address,
    domain: domain || "unknown",
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  if (chainId !== undefined) {
    payload.chainId = chainId;
  }

  if (expiresIn) {
    payload.expiresAt = Date.now() + expiresIn;
  }

  return payload;
}

export async function verifyOSM1Signature(
  response: {
    payload: OSM1Payload;
    signature: string;
    publicKey: string;
    address: string;
  },
  nacl: any,
  options: { expectedDomain?: string; checkExpiry?: boolean } = {},
): Promise<VerifyResponse> {
  try {
    const { expectedDomain, checkExpiry = true } = options;

    const signedMessage = createSigningMessage(response.payload);
    const messageBytes = new TextEncoder().encode(signedMessage);

    const signature = base64ToUint8Array(response.signature);
    const publicKey = base64ToUint8Array(response.publicKey);

    const signatureValid = nacl.sign.detached.verify(
      messageBytes,
      signature,
      publicKey,
    );
    const versionValid = response.payload.version === OSM_VERSION;
    const domainMatch =
      !expectedDomain || response.payload.domain === expectedDomain;
    const notExpired =
      !checkExpiry ||
      !response.payload.expiresAt ||
      Date.now() < response.payload.expiresAt!;

    const publicKeyHash = await sha256(publicKey);
    const expectedAddress = "oct" + base58Encode(publicKeyHash);
    const addressMatch = expectedAddress === response.address;

    return {
      valid:
        signatureValid &&
        versionValid &&
        domainMatch &&
        notExpired &&
        addressMatch,
      validations: {
        signatureValid,
        versionValid,
        domainMatch,
        notExpired: Boolean(notExpired),
        addressMatch,
      },
    };
  } catch (error: any) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

const MICRO_UNITS = 1_000_000;

export function octToMicro(oct: string | number): string {
  const str = oct.toString();
  const parts = str.split(".");
  const intPart = parts[0];
  let fracPart = parts[1] || "";
  fracPart = fracPart.padEnd(6, "0").substring(0, 6);
  const result = (intPart + fracPart).replace(/^0+/, "") || "0";
  return result;
}

export function microToOct(micro: string | number): number {
  const num = BigInt(micro);
  return Number(num) / MICRO_UNITS;
}

export function createTransactionPayload(options: {
  from: string;
  to: string;
  amount: string | number;
  nonce: number;
  message?: string;
}) {
  const { from, to, amount, nonce, message } = options;

  const amountMicro = typeof amount === "string" ? amount : octToMicro(amount);
  const amountNum = typeof amount === "string" ? microToOct(amount) : amount;

  const payload: TransactionPayload = {
    from,
    to_: to,
    amount: amountMicro,
    nonce: Number(nonce),
    ou: amountNum < 1000 ? "1" : "3",
    timestamp: Date.now() / 1000,
  };

  return { payload, message };
}
