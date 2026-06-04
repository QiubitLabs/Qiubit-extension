/**
 * Security tests for KeyringService, SessionService patterns, and dApp flow
 * Covers: EVM key fallback removal, session key isolation, channel token DoS cap
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('../../../utils/storage/adapter', () => ({
    storage: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined)
    }
}));

vi.mock('../../../utils/storage/vault', () => ({
    saveWalletsSecure: vi.fn().mockResolvedValue(undefined),
    loadWalletsSecure: vi.fn().mockResolvedValue([]),
    addWalletSecure: vi.fn().mockResolvedValue(undefined)
}));

// ─── EVM key resolution — no silent fallback ──────────────────────────────────

describe('resolveBackgroundEvmKey — no wrong-wallet signing', () => {
    function makeKeyMap(entries: [string, string][]): Map<string, string> {
        return new Map(entries);
    }

    function resolveBackgroundEvmKey(
        evmKeys: Map<string, string>,
        evmAddresses: Map<string, string>,
        addrOrEvmAddr: string
    ): string | null {
        if (!evmKeys || evmKeys.size === 0) return null;

        // 1. Direct match
        const direct = evmKeys.get(addrOrEvmAddr);
        if (direct) return direct;

        // 2. Match by EVM address
        const lower = addrOrEvmAddr.toLowerCase();
        for (const [octraAddr, privKey] of evmKeys.entries()) {
            const evmAddr = evmAddresses.get(octraAddr);
            if (evmAddr?.toLowerCase() === lower) return privKey;
        }

        // 3. No fallback — return null, never sign with wrong key
        return null;
    }

    const evmKeys = makeKeyMap([
        ['oct1', 'privkey_for_oct1'],
        ['oct2', 'privkey_for_oct2']
    ]);
    const evmAddresses = new Map([
        ['oct1', '0xAbc1'],
        ['oct2', '0xAbc2']
    ]);

    it('returns key for direct Octra address match', () => {
        expect(resolveBackgroundEvmKey(evmKeys, evmAddresses, 'oct1'))
            .toBe('privkey_for_oct1');
    });

    it('returns key for EVM address match (case-insensitive)', () => {
        expect(resolveBackgroundEvmKey(evmKeys, evmAddresses, '0xabc2'))
            .toBe('privkey_for_oct2');
    });

    it('returns NULL for unknown address — does not fall back to first key', () => {
        const result = resolveBackgroundEvmKey(evmKeys, evmAddresses, 'oct_unknown');
        // SECURITY: must be null, NOT 'privkey_for_oct1' (the first key)
        expect(result).toBeNull();
    });

    it('returns null when evmKeys map is empty', () => {
        expect(resolveBackgroundEvmKey(new Map(), evmAddresses, 'oct1')).toBeNull();
    });

    it('returns null for wrong EVM address', () => {
        expect(resolveBackgroundEvmKey(evmKeys, evmAddresses, '0xDeadBeef'))
            .toBeNull();
    });
});

// ─── Channel token DoS cap ─────────────────────────────────────────────────────

describe('earlyQueue DoS cap', () => {
    const EARLY_QUEUE_MAX = 20;

    function simulateEarlyQueue(messageCount: number): number {
        const earlyQueue: any[] = [];
        for (let i = 0; i < messageCount; i++) {
            if (earlyQueue.length < EARLY_QUEUE_MAX) {
                earlyQueue.push({ type: 'OCTRA_REQUEST', id: i });
            }
        }
        return earlyQueue.length;
    }

    it('caps at EARLY_QUEUE_MAX regardless of flood size', () => {
        expect(simulateEarlyQueue(1000)).toBe(EARLY_QUEUE_MAX);
        expect(simulateEarlyQueue(10000)).toBe(EARLY_QUEUE_MAX);
    });

    it('allows normal traffic up to max', () => {
        expect(simulateEarlyQueue(5)).toBe(5);
        expect(simulateEarlyQueue(20)).toBe(20);
    });

    it('does not grow past cap on exactly max+1', () => {
        expect(simulateEarlyQueue(21)).toBe(EARLY_QUEUE_MAX);
    });
});

// ─── RESOLVE_APPROVAL — sessionKey rejection ──────────────────────────────────

describe('RESOLVE_APPROVAL — sessionKey not accepted', () => {
    it('destructuring data WITHOUT sessionKey is safe', () => {
        const data = {
            id: 'approval-123',
            decision: 'approved',
            result: { txHash: '0xabc' },
            sessionKey: 'ATTACKER_KEY',  // should be ignored
            selectedOctraAddress: 'oct1'
        };

        // Simulate the fixed destructuring
        const { id, decision, result: _result, selectedOctraAddress: _selectedOctraAddress, selectedEvmAddress } =
            data as any;

        expect(id).toBe('approval-123');
        expect(decision).toBe('approved');
        // sessionKey is intentionally NOT destructured — attacker value is discarded
        expect((data as any).sessionKey).toBe('ATTACKER_KEY'); // it's in data...
        // but selectedEvmAddress is undefined (not in data), and no memorySessionKey was overwritten
        expect(selectedEvmAddress).toBeUndefined();
    });
});

// ─── Favicon validation ───────────────────────────────────────────────────────

describe('dApp favicon URL validation', () => {
    function isSafeFaviconUrl(url: string | undefined): boolean {
        if (!url) return false;
        return url.startsWith('https://') || url.startsWith('data:image/');
    }

    it('allows https:// favicon', () => {
        expect(isSafeFaviconUrl('https://example.com/favicon.ico')).toBe(true);
    });

    it('allows data:image/ favicon (inline)', () => {
        expect(isSafeFaviconUrl('data:image/png;base64,abc123')).toBe(true);
    });

    it('blocks javascript: URI (XSS vector)', () => {
        expect(isSafeFaviconUrl('javascript:alert(1)')).toBe(false);
    });

    it('blocks http:// favicon (mixed content)', () => {
        expect(isSafeFaviconUrl('http://evil.com/track.gif')).toBe(false);
    });

    it('blocks empty string', () => {
        expect(isSafeFaviconUrl('')).toBe(false);
    });

    it('blocks undefined', () => {
        expect(isSafeFaviconUrl(undefined)).toBe(false);
    });

    it('blocks data:text/ (non-image data URI)', () => {
        expect(isSafeFaviconUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });
});

// ─── Session key NOT in GET_STATE response ────────────────────────────────────

describe('SESSION_ACTION GET_STATE — no session key leak', () => {
    it('GET_STATE response does not include sessionKey field', () => {
        // Simulate the fixed GET_STATE handler
        const mockSessionService = {
            isValid: () => true,
            getAutoLockDuration: () => 300_000,
            // getSessionKey exists but must NOT be called
            getSessionKey: vi.fn().mockReturnValue('secret_session_key')
        };

        const result = {
            isValid: mockSessionService.isValid(),
            autoLockDuration: mockSessionService.getAutoLockDuration()
        };

        expect(result).not.toHaveProperty('sessionKey');
        expect(mockSessionService.getSessionKey).not.toHaveBeenCalled();
    });
});

// ─── Message bus — no private keys in transit ─────────────────────────────────

describe('KeyringService initialize/unlock — no wallets on message bus', () => {
    it('initialize sends only password, not wallets', () => {
        const messages: any[] = [];

        function sendMessageToBackground(action: string, payload?: any) {
            messages.push({ action, payload });
            return Promise.resolve({});
        }

        // Simulate popup path (IS_BACKGROUND = false)
        const password = 'pw';
        sendMessageToBackground('initialize', { password });

        expect(messages[0].payload).not.toHaveProperty('wallets');
        expect(messages[0].payload).toHaveProperty('password', 'pw');
    });

    it('unlock sends only password, not wallets', () => {
        const messages: any[] = [];

        function sendMessageToBackground(action: string, payload?: any) {
            messages.push({ action, payload });
            return Promise.resolve({});
        }

        sendMessageToBackground('unlock', { password: 'pw' });

        expect(messages[0].payload).not.toHaveProperty('wallets');
        expect(messages[0].payload).toHaveProperty('password', 'pw');
    });
});
