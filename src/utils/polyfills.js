/**
 * Polyfills for browser compatibility
 * Ensures critical APIs are available in all browsers
 */

// Polyfill for crypto.randomUUID (Safari < 15.4, older browsers)
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
    crypto.randomUUID = function () {
        // RFC 4122 version 4 UUID
        return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
            (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
        );
    };
}

// Polyfill for globalThis (older browsers)
if (typeof globalThis === 'undefined') {
    window.globalThis = window;
}

// Ensure TextEncoder/TextDecoder are available
if (typeof TextEncoder === 'undefined') {
    console.warn('[Polyfill] TextEncoder not available - some features may not work');
}

if (typeof TextDecoder === 'undefined') {
    console.warn('[Polyfill] TextDecoder not available - some features may not work');
}

// Log polyfill status (development only)
if (import.meta.env?.DEV) {
    console.log('[Polyfills] Loaded successfully');
}

export default {};
