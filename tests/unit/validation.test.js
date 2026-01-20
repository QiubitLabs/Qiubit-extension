import { describe, it, expect } from 'vitest';
import {
    isValidAddress,
    isValidPrivateKey,
    isValidMnemonic,
    isValidAmount,
    calculatePasswordStrength
} from '../../src/utils/validation';

describe('Validation Utils', () => {

    describe('isValidAddress', () => {
        it('should return true for valid octra addresses', () => {
            // Mock valid address format: oct + 43 chars
            const validAddress = 'oct' + 'a'.repeat(43);
            expect(isValidAddress(validAddress)).toBe(true);
        });

        it('should return false for invalid prefixes', () => {
            expect(isValidAddress('btc123...')).toBe(false);
        });

        it('should return false for incorrect length', () => {
            expect(isValidAddress('oct123')).toBe(false);
        });
    });

    describe('isValidMnemonic', () => {
        it('should validate standard 12-word mnemonic', () => {
            const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
            expect(isValidMnemonic(phrase)).toBe(true);
        });

        it('should fail for empty string', () => {
            expect(isValidMnemonic('')).toBe(false);
        });
    });

    describe('isValidAmount', () => {
        it('should validate positive numbers', () => {
            expect(isValidAmount('10.5')).toBe(true);
            expect(isValidAmount(100)).toBe(true);
        });

        it('should reject zero or negative numbers', () => {
            expect(isValidAmount('0')).toBe(false);
            expect(isValidAmount('-5')).toBe(false);
        });
    });

    describe('calculatePasswordStrength', () => {
        it('should identify weak passwords', () => {
            const result = calculatePasswordStrength('12345');
            expect(result.level).toBe('weak');
        });

        it('should identify strong passwords', () => {
            const result = calculatePasswordStrength('CorrectHorseBatteryStaple1!');
            expect(result.level).toBe('strong');
        });
    });
});
