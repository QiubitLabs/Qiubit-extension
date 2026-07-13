/**
 * Shared page↔content-script bridge: secure channel token, request/response
 * plumbing with timeout, the per-chain event emitter factory, and the event
 * router that fans background OCTRA_EVENTs out to chain emitters.
 */

import { ProviderRpcError, toRpcError } from "./errors";

export interface Emitter {
  emit(event: string, data?: any): void;
  on(event: string, cb: (data: any) => void): Emitter;
  off(event: string, cb: (data: any) => void): Emitter;
  once(event: string, cb: (data: any) => void): Emitter;
  addListener(event: string, cb: (data: any) => void): Emitter;
  removeListener(event: string, cb: (data: any) => void): Emitter;
  removeAllListeners(event?: string): Emitter;
  listeners(event: string): Array<(data: any) => void>;
}

export function makeEmitter(): Emitter {
  const listeners = new Map<string, Array<(data: any) => void>>();
  const emitter: Emitter = {
    emit(event, data) {
      (listeners.get(event) || []).forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error("[Qiubit] listener error:", e);
        }
      });
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(cb);
      return emitter;
    },
    off(event, cb) {
      const arr = listeners.get(event);
      if (arr) {
        const i = arr.indexOf(cb);
        if (i > -1) arr.splice(i, 1);
      }
      return emitter;
    },
    once(event, cb) {
      const wrap = (d: any) => {
        emitter.off(event, wrap);
        cb(d);
      };
      return emitter.on(event, wrap);
    },
    addListener(event, cb) {
      return emitter.on(event, cb);
    },
    removeListener(event, cb) {
      return emitter.off(event, cb);
    },
    removeAllListeners(event) {
      if (event) listeners.delete(event);
      else listeners.clear();
      return emitter;
    },
    listeners(event) {
      return [...(listeners.get(event) || [])];
    },
  };
  return emitter;
}

export interface Bridge {
  sendRequest(method: string, params?: any): Promise<any>;
  registerEmitter(chain: string, emitter: Emitter): void;
  registerProvider(windowKey: string, provider: any): void;
}

/**
 * Set up the message channel to the content script. Must be called exactly
 * once, from the entry, inside the injection guard.
 */
export function createBridge(): Bridge {
  const CHANNEL_TOKEN = crypto.randomUUID();
  window.postMessage(
    { type: "OCTRA_CHANNEL_INIT", channelToken: CHANNEL_TOKEN },
    window.location.origin,
  );

  let requestId = 0;
  const pendingRequests = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void }
  >();
  const emitters: Record<string, Emitter> = {};

  function routeEvent(event: string, data: any): void {
    const colonIdx = event.indexOf(":");
    if (colonIdx !== -1) {
      const chain = event.slice(0, colonIdx);
      const evName = event.slice(colonIdx + 1);
      emitters[chain]?.emit(evName, data);
    } else {
      emitters["evm"]?.emit(event, data);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (event.data.type === "OCTRA_RESPONSE") {
      const { id, result, error } = event.data;
      const pending = pendingRequests.get(id);
      if (pending) {
        pendingRequests.delete(id);
        if (error) pending.reject(toRpcError(error));
        else pending.resolve(result);
      }
      return;
    }

    if (event.data.type === "OCTRA_EVENT") {
      routeEvent(event.data.event, event.data.data);
    }
  });

  return {
    sendRequest(method: string, params: any = {}): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = ++requestId;
        pendingRequests.set(id, { resolve, reject });
        window.postMessage(
          { type: "OCTRA_REQUEST", channelToken: CHANNEL_TOKEN, id, method, params },
          window.location.origin,
        );
        // 2-minute timeout (matches Phantom/MetaMask)
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new ProviderRpcError(4100, "Request timeout"));
          }
        }, 120_000);
      });
    },
    registerEmitter(chain, emitter) {
      emitters[chain] = emitter;
    },
    registerProvider(windowKey, provider) {
      (window as any)[windowKey] = provider;
    },
  };
}
