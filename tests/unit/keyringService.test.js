/**
 * KeyringService Unit Tests
 * Tests for secure key management, signing, and memory wiping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyringService } from '../../src/services/KeyringService';

describe('KeyringService', () => {
    let keyring;

    // Test wallet data (DO NOT USE IN PRODUCTION)
    const testWallet = {
        address: 'oct1testwallet12345678901234567890123456789012',
        privateKeyB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', // 32 zero bytes
        publicKeyB64: 'O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik=' // Corresponding public key
    };

    beforeEach(() => {
        // Create fresh instance for each test
        // Note: KeyringService is a singleton, so we need to work around that
        KeyringService._instance = null;
        keyring = new KeyringService();
    });

    afterEach(() => {
        // Always lock after tests to clean up
        if (keyring.isUnlocked()) {
            keyring.panicLock();
        }
    });

    describe('Initialization', () => {
        it('should start in locked state', () => {
            expect(keyring.isUnlocked()).toBe(false);
        });

        it('should initialize with password', async () => {
            await keyring.initialize('TestPassword123!');
            expect(keyring.isUnlocked()).toBe(true);
        });
    });

    describe('Unlock/Lock', () => {
        it('should unlock with password and wallets', async () => {
            await keyring.unlock('TestPassword123!', [testWallet]);
            expect(keyring.isUnlocked()).toBe(true);
        });

        it('should lock and clear state', async () => {
            await keyring.unlock('TestPassword123!', [testWallet]);
            keyring.lock();
            expect(keyring.isUnlocked()).toBe(false);
        });
    });

    describe('Key Management', () => {
        beforeEach(async () => {
            await keyring.initialize('TestPassword123!');
        });

        it('should add key', () => {
            keyring.addKey(testWallet.address, testWallet.privateKeyB64, testWallet.publicKeyB64);
            const addresses = keyring.getAddresses();
            expect(addresses).toContain(testWallet.address);
        });

        it('should get public key', () => {
            keyring.addKey(testWallet.address, testWallet.privateKeyB64, testWallet.publicKeyB64);
            const pubKey = keyring.getPublicKey(testWallet.address);
            expect(pubKey).toBe(testWallet.publicKeyB64);
        });

        it('should return null for non-existent address', () => {
            const pubKey = keyring.getPublicKey('oct1nonexistent');
            expect(pubKey).toBeNull();
        });

        it('should remove key', () => {
            keyring.addKey(testWallet.address, testWallet.privateKeyB64, testWallet.publicKeyB64);
            keyring.removeKey(testWallet.address);
            const addresses = keyring.getAddresses();
            expect(addresses).not.toContain(testWallet.address);
        });
    });

    describe('Locked State Protection', () => {
        it('should throw when adding key while locked', () => {
            expect(() => {
                keyring.addKey(testWallet.address, testWallet.privateKeyB64, testWallet.publicKeyB64);
            }).toThrow('Keyring is locked');
        });

        it('should throw when getting public key while locked', () => {
            expect(() => {
                keyring.getPublicKey(testWallet.address);
            }).toThrow('Keyring is locked');
        });

        it('should return null for private key access when locked', () => {
            const pk = keyring.getPrivateKey(testWallet.address);
            expect(pk).toBeNull();
        });
    });

    describe('Panic Lock', () => {
        it('should immediately lock and wipe all data', async () => {
            await keyring.unlock('TestPassword123!', [testWallet]);
            keyring.panicLock();

            expect(keyring.isUnlocked()).toBe(false);
            expect(keyring.getAddresses()).toEqual([]);
        });
    });

    describe('Active Wallet', () => {
        beforeEach(async () => {
            await keyring.unlock('TestPassword123!', [testWallet]);
        });

        it('should set active wallet', async () => {
            const result = await keyring.setActiveWallet(testWallet.address);
            expect(result).toBe(true);
        });

        it('should throw for non-existent wallet', async () => {
            await expect(keyring.setActiveWallet('oct1nonexistent')).rejects.toThrow('Wallet not found');
        });
    });
});
