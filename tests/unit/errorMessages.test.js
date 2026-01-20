/**
 * Error Messages Unit Tests
 * Tests for user-friendly error message translation
 */

import { describe, it, expect } from 'vitest';
import {
    ERROR_MESSAGES,
    getFriendlyErrorMessage,
    formatError
} from '../../src/utils/errorMessages';

describe('Error Messages', () => {

    describe('ERROR_MESSAGES constant', () => {
        it('should have all required error categories', () => {
            // Network errors
            expect(ERROR_MESSAGES['Failed to fetch']).toBeDefined();
            expect(ERROR_MESSAGES['ETIMEDOUT']).toBeDefined();
            expect(ERROR_MESSAGES['ECONNREFUSED']).toBeDefined();

            // RPC errors
            expect(ERROR_MESSAGES['Nonce too low']).toBeDefined();
            expect(ERROR_MESSAGES['Insufficient balance']).toBeDefined();

            // Wallet errors
            expect(ERROR_MESSAGES['Invalid password']).toBeDefined();
            expect(ERROR_MESSAGES['Invalid mnemonic']).toBeDefined();

            // Default fallback
            expect(ERROR_MESSAGES['default']).toBeDefined();
        });

        it('should have user-friendly messages (no technical jargon)', () => {
            // Check that messages are understandable
            const networkError = ERROR_MESSAGES['Failed to fetch'];
            expect(networkError).toContain('connect');
            expect(networkError).not.toContain('ERR_');
        });
    });

    describe('getFriendlyErrorMessage', () => {
        it('should return exact match message', () => {
            const result = getFriendlyErrorMessage('Failed to fetch');
            expect(result).toBe(ERROR_MESSAGES['Failed to fetch']);
        });

        it('should return partial match message', () => {
            const result = getFriendlyErrorMessage('Something failed with ETIMEDOUT error');
            expect(result).toBe(ERROR_MESSAGES['ETIMEDOUT']);
        });

        it('should handle Error objects', () => {
            const error = new Error('Insufficient balance for transaction');
            const result = getFriendlyErrorMessage(error);
            expect(result).toBe(ERROR_MESSAGES['Insufficient balance']);
        });

        it('should return default for unknown errors', () => {
            const result = getFriendlyErrorMessage('Some completely unknown error xyz123');
            expect(result).toBe(ERROR_MESSAGES['default']);
        });

        it('should handle null/undefined', () => {
            expect(getFriendlyErrorMessage(null)).toBe(ERROR_MESSAGES['default']);
            expect(getFriendlyErrorMessage(undefined)).toBe(ERROR_MESSAGES['default']);
        });

        it('should be case-insensitive', () => {
            const result = getFriendlyErrorMessage('INVALID PASSWORD');
            expect(result).toBe(ERROR_MESSAGES['Invalid password']);
        });
    });

    describe('formatError', () => {
        it('should return only message when showTechnical is false', () => {
            const error = new Error('Invalid mnemonic phrase');
            const result = formatError(error, false);

            expect(result.message).toBeDefined();
            expect(result.technical).toBeUndefined();
            expect(result.stack).toBeUndefined();
        });

        it('should return full details when showTechnical is true', () => {
            const error = new Error('Invalid mnemonic phrase');
            const result = formatError(error, true);

            expect(result.message).toBeDefined();
            expect(result.technical).toBe('Invalid mnemonic phrase');
            expect(result.stack).toBeDefined();
        });

        it('should handle string errors', () => {
            const result = formatError('Connection failed', true);

            expect(result.message).toBeDefined();
            expect(result.technical).toBe('Connection failed');
        });
    });
});
