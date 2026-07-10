/**
 * LOGIC: Injects runtime polyfills for the browser and testing environments, globally mounting Node's Buffer and TextEncoder/TextDecoder helper structures.
 * EXPORTS:
 *   - None
 */

import { Buffer } from "buffer";

globalThis.Buffer = Buffer;

if (typeof globalThis.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}
