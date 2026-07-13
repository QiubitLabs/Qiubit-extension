/**
 * SUI PROVIDER (window.sui) + @mysten/wallet-standard features.
 * Exposes both the v2 features (sui:signTransaction / signAndExecuteTransaction)
 * and the legacy *Block variants — older dapp-kit versions filter wallets by
 * the legacy names in isWalletWithRequiredFeatureSet.
 */

import { ProviderRpcError, toRpcError } from "./errors";
import { makeEmitter, type Bridge, type Emitter } from "./bridge";
import { base64ToBytes, solTxToBase64 } from "./encoding";

export interface SuiInit {
  suiProvider: any;
  suiEmitter: Emitter;
  features: Record<string, any>;
  getAccounts(): any[];
  onAccountsChange(cb: () => void): void;
  /** Mark connected from the unified multichain connect flow. */
  applyExternalConnect(address: string, suiPublicKeyB64?: string | null): void;
}

export function initSui(bridge: Bridge): SuiInit {
  const { sendRequest } = bridge;
  const suiEmitter = makeEmitter();
  bridge.registerEmitter("sui", suiEmitter);

  let _accounts: any[] = [];
  let _listeners: Array<(e: { accounts: any[] }) => void> = [];
  const _changeCbs: Array<() => void> = [];

  function updateAccounts(
    address: string | null,
    publicKeyBytes: Uint8Array | null,
  ): void {
    _accounts = address
      ? [
          {
            address,
            publicKey: publicKeyBytes || new Uint8Array(32),
            chains: ["sui:mainnet", "sui:testnet", "sui:devnet"],
            features: [
              "sui:signPersonalMessage",
              "sui:signTransaction",
              "sui:signAndExecuteTransaction",
              "sui:signTransactionBlock",
              "sui:signAndExecuteTransactionBlock",
              "sui:reportTransactionEffects",
              "standard:connect",
              "standard:disconnect",
              "standard:events",
            ],
          },
        ]
      : [];
    _listeners.forEach((cb) => {
      try {
        cb({ accounts: _accounts });
      } catch {
        /* ignore */
      }
    });
    _changeCbs.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  }

  const suiProvider: any = {
    isQiubitWallet: true,
    name: "Qiubit",

    address: null as string | null,
    isConnected: false,

    async connect(opts: any = {}) {
      const result = await sendRequest("sui_connect", {
        appInfo: opts.appInfo || {
          name: document.title,
          url: window.location.origin,
        },
      });
      if (result?.address) {
        this.address = result.address;
        this.isConnected = true;
        suiEmitter.emit("connect", { address: this.address });
        const pubBytes = result.suiPublicKey
          ? base64ToBytes(result.suiPublicKey)
          : null;
        updateAccounts(this.address, pubBytes);
      }
      return { address: this.address, accounts: _accounts };
    },

    async disconnect() {
      await sendRequest("sui_disconnect", {});
      this.address = null;
      this.isConnected = false;
      suiEmitter.emit("disconnect", undefined);
      updateAccounts(null, null);
    },

    async signAndExecuteTransaction(txBlock: any, opts: any = {}) {
      if (!this.isConnected)
        throw new ProviderRpcError(4100, "Not connected to Sui");
      const res = await sendRequest("sui_signAndExecuteTransaction", {
        txBlock: solTxToBase64(txBlock),
        options: opts,
        address: this.address,
      });
      if (res?.error) throw toRpcError(res.error);
      return res?.result ?? res;
    },

    async signTransaction(txBlock: any) {
      if (!this.isConnected)
        throw new ProviderRpcError(4100, "Not connected to Sui");
      const res = await sendRequest("sui_signTransaction", {
        txBlock: solTxToBase64(txBlock),
        address: this.address,
      });
      if (res?.error) throw toRpcError(res.error);
      return res?.result ?? res;
    },

    async signMessage(input: any) {
      if (!this.isConnected)
        throw new ProviderRpcError(4100, "Not connected to Sui");
      // Normalize message input
      let msgBytes: Uint8Array;
      if (input.message instanceof Uint8Array) {
        msgBytes = input.message;
      } else if (Array.isArray(input.message)) {
        msgBytes = new Uint8Array(input.message);
      } else if (typeof input.message === "string") {
        msgBytes = new TextEncoder().encode(input.message);
      } else {
        msgBytes = new Uint8Array(0);
      }
      // Encode as base64 for transport
      const msgBase64 = btoa(String.fromCharCode(...msgBytes));
      const res = await sendRequest("sui_signMessage", {
        message: msgBase64,
        address: this.address,
      });
      if (res?.error) throw toRpcError(res.error);
      const raw = res?.result ?? res;
      // Return in Sui standard format
      return {
        messageBytes: msgBase64,
        signature: raw?.signature ?? raw ?? "",
      };
    },

    async getAccounts() {
      if (!this.isConnected) return [];
      const res = await sendRequest("sui_getAccounts", { address: this.address });
      return res?.result ?? (this.address ? [{ address: this.address }] : []);
    },

    on(event: string, cb: any) {
      return suiEmitter.on(event, cb);
    },
    off(event: string, cb: any) {
      return suiEmitter.off(event, cb);
    },
    addListener(event: string, cb: any) {
      return suiEmitter.on(event, cb);
    },
    removeListener(event: string, cb: any) {
      return suiEmitter.off(event, cb);
    },
    once(event: string, cb: any) {
      return suiEmitter.once(event, cb);
    },
  };

  // Handle account changes from background
  suiEmitter.on("accountChanged", (address: any) => {
    suiProvider.address = address || null;
    suiProvider.isConnected = !!address;
    updateAccounts(address || null, null);
  });

  bridge.registerProvider("sui", suiProvider);

  // ─── Sui Wallet Standard features ─────────────────────────────────────────

  const features: Record<string, any> = {
    "standard:connect": {
      version: "1.0.0",
      connect: async () => {
        await suiProvider.connect();
        return { accounts: _accounts };
      },
    },
    "standard:disconnect": {
      version: "1.0.0",
      disconnect: () => suiProvider.disconnect(),
    },
    "standard:events": {
      version: "1.0.0",
      on: (event: string, listener: any) => {
        if (event === "change") {
          _listeners.push(listener);
          return () => {
            _listeners = _listeners.filter((l) => l !== listener);
          };
        }
        return () => {};
      },
    },
    "sui:signPersonalMessage": {
      version: "1.0.0",
      signPersonalMessage: async ({ message }: any) => {
        const result = await suiProvider.signMessage({ message });
        return { messageBytes: result.messageBytes, signature: result.signature };
      },
    },
    "sui:signTransaction": {
      version: "2.0.0",
      signTransaction: async ({ transaction, chain }: any) => {
        void chain;
        const result = await suiProvider.signTransaction(transaction);
        return {
          bytes: result?.bytes ?? "",
          signature: result?.signature ?? result ?? "",
        };
      },
    },
    "sui:signAndExecuteTransaction": {
      version: "2.0.0",
      signAndExecuteTransaction: async ({ transaction, chain }: any) => {
        return await suiProvider.signAndExecuteTransaction(transaction, { chain });
      },
    },
    // Legacy *Block features: older @mysten/dapp-kit / wallet-adapter versions
    // filter wallets by these names in isWalletWithRequiredFeatureSet, so a
    // wallet exposing only the v2 features above is not detected.
    "sui:signTransactionBlock": {
      version: "1.0.0",
      signTransactionBlock: async ({ transactionBlock }: any) => {
        const result = await suiProvider.signTransaction(transactionBlock);
        return {
          transactionBlockBytes:
            result?.bytes ?? result?.transactionBlockBytes ?? "",
          signature: result?.signature ?? result ?? "",
        };
      },
    },
    "sui:signAndExecuteTransactionBlock": {
      version: "1.0.0",
      signAndExecuteTransactionBlock: async ({
        transactionBlock,
        chain,
        options,
      }: any) => {
        return await suiProvider.signAndExecuteTransaction(transactionBlock, {
          ...(options || {}),
          chain,
        });
      },
    },
    "sui:reportTransactionEffects": {
      version: "1.0.0",
      reportTransactionEffects: async () => {
        // No-op: some adapters require the feature to exist.
      },
    },
  };

  return {
    suiProvider,
    suiEmitter,
    features,
    getAccounts: () => _accounts,
    onAccountsChange: (cb) => _changeCbs.push(cb),
    applyExternalConnect: (address, suiPublicKeyB64) => {
      suiProvider.address = address;
      suiProvider.isConnected = true;
      const pubBytes = suiPublicKeyB64 ? base64ToBytes(suiPublicKeyB64) : null;
      updateAccounts(address, pubBytes);
      suiEmitter.emit("connect", { address });
    },
  };
}
