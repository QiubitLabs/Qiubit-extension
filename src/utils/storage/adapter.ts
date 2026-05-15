/**
 * Storage Adapter (Extension-First Architecture)
 * 
 * Unifies storage access by enforcing the `chrome.storage` API pattern.
 * - In Production (Extension): Uses native `chrome.storage.local`
 * - In Development (Browser): Uses a polyfill wrapping `localStorage`
 */

export interface StorageArea {
    get(keys?: string | string[] | { [key: string]: any } | null): Promise<{ [key: string]: any }>;
    set(items: { [key: string]: any }): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
    clear(): Promise<void>;
}

/**
 * Native Extension Storage (chrome.storage.local)
 */
class ExtensionStorage implements StorageArea {
    async get(keys?: string | string[] | { [key: string]: any } | null): Promise<{ [key: string]: any }> {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => resolve(result || {}));
        });
    }

    async set(items: { [key: string]: any }): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set(items, () => resolve());
        });
    }

    async remove(keys: string | string[]): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => resolve());
        });
    }

    async clear(): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.clear(() => resolve());
        });
    }
}

/**
 * Polyfill Storage (localStorage wrapper for Dev)
 * Makes localStorage behave exactly like chrome.storage.local (Async)
 */
class DevStorage implements StorageArea {
    async get(keys?: string | string[] | { [key: string]: any } | null): Promise<{ [key: string]: any }> {
        // Simulate async delay slightly like real extensions
        // await new Promise(r => setTimeout(r, 10)); 

        const result: { [key: string]: any } = {};

        if (keys === null || keys === undefined) {
            // Get all
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    try {
                        // Attempt to parse JSON (chrome.storage stores objects, localStorage stores strings)
                        // But wait! localStorage stores STRINGS. chrome.storage can store OBJECTS.
                        // So our polyfill MUST JSON.parse/stringify automatically to match behavior.
                        const raw = localStorage.getItem(key);
                        result[key] = this.safeParse(raw);
                    } catch (e) {
                        result[key] = localStorage.getItem(key);
                    }
                }
            }
        } else if (typeof keys === 'string') {
            const raw = localStorage.getItem(keys);
            if (raw !== null) result[keys] = this.safeParse(raw);
        } else if (Array.isArray(keys)) {
            keys.forEach(key => {
                const raw = localStorage.getItem(key);
                if (raw !== null) result[key] = this.safeParse(raw);
            });
        } else if (typeof keys === 'object') {
            // Default values
            Object.entries(keys).forEach(([key, defaultValue]) => {
                const raw = localStorage.getItem(key);
                result[key] = raw !== null ? this.safeParse(raw) : defaultValue;
            });
        }

        return result;
    }

    async set(items: { [key: string]: any }): Promise<void> {
        Object.entries(items).forEach(([key, value]) => {
            // Check if value is primitive string, if so store as is? 
            // Chrome.storage stores types. LocalStorage only strings.
            // Best practice for polyfill: ALWAYS JSON.stringify to preserve types (numbers, booleans, objects)
            // UNLESS it's already a string, but even then, "123" vs 123.
            // Let's decide: DevStorage always JSON.stringifies EVERYTHING.
            localStorage.setItem(key, JSON.stringify(value));
        });
    }

    async remove(keys: string | string[]): Promise<void> {
        if (typeof keys === 'string') {
            localStorage.removeItem(keys);
        } else if (Array.isArray(keys)) {
            keys.forEach(k => localStorage.removeItem(k));
        }
    }

    async clear(): Promise<void> {
        localStorage.clear();
    }

    // Helper: Chrome storage auto-deserializes. We must do the same.
    private safeParse(value: string | null): any {
        if (value === null) return undefined;
        try {
            return JSON.parse(value);
        } catch (e) {
            return value; // Fallback for legacy raw strings
        }
    }
}

// Global Singleton
const isExtension = typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
export const storage: StorageArea = isExtension ? new ExtensionStorage() : new DevStorage();
