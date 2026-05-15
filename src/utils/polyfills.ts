
import { Buffer } from 'buffer';

// Polyfill Buffer for the browser/test environment
globalThis.Buffer = Buffer;

// Polyfill TextEncoder/TextDecoder if missing (jsdom usually has them, but safety first)
if (typeof globalThis.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('util');
    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder;
}
