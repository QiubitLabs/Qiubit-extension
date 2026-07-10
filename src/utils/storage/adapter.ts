/**
 * LOGIC: Shims storage operations across browser extensions and web dev environments.
 * Detects if 'chrome.storage.local' is available; if so, delegates calls to it. If running in web dev/sandbox, it provides an async polyfill wrapper over 'localStorage' that automatically handles JSON serialization/deserialization.
 * EXPORTS:
 *   - StorageArea (interface)
 *   - storage (const class instance implementing StorageArea)
 * FUNCTIONS:
 *   - get(keys): Retrieves storage items by keys, parsing JSON wrappers if shimmable.
 *   - set(items): Saves objects into storage, serializing to JSON for localStorage shim.
 *   - remove(keys): Removes storage entries by keys.
 *   - clear(): Wipes all storage entries.
 */

export interface StorageArea {
  get(
    keys?: string | string[] | { [key: string]: any } | null,
  ): Promise<{ [key: string]: any }>;
  set(items: { [key: string]: any }): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Native Extension Storage (chrome.storage.local)
 */
class ExtensionStorage implements StorageArea {
  async get(
    keys?: string | string[] | { [key: string]: any } | null,
  ): Promise<{ [key: string]: any }> {
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
  async get(
    keys?: string | string[] | { [key: string]: any } | null,
  ): Promise<{ [key: string]: any }> {
    const result: { [key: string]: any } = {};

    if (keys === null || keys === undefined) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          try {
            const raw = localStorage.getItem(key);
            result[key] = this.safeParse(raw);
          } catch (e) {
            result[key] = localStorage.getItem(key);
          }
        }
      }
    } else if (typeof keys === "string") {
      const raw = localStorage.getItem(keys);
      if (raw !== null) result[keys] = this.safeParse(raw);
    } else if (Array.isArray(keys)) {
      keys.forEach((key) => {
        const raw = localStorage.getItem(key);
        if (raw !== null) result[key] = this.safeParse(raw);
      });
    } else if (typeof keys === "object") {
      Object.entries(keys).forEach(([key, defaultValue]) => {
        const raw = localStorage.getItem(key);
        result[key] = raw !== null ? this.safeParse(raw) : defaultValue;
      });
    }

    return result;
  }

  async set(items: { [key: string]: any }): Promise<void> {
    Object.entries(items).forEach(([key, value]) => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  async remove(keys: string | string[]): Promise<void> {
    if (typeof keys === "string") {
      localStorage.removeItem(keys);
    } else if (Array.isArray(keys)) {
      keys.forEach((k) => localStorage.removeItem(k));
    }
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }

  private safeParse(value: string | null): any {
    if (value === null) return undefined;
    try {
      return JSON.parse(value);
    } catch (e) {
      return value; // Fallback for legacy raw strings
    }
  }
}

const isExtension =
  typeof chrome !== "undefined" && !!chrome.storage && !!chrome.storage.local;
export const storage: StorageArea = isExtension
  ? new ExtensionStorage()
  : new DevStorage();
