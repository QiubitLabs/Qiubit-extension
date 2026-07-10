/**
 * Content Script
 * Bridge between inpage script and background service worker
 * Runs in isolated world but can communicate with both page and extension
 *
 * Security: validates a one-time channel token sent by the injected inpage
 * script. Third-party page scripts cannot guess this token, so forged
 * OCTRA_REQUEST messages are silently dropped.
 */

(function () {
    'use strict';

    // ─── Secure channel token ────────────────────────────────────────────────
    // The inpage script generates a crypto-random UUID and sends it once via
    // OCTRA_CHANNEL_INIT. We capture it here. Until the token is received we
    // queue incoming requests so nothing is lost during the brief race window.

    let channelToken = null;
    const earlyQueue = []; // requests arriving before token handshake
    const EARLY_QUEUE_MAX = 20; // prevent memory DoS from malicious pages

    // inpage.js is now injected natively by Chrome via manifest.json content_scripts with world: "MAIN".
    // This avoids DOM manipulation and prevents Content Security Policy (CSP) blocking on dApps.

    let port = null;

    // Requests queued while the port is reconnecting (service worker woke up).
    // Drained immediately once a new port is established.
    const reconnectQueue = [];
    const RECONNECT_QUEUE_MAX = 20;
    const RECONNECT_REQUEST_TIMEOUT_MS = 8000;

    // Establish long-lived connection with auto-reconnect
    function connectToBackground() {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect || !chrome.runtime.id) {
            console.warn('[ContentScript] Extension context invalidated. Stopping reconnection loop.');
            // Flush reconnect queue with an error so dApp promises don't hang forever
            while (reconnectQueue.length > 0) {
                const item = reconnectQueue.shift();
                window.postMessage({
                    type: 'OCTRA_RESPONSE',
                    id: item.id,
                    error: { code: 4900, message: 'Extension context invalidated.' }
                }, window.location.origin);
            }
            return;
        }

        try {
            port = chrome.runtime.connect({ name: 'octra-dapp-channel' });

            // Drain any requests that arrived while the port was reconnecting
            while (reconnectQueue.length > 0) {
                sendViaPort(reconnectQueue.shift());
            }

            port.onMessage.addListener((message) => {
                if (message.type === 'OCTRA_RESPONSE') {
                    window.postMessage({
                        type: 'OCTRA_RESPONSE',
                        id: message.id,
                        result: message.result,
                        error: message.error
                    }, window.location.origin);
                } else if (message.type === 'OCTRA_EVENT') {
                    window.postMessage({
                        type: 'OCTRA_EVENT',
                        event: message.event,
                        data: message.data
                    }, window.location.origin);
                }
            });

            port.onDisconnect.addListener(() => {
                port = null;
                setTimeout(connectToBackground, 1000);
            });
        } catch (error) {
            console.error('[ContentScript] Failed to establish port connection:', error);
            setTimeout(connectToBackground, 2000);
        }
    }

    // Start connection
    connectToBackground();

    // Send one validated payload through the live port
    function sendViaPort(data) {
        const { id, method, params } = data;
        try {
            port.postMessage({
                type: 'DAPP_REQUEST',
                id,
                method,
                params,
                origin: window.location.origin,
                title: document.title,
                favicon: getFavicon()
            });
        } catch (error) {
            console.error('[ContentScript] Port send failed:', error);
            window.postMessage({
                type: 'OCTRA_RESPONSE',
                id,
                error: { code: 4900, message: 'Failed to send payload to background service' }
            }, window.location.origin);
        }
    }

    // Forward a validated request to the background port.
    // If the port is momentarily null (service worker restarting), queue the
    // request and drain it once the port comes back up.
    function forwardToBackground(data) {
        if (port) {
            sendViaPort(data);
        } else {
            if (reconnectQueue.length >= RECONNECT_QUEUE_MAX) return; // DoS guard
            reconnectQueue.push(data);

            // Safety timeout: if reconnect never completes, reject with an error
            setTimeout(() => {
                const idx = reconnectQueue.indexOf(data);
                if (idx !== -1) {
                    reconnectQueue.splice(idx, 1);
                    window.postMessage({
                        type: 'OCTRA_RESPONSE',
                        id: data.id,
                        error: { code: 4900, message: 'Background service unavailable. Please reload the page.' }
                    }, window.location.origin);
                }
            }, RECONNECT_REQUEST_TIMEOUT_MS);
        }
    }

    // Listen for messages from inpage script
    window.addEventListener('message', (event) => {
        // Only accept messages from the same window
        if (event.source !== window) return;
        if (!event.data) return;

        // ── Token handshake ──────────────────────────────────────────────────
        // The inpage script sends this exactly once at startup with a
        // crypto-random UUID. We lock onto it so that no other script on
        // the page can impersonate the provider.
        if (event.data.type === 'OCTRA_CHANNEL_INIT' && !channelToken) {
            if (typeof event.data.channelToken === 'string' && event.data.channelToken.length > 0) {
                channelToken = event.data.channelToken;

                // Drain any requests that arrived before the handshake
                while (earlyQueue.length > 0) {
                    forwardToBackground(earlyQueue.shift());
                }
            }
            return;
        }

        // ── Regular requests ─────────────────────────────────────────────────
        if (event.data.type !== 'OCTRA_REQUEST') return;

        // Validate the channel token to ensure this message originates
        // from the real injected inpage script, not a malicious page script
        if (channelToken) {
            if (event.data.channelToken !== channelToken) {
                // Silently drop — do not reveal the expected token
                return;
            }
        } else {
            // Token not yet received — queue this request (capped to prevent DoS)
            if (earlyQueue.length < EARLY_QUEUE_MAX) {
                earlyQueue.push(event.data);
            }
            return;
        }

        forwardToBackground(event.data);
    });

    // Get favicon URL
    function getFavicon() {
        const link = document.querySelector("link[rel*='icon']");
        if (link) {
            return link.href;
        }
        return `${window.location.origin}/favicon.ico`;
    }

})();
