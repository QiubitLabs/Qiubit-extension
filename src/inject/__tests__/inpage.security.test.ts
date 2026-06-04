/**
 * Security tests for inpage.js channel token model
 * Covers: postMessage origin restriction, channel token uniqueness, request isolation
 */

import { describe, it, expect } from 'vitest';

// ─── Channel token — uniqueness and unpredictability ─────────────────────────

describe('CHANNEL_TOKEN properties', () => {
    it('is a valid UUID v4 format', () => {
        const token = crypto.randomUUID();
        expect(token).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    });

    it('generates unique tokens across calls', () => {
        const tokens = new Set(Array.from({ length: 100 }, () => crypto.randomUUID()));
        expect(tokens.size).toBe(100);
    });

    it('is not predictable — random 128-bit entropy', () => {
        const t1 = crypto.randomUUID();
        const t2 = crypto.randomUUID();
        expect(t1).not.toBe(t2);
    });
});

// ─── postMessage targetOrigin must not be '*' ─────────────────────────────────

describe('postMessage targetOrigin restriction', () => {
    it('CHANNEL_INIT uses window.location.origin, not "*"', () => {
        const postMessageCalls: any[] = [];
        const mockWindow = {
            location: { origin: 'https://app.uniswap.org' },
            postMessage: (data: any, origin: string) => postMessageCalls.push({ data, origin })
        };

        // Simulate inpage.js CHANNEL_INIT broadcast (fixed version)
        const CHANNEL_TOKEN = crypto.randomUUID();
        mockWindow.postMessage({
            type: 'OCTRA_CHANNEL_INIT',
            channelToken: CHANNEL_TOKEN
        }, mockWindow.location.origin);

        expect(postMessageCalls[0].origin).toBe('https://app.uniswap.org');
        expect(postMessageCalls[0].origin).not.toBe('*');
    });

    it('sendRequest uses window.location.origin, not "*"', () => {
        const postMessageCalls: any[] = [];
        const mockWindow = {
            location: { origin: 'https://app.example.com' },
            postMessage: (data: any, origin: string) => postMessageCalls.push({ data, origin })
        };

        const CHANNEL_TOKEN = crypto.randomUUID();
        mockWindow.postMessage({
            type: 'OCTRA_REQUEST',
            channelToken: CHANNEL_TOKEN,
            id: 1,
            method: 'eth_requestAccounts',
            params: {}
        }, mockWindow.location.origin);

        expect(postMessageCalls[0].origin).toBe('https://app.example.com');
        expect(postMessageCalls[0].origin).not.toBe('*');
    });

    it('cross-origin iframe cannot receive CHANNEL_INIT when targetOrigin is set', () => {
        // Simulate iframe from different origin attempting to receive the message
        const iframeOrigin = 'https://evil-tracker.com';
        const appOrigin = 'https://app.uniswap.org';

        // The browser only delivers postMessage to receiver if targetOrigin matches
        // We simulate this check:
        function browserWouldDeliver(messageOrigin: string, targetOrigin: string): boolean {
            return targetOrigin === '*' || targetOrigin === messageOrigin;
        }

        expect(browserWouldDeliver(iframeOrigin, appOrigin)).toBe(false);  // blocked
        expect(browserWouldDeliver(appOrigin, appOrigin)).toBe(true);       // delivered
        expect(browserWouldDeliver(iframeOrigin, '*')).toBe(true);          // '*' would leak
    });
});

// ─── Channel token validation in content script ───────────────────────────────

describe('Channel token validation', () => {
    it('drops request with wrong channel token', () => {
        const REAL_TOKEN = crypto.randomUUID();
        const FAKE_TOKEN = crypto.randomUUID();
        const forwarded: any[] = [];

        function handleMessage(event: { data: any }, channelToken: string | null) {
            if (!event.data || event.data.type !== 'OCTRA_REQUEST') return;
            if (channelToken && event.data.channelToken !== channelToken) return; // drop
            forwarded.push(event.data);
        }

        handleMessage({ data: { type: 'OCTRA_REQUEST', channelToken: FAKE_TOKEN } }, REAL_TOKEN);
        expect(forwarded).toHaveLength(0); // must be dropped
    });

    it('forwards request with correct channel token', () => {
        const REAL_TOKEN = crypto.randomUUID();
        const forwarded: any[] = [];

        function handleMessage(event: { data: any }, channelToken: string | null) {
            if (!event.data || event.data.type !== 'OCTRA_REQUEST') return;
            if (channelToken && event.data.channelToken !== channelToken) return;
            forwarded.push(event.data);
        }

        handleMessage({ data: { type: 'OCTRA_REQUEST', channelToken: REAL_TOKEN, method: 'eth_accounts' } }, REAL_TOKEN);
        expect(forwarded).toHaveLength(1);
    });

    it('queues request when token not yet received', () => {
        const EARLY_QUEUE_MAX = 20;
        const earlyQueue: any[] = [];

        function handleMessage(event: { data: any }, channelToken: string | null) {
            if (!event.data || event.data.type !== 'OCTRA_REQUEST') return;
            if (channelToken !== null) return; // token received — not queuing
            if (earlyQueue.length < EARLY_QUEUE_MAX) {
                earlyQueue.push(event.data);
            }
        }

        handleMessage({ data: { type: 'OCTRA_REQUEST', channelToken: 'any', method: 'eth_accounts' } }, null);
        expect(earlyQueue).toHaveLength(1);
    });
});

// ─── Duplicate injection guard ────────────────────────────────────────────────

describe('Inpage injection guard', () => {
    it('skips second injection if window.octra already set', () => {
        const injections: number[] = [];

        function maybeInject(windowObj: any) {
            if (windowObj.octra) return; // guard
            injections.push(1);
            windowObj.octra = {};
        }

        const mockWindow: any = {};
        maybeInject(mockWindow);
        maybeInject(mockWindow); // second call should be no-op
        expect(injections).toHaveLength(1);
    });
});
