/**
 * Content Script
 * Bridge between inpage script and background service worker
 * Runs in isolated world but can communicate with both page and extension
 */

(function () {
    'use strict';

    // Inject inpage script into the page
    function injectScript() {
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('inpage.js');
            script.onload = () => script.remove();
            (document.head || document.documentElement).appendChild(script);
        } catch (error) {
            console.error('[ContentScript] Failed to inject inpage script:', error);
        }
    }

    // Inject as early as possible
    injectScript();

    // Listen for messages from inpage script
    window.addEventListener('message', async (event) => {
        // Only accept messages from the same window
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'OCTRA_REQUEST') return;

        const { id, method, params } = event.data;

        try {
            // Forward to background script
            const response = await chrome.runtime.sendMessage({
                type: 'DAPP_REQUEST',
                id,
                method,
                params,
                origin: window.location.origin,
                title: document.title,
                favicon: getFavicon()
            });

            // Send response back to inpage script
            window.postMessage({
                type: 'OCTRA_RESPONSE',
                id,
                result: response.result,
                error: response.error
            }, '*');

        } catch (error) {
            window.postMessage({
                type: 'OCTRA_RESPONSE',
                id,
                error: { code: 4900, message: error.message || 'Internal error' }
            }, '*');
        }
    });

    // Listen for events from background (e.g., account changed)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'OCTRA_EVENT') {
            window.postMessage({
                type: 'OCTRA_EVENT',
                event: message.event,
                data: message.data
            }, '*');
        }
        sendResponse({ received: true });
        return true;
    });

    // Get favicon URL
    function getFavicon() {
        const link = document.querySelector("link[rel*='icon']");
        if (link) {
            return link.href;
        }
        return `${window.location.origin}/favicon.ico`;
    }

    console.log('[ContentScript] Qiubit content script loaded');
})();
