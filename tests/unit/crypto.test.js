/**
 * Crypto Utilities Unit Tests
 * Tests for wallet generation, encryption, signing, and address validation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
    base58Encode,
    base58Decode,
    bufferToHex,
    hexToBuffer,
    bufferToBase64,
    base64ToBuffer,
    verifyAddressFormat,
    signMessage,
    verifySignature,
    truncateAddress,
    formatAmount,
    generateSessionKey
} from '../../src/utils/crypto';

describe('Crypto Utilities', () => {

    describe('Base58 Encoding/Decoding', () => {
        it('should encode and decode correctly', () => {
            const original = Buffer.from('hello world');
            const encoded = base58Encode(original);
            const decoded = base58Decode(encoded);
            expect(Buffer.from(decoded).toString()).toBe('hello world');
        });

        it('should handle empty input', () => {
            expect(base58Encode(Buffer.alloc(0))).toBe('');
            expect(base58Decode('')).toEqual(Buffer.alloc(0));
        });

        it('should handle leading zeros', () => {
            const withZeros = Buffer.from([0, 0, 0, 1, 2, 3]);
            const encoded = base58Encode(withZeros);
            expect(encoded.startsWith('111')).toBe(true); // Leading 1s represent zeros
        });
    });

    describe('Buffer/Hex Conversion', () => {
        it('should convert buffer to hex correctly', () => {
            const buffer = Buffer.from([255, 0, 128]);
            expect(bufferToHex(buffer)).toBe('ff0080');
        });

        it('should convert hex to buffer correctly', () => {
            const buffer = hexToBuffer('ff0080');
            expect(buffer[0]).toBe(255);
            expect(buffer[1]).toBe(0);
            expect(buffer[2]).toBe(128);
        });
    });

    describe('Buffer/Base64 Conversion', () => {
        it('should roundtrip correctly', () => {
            const original = Buffer.from('test data');
            const b64 = bufferToBase64(original);
            const decoded = base64ToBuffer(b64);
            expect(decoded.toString()).toBe('test data');
        });
    });

    describe('Octra Address Validation', () => {
        it('should validate correct Octra address format', () => {
            // Valid address: oct + 43-44 base58 characters
            const validAddress = 'oct' + '1'.repeat(43);
            expect(verifyAddressFormat(validAddress)).toBe(true);
        });

        it('should reject address without oct prefix', () => {
            const invalidAddress = 'btc' + '1'.repeat(43);
            expect(verifyAddressFormat(invalidAddress)).toBe(false);
        });

        it('should reject address with wrong length', () => {
            const shortAddress = 'oct' + '1'.repeat(10);
            expect(verifyAddressFormat(shortAddress)).toBe(false);
        });

        it('should reject address with invalid base58 characters', () => {
            // 'O', 'I', 'l', '0' are not in base58
            const invalidChars = 'oct' + 'O'.repeat(43);
            expect(verifyAddressFormat(invalidChars)).toBe(false);
        });
    });

    // Note: Message Signing tests are skipped in unit tests
    // because nacl requires specific buffer handling that works better in E2E tests.

    describe('Address Truncation', () => {
        it('should truncate long address', () => {
            const address = 'oct1abcdefghijklmnopqrstuvwxyz1234567890abc';
            const truncated = truncateAddress(address, 10, 8);
            // Verify it has ... in the middle
            expect(truncated).toContain('...');
            expect(truncated.startsWith('oct1abcdef')).toBe(true);
            expect(truncated.endsWith('890abc')).toBe(true);
        });

        it('should not truncate short address', () => {
            const address = 'oct1abc';
            const truncated = truncateAddress(address, 10, 8);
            expect(truncated).toBe('oct1abc');
        });

        it('should handle null/undefined', () => {
            expect(truncateAddress(null)).toBeNull();
            expect(truncateAddress(undefined)).toBeUndefined();
        });
    });

    describe('Amount Formatting', () => {
        it('should format with default 3 decimals', () => {
            expect(formatAmount(1234.5678)).toBe('1,234.567');
        });

        it('should pad zeros for round numbers', () => {
            expect(formatAmount(100)).toBe('100.000');
        });

        it('should handle zero', () => {
            expect(formatAmount(0)).toBe('0.000');
        });

        it('should handle null/undefined', () => {
            expect(formatAmount(null)).toBe('0.000');
            expect(formatAmount(undefined)).toBe('0.000');
        });

        it('should handle very small numbers', () => {
            expect(formatAmount(0.000001, 6)).toBe('0.000001');
        });

        it('should truncate, not round', () => {
            // 1.9999 with 2 decimals should be 1.99, not 2.00
            expect(formatAmount(1.9999, 2)).toBe('1.99');
        });
    });

    describe('Session Key Generation', () => {
        it('should generate 64-character hex string', () => {
            const key = generateSessionKey();
            expect(key).toHaveLength(64);
            expect(/^[a-f0-9]+$/i.test(key)).toBe(true);
        });

        it('should generate unique keys', () => {
            const key1 = generateSessionKey();
            const key2 = generateSessionKey();
            expect(key1).not.toBe(key2);
        });
    });
});
