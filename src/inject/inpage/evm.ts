/**
 * EVM PROVIDER (window.ethereum + window.octra)
 * EIP-1193 request surface (incl. read-method passthrough crucial for
 * staking/DeFi dApps), Octra-native methods, event handlers, connection
 * auto-restore, and EIP-6963 announcement.
 */

import { ProviderRpcError, toRpcError } from "./errors";
import { makeEmitter, type Bridge, type Emitter } from "./bridge";
import { QIUBIT_ICON } from "./icon";

const OSM_VERSION = "OSM-1";

export interface EvmInit {
  evmProvider: any;
  octraProvider: any;
  evmEmitter: Emitter;
}

export function initEvm(bridge: Bridge): EvmInit {
  const { sendRequest } = bridge;
  const evmEmitter = makeEmitter();
  bridge.registerEmitter("evm", evmEmitter);

  const evmProvider: any = {
    isOctraWallet: true,
    isQiubitWallet: true,
    isOctra: true,
    isMetaMask: false,
    version: "1.0.0",
    name: "Qiubit",

    isConnected: false,
    selectedAddress: null as string | null,
    networkId: null as string | null,
    chainId: null as number | null,
    networkSetting: null as string | null,

    // MetaMask compatibility: _metamask.isUnlocked()
    _metamask: {
      isUnlocked: () => Promise.resolve(evmProvider.isConnected),
    },

    getNetwork() {
      return {
        networkId: this.networkId,
        chainId: this.chainId,
        networkSetting: this.networkSetting,
        isTestnet: this.networkSetting === "sepolia",
      };
    },

    async connect(options: any = {}) {
      const result = await sendRequest("connect", {
        appInfo: options.appInfo || {
          name: document.title,
          url: window.location.origin,
        },
      });
      if (result.accounts && result.accounts.length > 0) {
        this.isConnected = true;
        // Ensure we use EVM address (0x...) as selectedAddress
        const evmAddr =
          result.evmAddress ||
          result.accounts.find((a: string) => a && a.startsWith("0x"));
        this.selectedAddress = evmAddr || result.selectedAddress || result.accounts[0];
        this.octraAddress = result.octraAddress || null;
        this.evmAddress = result.evmAddress || null;
        this.networkId = result.networkId;
        this.chainId = result.chainId;
        this.networkSetting = result.networkSetting || "octra";
        const chainHex = result.chainId
          ? "0x" + result.chainId.toString(16)
          : "0x1";
        evmEmitter.emit("connect", { chainId: chainHex });
      }
      return result;
    },

    async disconnect() {
      await sendRequest("disconnect");
      this.isConnected = false;
      this.selectedAddress = null;
      evmEmitter.emit("accountsChanged", []);
      evmEmitter.emit(
        "disconnect",
        new ProviderRpcError(4900, "Disconnected from chain"),
      );
    },

    async getAccounts() {
      if (!this.isConnected) return [];
      return sendRequest("getAccounts");
    },

    async getPublicKey() {
      if (!this.isConnected) throw new ProviderRpcError(4100, "Not connected");
      return sendRequest("getPublicKey");
    },

    async getBalance(address?: string) {
      return sendRequest("getBalance", {
        address: address || this.selectedAddress,
      });
    },

    async getEncryptedBalance() {
      if (!this.isConnected) throw new ProviderRpcError(4100, "Not connected");
      return sendRequest("getEncryptedBalance");
    },

    async signMessage(messageOrPayload: any) {
      if (!this.isConnected) throw new ProviderRpcError(4100, "Not connected");
      let payload;
      if (typeof messageOrPayload === "string") {
        payload = {
          version: OSM_VERSION,
          message: messageOrPayload,
          address: this.selectedAddress,
          domain: window.location.origin,
          nonce: crypto.randomUUID(),
          timestamp: Date.now(),
        };
      } else {
        payload = {
          version: OSM_VERSION,
          ...messageOrPayload,
          address: messageOrPayload.address || this.selectedAddress,
          domain: messageOrPayload.domain || window.location.origin,
          nonce: messageOrPayload.nonce || crypto.randomUUID(),
          timestamp: messageOrPayload.timestamp || Date.now(),
        };
      }
      return sendRequest("signMessage", { payload });
    },

    async signTransaction(txParams: any) {
      if (!this.isConnected) throw new ProviderRpcError(4100, "Not connected");
      return sendRequest("signTransaction", {
        ...txParams,
        from: txParams.from || this.selectedAddress,
      });
    },

    async sendTransaction(txParams: any) {
      if (!this.isConnected) throw new ProviderRpcError(4100, "Not connected");
      return sendRequest("sendTransaction", {
        ...txParams,
        from: txParams.from || this.selectedAddress,
      });
    },

    async callContract(
      contractAddress: string,
      method: string,
      params: any[] = [],
      options: any = {},
    ) {
      if (!this.isConnected) throw new ProviderRpcError(4100, "Not connected");
      return sendRequest("contractCall", {
        address: contractAddress,
        method,
        params,
        amount: options.amount || "0",
      });
    },

    async callContractView(
      contractAddress: string,
      method: string,
      params: any[] = [],
    ) {
      return sendRequest("contractView", {
        address: contractAddress,
        method,
        params,
        caller: this.selectedAddress,
      });
    },

    async getPendingTransactions() {
      if (!this.isConnected) throw new ProviderRpcError(4100, "Not connected");
      return sendRequest("getPendingTransactions");
    },

    async request(args: { method: string; params?: any }): Promise<any> {
      const method = args.method;
      const params = args.params ?? [];

      switch (method) {
        case "eth_requestAccounts": {
          const res = await this.connect();
          // Return ONLY EVM addresses (0x...) — MetaMask standard
          if (res.evmAddress) return [res.evmAddress];
          const evmAccounts = (res.accounts || []).filter(
            (a: string) => a && a.startsWith("0x"),
          );
          return evmAccounts.length > 0 ? evmAccounts : res.accounts || [];
        }

        case "eth_accounts": {
          // Forward directly to background — no isConnected guard.
          // MetaMask returns accounts based on permissions, not in-page state.
          // This also lets the page know it's connected after a page reload
          // without requiring the user to call eth_requestAccounts again.
          const accounts = await sendRequest("eth_accounts", {});
          if (Array.isArray(accounts)) {
            const evm = accounts.filter((a: string) => a && a.startsWith("0x"));
            const result = evm.length > 0 ? evm : accounts;
            // Sync local state so subsequent sendTransaction checks pass
            if (result.length > 0 && !this.isConnected) {
              this.isConnected = true;
              this.selectedAddress = result[0];
            }
            return result;
          }
          return this.selectedAddress ? [this.selectedAddress] : [];
        }

        case "eth_chainId": {
          if (this.chainId != null) return "0x" + this.chainId.toString(16);
          // sendRequest resolves the unwrapped result (a hex string)
          const hex = await sendRequest("eth_chainId", {});
          if (typeof hex === "string" && hex.startsWith("0x")) {
            this.chainId = parseInt(hex, 16);
            return hex;
          }
          return "0x1";
        }

        case "net_version": {
          if (this.chainId != null) return String(this.chainId);
          const hex = await sendRequest("eth_chainId", {});
          return String(parseInt(typeof hex === "string" ? hex : "0x1", 16));
        }

        case "eth_sendTransaction": {
          if (!this.isConnected)
            throw new ProviderRpcError(4100, "Not connected");
          const txParams = Array.isArray(params) ? params[0] : params;
          // A dApp-supplied chainId must win over the cached one
          const res = await sendRequest("eth_sendTransaction", {
            ...txParams,
            from: txParams.from || this.selectedAddress,
            chainId: txParams.chainId ?? this.chainId,
          });
          if (res?.error) throw toRpcError(res.error);
          const raw = res?.result ?? res;
          if (typeof raw === "string") return raw;
          return raw?.hash ?? raw?.txHash ?? raw;
        }

        case "personal_sign": {
          const message = Array.isArray(params) ? params[0] : params.message;
          const fromAddr =
            (Array.isArray(params) ? params[1] : params.from) ||
            this.selectedAddress;
          if (!this.isConnected)
            throw new ProviderRpcError(4100, "Not connected");
          const res = await sendRequest("personal_sign", {
            message,
            from: fromAddr,
            chainId: this.chainId,
          });
          if (res?.error) throw toRpcError(res.error);
          return res?.result ?? res;
        }

        case "eth_sign": {
          const fromAddr = Array.isArray(params) ? params[0] : params.from;
          const message = Array.isArray(params) ? params[1] : params.message;
          if (!this.isConnected)
            throw new ProviderRpcError(4100, "Not connected");
          const res = await sendRequest("personal_sign", {
            message,
            from: fromAddr,
            chainId: this.chainId,
          });
          if (res?.error) throw toRpcError(res.error);
          return res?.result ?? res;
        }

        case "eth_signTypedData":
        case "eth_signTypedData_v1":
        case "eth_signTypedData_v3":
        case "eth_signTypedData_v4": {
          const fromAddr = Array.isArray(params) ? params[0] : params.from;
          const typedData = Array.isArray(params) ? params[1] : params.typedData;
          if (!this.isConnected)
            throw new ProviderRpcError(4100, "Not connected");
          const res = await sendRequest("eth_signTypedData_v4", {
            from: fromAddr,
            typedData,
            chainId: this.chainId,
          });
          if (res?.error) throw toRpcError(res.error);
          return res?.result ?? res;
        }

        case "wallet_addEthereumChain": {
          const networkParams = Array.isArray(params) ? params[0] : params;
          const res = await sendRequest("wallet_addEthereumChain", networkParams);
          if (res?.error) throw toRpcError(res.error);
          return res?.result ?? null;
        }

        case "wallet_switchEthereumChain": {
          const switchParams = Array.isArray(params) ? params[0] : params;
          // A failed switch rejects sendRequest and throws; reaching this point
          // means the background accepted the switch. (The background also
          // broadcasts 'chainChanged' to this origin, which emits the event to
          // dApp listeners.)
          await sendRequest("wallet_switchEthereumChain", switchParams);
          if (switchParams.chainId) {
            this.chainId = parseInt(switchParams.chainId, 16);
          }
          return null;
        }

        case "wallet_getPermissions":
          return [{ parentCapability: "eth_accounts" }];

        case "wallet_requestPermissions":
          return this.request({ method: "eth_requestAccounts", params: [] }).then(
            (accounts: string[]) => [
              {
                parentCapability: "eth_accounts",
                caveats: [
                  { type: "restrictReturnedAccounts", value: accounts },
                ],
              },
            ],
          );

        case "wallet_revokePermissions":
          return null;

        // sendRequest resolves the unwrapped RPC result directly
        case "eth_gasPrice":
        case "eth_blockNumber":
        case "eth_maxPriorityFeePerGas":
          try {
            const res = await sendRequest(method, params);
            return res ?? (method === "eth_gasPrice" ? "0x1DCD6500" : "0x0");
          } catch {
            return method === "eth_gasPrice" ? "0x1DCD6500" : "0x0";
          }

        case "eth_getTransactionCount": {
          const res = await sendRequest("eth_getTransactionCount", params);
          return res ?? "0x0";
        }
        case "eth_estimateGas":
          try {
            const res = await sendRequest("eth_estimateGas", params);
            return res ?? "0x186A0";
          } catch {
            return "0x186A0";
          }

        case "eth_getBalance": {
          const res = await sendRequest("eth_getBalance", params);
          return res ?? "0x0";
        }

        case "eth_call":
        case "eth_getBlockByNumber":
        case "eth_getBlockByHash":
        case "eth_getTransactionReceipt":
        case "eth_getTransactionByHash":
        case "eth_getCode":
        case "eth_getLogs": {
          const res = await sendRequest(method, params);
          if (res?.error) throw toRpcError(res.error);
          return res?.result ?? res;
        }

        // Octra-native methods (supporting both prefixed and EIP-1193/custom
        // non-prefixed versions for dApps)
        case "requestAccounts":
        case "octra_requestAccounts": {
          const res = await this.connect();
          return res.accounts;
        }

        case "accounts":
        case "octra_accounts":
          return this.getAccounts();

        case "chainId":
        case "octra_chainId":
          return this.chainId;

        case "signMessage":
        case "octra_signMessage":
          return this.signMessage(params);

        case "sendTransaction":
        case "octra_sendTransaction":
          return this.sendTransaction(params);

        case "contractCall":
        case "octra_callContract": {
          const addr = Array.isArray(params) ? params[0] : params.address;
          const contractMethod = Array.isArray(params) ? params[1] : params.method;
          const contractArgs = Array.isArray(params)
            ? params[2] || []
            : params.params || [];
          const opts = Array.isArray(params)
            ? params[3] || {}
            : params.options || { amount: params.amount || "0" };
          return this.callContract(addr, contractMethod, contractArgs, opts);
        }

        case "contractView":
        case "octra_callContractView": {
          const addr = Array.isArray(params) ? params[0] : params.address;
          const contractMethod = Array.isArray(params) ? params[1] : params.method;
          const contractArgs = Array.isArray(params)
            ? params[2] || []
            : params.params || [];
          return this.callContractView(addr, contractMethod, contractArgs);
        }

        case "getPendingTransactions":
        case "octra_getPendingTransactions":
          return this.getPendingTransactions();

        case "disconnect":
        case "octra_disconnect":
          return this.disconnect();

        case "getPublicKey":
        case "octra_getPublicKey":
          return this.getPublicKey();

        case "getBalance":
        case "octra_getBalance":
          return this.getBalance(params?.address);

        case "getEncryptedBalance":
        case "octra_getEncryptedBalance":
          return this.getEncryptedBalance();

        case "signTransaction":
        case "octra_signTransaction":
          return this.signTransaction(params);

        default:
          throw new ProviderRpcError(4200, `Method not supported: ${method}`);
      }
    },

    on(event: string, cb: any) {
      return evmEmitter.on(event, cb);
    },
    off(event: string, cb: any) {
      return evmEmitter.off(event, cb);
    },
    addListener(event: string, cb: any) {
      return evmEmitter.on(event, cb);
    },
    removeListener(event: string, cb: any) {
      return evmEmitter.off(event, cb);
    },
    removeAllListeners(event?: string) {
      return evmEmitter.removeAllListeners(event);
    },
    once(event: string, cb: any) {
      return evmEmitter.once(event, cb);
    },
    listeners(event: string) {
      return evmEmitter.listeners(event);
    },
  };

  // Octra provider shares the EVM surface but connects on the Octra network.
  const octraProvider = Object.create(evmProvider);
  octraProvider.connect = async function (options: any = {}) {
    const result = await sendRequest("connect", {
      appInfo: options.appInfo || {
        name: document.title,
        url: window.location.origin,
      },
      networkSetting: "octra",
    });
    if (result.accounts && result.accounts.length > 0) {
      this.isConnected = true;
      this.selectedAddress = result.selectedAddress || result.accounts[0];
      this.octraAddress = result.octraAddress || null;
      this.evmAddress = result.evmAddress || null;
      this.networkId = "octra";
      this.chainId = 1;
      this.networkSetting = "octra";
      evmEmitter.emit("connect", { chainId: "0x1" });
    }
    return result;
  };
  octraProvider.request = async function (args: { method: string; params?: any }) {
    const method = args.method;
    if (method === "eth_requestAccounts" || method === "octra_requestAccounts") {
      const res = await this.connect();
      return [res.selectedAddress || res.accounts[0]];
    }
    return evmProvider.request.call(this, args);
  };

  // Handle wallet lock/account change events from background
  evmEmitter.on("accountsChanged", (accounts: string[]) => {
    const newAddr =
      Array.isArray(accounts) && accounts.length > 0 ? accounts[0] : null;
    evmProvider.selectedAddress = newAddr;
    evmProvider.isConnected = !!newAddr;
    octraProvider.selectedAddress = newAddr;
    octraProvider.isConnected = !!newAddr;
  });
  evmEmitter.on("disconnect", () => {
    evmProvider.selectedAddress = null;
    evmProvider.isConnected = false;
    octraProvider.selectedAddress = null;
    octraProvider.isConnected = false;
  });
  // Keep the cached chainId in sync when the background announces a chain
  // switch (e.g. triggered from another tab of the same origin).
  evmEmitter.on("chainChanged", (chainIdHex: string) => {
    if (typeof chainIdHex === "string" && chainIdHex.startsWith("0x")) {
      evmProvider.chainId = parseInt(chainIdHex, 16);
    }
  });

  bridge.registerProvider("octra", octraProvider);
  bridge.registerProvider("ethereum", evmProvider);

  // Auto-restore EVM connection state on page load.
  // When the page reloads, isConnected resets to false. Ask the background if
  // this origin already has a connection (saved from a prior session). If it
  // does, restore selectedAddress / chainId so dApps don't need to call
  // eth_requestAccounts again.
  (async () => {
    try {
      const accounts = await sendRequest("eth_accounts", {});
      if (Array.isArray(accounts) && accounts.length > 0) {
        const evmAddr =
          accounts.find((a: string) => a && a.startsWith("0x")) || accounts[0];
        evmProvider.isConnected = true;
        evmProvider.selectedAddress = evmAddr;
        try {
          const chainHex = await sendRequest("eth_chainId", {});
          if (typeof chainHex === "string" && chainHex.startsWith("0x")) {
            evmProvider.chainId = parseInt(chainHex, 16);
          }
        } catch {
          /* ignore */
        }
        evmEmitter.emit("connect", {
          chainId: "0x" + (evmProvider.chainId || 1).toString(16),
        });
        evmEmitter.emit("accountsChanged", [evmAddr]);
      }
    } catch {
      /* ignore */
    }
  })();

  // ─── EIP-6963 ─────────────────────────────────────────────────────────────

  const eip6963Info = Object.freeze({
    uuid: "b8f8b5a0-4e2d-4c6a-9f3b-1d7e5c9a2f40",
    name: "Qiubit Wallet",
    icon: QIUBIT_ICON,
    rdns: "io.qiubit.wallet",
  });

  function announceEvmProvider() {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({ info: eip6963Info, provider: evmProvider }),
      }),
    );
  }
  announceEvmProvider();
  window.addEventListener("eip6963:requestProvider", announceEvmProvider);

  return { evmProvider, octraProvider, evmEmitter };
}
