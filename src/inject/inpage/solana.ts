/**
 * SOLANA PROVIDER (window.solana) + @solana/wallet-standard features.
 * Phantom-compatible provider API plus the full Wallet Standard feature set
 * (signMessage / signTransaction / signAndSendTransaction / signIn) with
 * supportedTransactionVersions — required or adapters crash the dApp.
 */

import { ProviderRpcError, toRpcError } from "./errors";
import { makeEmitter, type Bridge, type Emitter } from "./bridge";
import {
  SolanaPublicKey,
  normalizeSolanaSignature,
  solTxToBase64,
  toUint8,
} from "./encoding";

export interface SolanaInit {
  solanaProvider: any;
  solanaEmitter: Emitter;
  features: Record<string, any>;
  getAccounts(): any[];
  onAccountsChange(cb: () => void): void;
  /** Mark connected from the unified multichain connect flow. */
  applyExternalConnect(pubkeyStr: string): void;
}

export function initSolana(bridge: Bridge): SolanaInit {
  const { sendRequest } = bridge;
  const solanaEmitter = makeEmitter();
  bridge.registerEmitter("solana", solanaEmitter);

  let _accounts: any[] = [];
  let _listeners: Array<(e: { accounts: any[] }) => void> = [];
  const _changeCbs: Array<() => void> = [];

  function updateAccounts(publicKey: SolanaPublicKey | null): void {
    _accounts = publicKey
      ? [
          {
            address: publicKey.toBase58(),
            publicKey: publicKey.toBytes(),
            chains: ["solana:mainnet", "solana:devnet", "solana:testnet"],
            features: [
              "solana:signMessage",
              "solana:signTransaction",
              "solana:signAndSendTransaction",
              "solana:signIn",
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

  const solanaProvider: any = {
    isQiubitWallet: true,
    isPhantom: false, // do not impersonate Phantom
    isSolflare: false,
    name: "Qiubit",

    // publicKey is a SolanaPublicKey object (not a plain string) — matches
    // the Phantom API surface.
    publicKey: null as SolanaPublicKey | null,
    isConnected: false,

    async connect(opts: any = {}) {
      const result = await sendRequest("solana_connect", {
        appInfo: opts.appInfo || {
          name: document.title,
          url: window.location.origin,
        },
        onlyIfTrusted: opts.onlyIfTrusted ?? false,
      });
      if (result?.publicKey) {
        this.publicKey = new SolanaPublicKey(result.publicKey);
        this.isConnected = true;
        solanaEmitter.emit("connect", this.publicKey);
        updateAccounts(this.publicKey);
      }
      return { publicKey: this.publicKey };
    },

    async disconnect() {
      await sendRequest("solana_disconnect", {});
      this.publicKey = null;
      this.isConnected = false;
      solanaEmitter.emit("disconnect", undefined);
      updateAccounts(null);
    },

    async signTransaction(serializedTx: any) {
      if (!this.isConnected)
        throw new ProviderRpcError(4100, "Not connected to Solana");
      const pkStr = this.publicKey?.toBase58() ?? "";
      const res = await sendRequest("solana_signTransaction", {
        transaction: solTxToBase64(serializedTx),
        publicKey: pkStr,
      });
      if (res?.error) throw toRpcError(res.error);
      // Return signed transaction in same format as input (pass-through)
      return res?.result ?? res;
    },

    async signAllTransactions(transactions: any[]) {
      if (!this.isConnected)
        throw new ProviderRpcError(4100, "Not connected to Solana");
      const pkStr = this.publicKey?.toBase58() ?? "";
      const encoded = Array.isArray(transactions)
        ? transactions.map(solTxToBase64)
        : transactions;
      const res = await sendRequest("solana_signAllTransactions", {
        transactions: encoded,
        publicKey: pkStr,
      });
      if (res?.error) throw toRpcError(res.error);
      return res?.result ?? res;
    },

    async signMessage(message: any, encoding = "utf8") {
      if (!this.isConnected)
        throw new ProviderRpcError(4100, "Not connected to Solana");
      const pkStr = this.publicKey?.toBase58() ?? "";
      // Normalize input message
      let msgData: number[];
      if (message instanceof Uint8Array) {
        msgData = Array.from(message);
      } else if (typeof message === "string") {
        msgData = Array.from(new TextEncoder().encode(message));
      } else if (Array.isArray(message)) {
        msgData = message;
      } else {
        msgData = Array.from(new TextEncoder().encode(String(message)));
      }
      const res = await sendRequest("solana_signMessage", {
        message: msgData,
        encoding,
        publicKey: pkStr,
      });
      if (res?.error) throw toRpcError(res.error);
      const raw = res?.result ?? res;
      // Normalize to Phantom-compatible format:
      // { signature: Uint8Array, publicKey: SolanaPublicKey }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return {
          signature: normalizeSolanaSignature(raw.signature ?? raw),
          publicKey: new SolanaPublicKey(raw.publicKey ?? pkStr),
        };
      }
      // raw is the signature bytes directly
      return {
        signature: normalizeSolanaSignature(raw),
        publicKey: this.publicKey,
      };
    },

    async sendTransaction(serializedTx: any, opts: any = {}) {
      if (!this.isConnected)
        throw new ProviderRpcError(4100, "Not connected to Solana");
      const pkStr = this.publicKey?.toBase58() ?? "";
      const res = await sendRequest("solana_sendTransaction", {
        transaction: solTxToBase64(serializedTx),
        options: opts,
        publicKey: pkStr,
      });
      if (res?.error) throw toRpcError(res.error);
      return res?.result ?? res; // tx signature string
    },

    on(event: string, cb: any) {
      return solanaEmitter.on(event, cb);
    },
    off(event: string, cb: any) {
      return solanaEmitter.off(event, cb);
    },
    addListener(event: string, cb: any) {
      return solanaEmitter.on(event, cb);
    },
    removeListener(event: string, cb: any) {
      return solanaEmitter.off(event, cb);
    },
    once(event: string, cb: any) {
      return solanaEmitter.once(event, cb);
    },
  };

  // Handle accountChanged from background (user switched wallet).
  // Only raw strings (or null) come from the background; the re-emit below
  // delivers a SolanaPublicKey (or undefined) to dApp listeners. Guarding on
  // the incoming type prevents the re-emit from looping back into this
  // handler forever.
  solanaEmitter.on("accountChanged", (pubkeyStr: any) => {
    if (typeof pubkeyStr === "string" && pubkeyStr) {
      const newKey = new SolanaPublicKey(pubkeyStr);
      solanaProvider.publicKey = newKey;
      solanaProvider.isConnected = true;
      updateAccounts(newKey);
      // Emit to dApp listeners
      solanaEmitter.emit("accountChanged", newKey);
    } else if (pubkeyStr === null) {
      solanaProvider.publicKey = null;
      solanaProvider.isConnected = false;
      updateAccounts(null);
      solanaEmitter.emit("accountChanged", undefined);
    }
  });

  bridge.registerProvider("solana", solanaProvider);

  // ─── Solana Wallet Standard features ──────────────────────────────────────

  const features: Record<string, any> = {
    "standard:connect": {
      version: "1.0.0",
      connect: async ({ silent }: any = {}) => {
        if (silent && solanaProvider.isConnected && solanaProvider.publicKey) {
          return { accounts: _accounts };
        }
        await solanaProvider.connect({ onlyIfTrusted: silent ?? false });
        return { accounts: _accounts };
      },
    },
    "standard:disconnect": {
      version: "1.0.0",
      disconnect: () => solanaProvider.disconnect(),
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
    "solana:signMessage": {
      version: "1.0.0",
      signMessage: async ({ message }: any) => {
        const result = await solanaProvider.signMessage(new Uint8Array(message));
        return [{ signedMessage: message, signature: result.signature }];
      },
    },
    "solana:signTransaction": {
      version: "1.0.0",
      // Required by @solana/wallet-standard adapters; its absence makes the
      // StandardWalletAdapter constructor read `.length` of undefined and
      // crash the whole dApp (Jupiter/Meteora "Oops"). We handle both legacy
      // and v0 (versioned) transactions in signTransaction.
      supportedTransactionVersions: ["legacy", 0],
      signTransaction: async ({ transaction }: any) => {
        const signed = await solanaProvider.signTransaction(transaction);
        // Wallet Standard requires raw bytes, not a base64 string.
        return [{ signedTransaction: toUint8(signed) }];
      },
    },
    "solana:signAndSendTransaction": {
      version: "1.0.0",
      supportedTransactionVersions: ["legacy", 0],
      signAndSendTransaction: async ({ transaction, chain, options }: any) => {
        // Thread the target cluster through so devnet/testnet dApps broadcast
        // to their own cluster instead of mainnet.
        const sig = await solanaProvider.sendTransaction(transaction, {
          ...(options || {}),
          chain,
        });
        // Signature must be raw bytes (base58 string → bytes).
        return [
          {
            signature: toUint8(
              typeof sig === "string" ? sig : (sig?.signature ?? sig),
            ),
          },
        ];
      },
    },
    // Sign In With Solana (SIWS) — optional but expected by auth flows.
    "solana:signIn": {
      version: "1.0.0",
      signIn: async (...inputs: any[]) => {
        const list = inputs.length ? inputs : [{}];
        const outputs: any[] = [];
        for (const input of list) {
          if (!solanaProvider.isConnected || !solanaProvider.publicKey) {
            await solanaProvider.connect({ onlyIfTrusted: false });
          }
          const address = input.address || solanaProvider.publicKey.toBase58();
          const domain = input.domain || window.location.host;
          const text = createSignInMessageText({ ...input, address, domain });
          const messageBytes = new TextEncoder().encode(text);
          const result = await solanaProvider.signMessage(messageBytes);
          outputs.push({
            account: _accounts[0],
            signedMessage: messageBytes,
            signature: toUint8(result.signature),
            signatureType: "ed25519",
          });
        }
        return outputs;
      },
    },
  };

  return {
    solanaProvider,
    solanaEmitter,
    features,
    getAccounts: () => _accounts,
    onAccountsChange: (cb) => _changeCbs.push(cb),
    applyExternalConnect: (pubkeyStr: string) => {
      solanaProvider.publicKey = new SolanaPublicKey(pubkeyStr);
      solanaProvider.isConnected = true;
      updateAccounts(solanaProvider.publicKey);
      solanaEmitter.emit("connect", solanaProvider.publicKey);
    },
  };
}

/**
 * Build the canonical Sign In With Solana message text (matches
 * @solana/wallet-standard-util createSignInMessageText).
 */
function createSignInMessageText(input: any): string {
  let message = `${input.domain} wants you to sign in with your Solana account:\n`;
  message += `${input.address}`;
  if (input.statement) message += `\n\n${input.statement}`;
  const fields: string[] = [];
  if (input.uri) fields.push(`URI: ${input.uri}`);
  if (input.version) fields.push(`Version: ${input.version}`);
  if (input.chainId) fields.push(`Chain ID: ${input.chainId}`);
  if (input.nonce) fields.push(`Nonce: ${input.nonce}`);
  if (input.issuedAt) fields.push(`Issued At: ${input.issuedAt}`);
  if (input.expirationTime)
    fields.push(`Expiration Time: ${input.expirationTime}`);
  if (input.notBefore) fields.push(`Not Before: ${input.notBefore}`);
  if (input.requestId) fields.push(`Request ID: ${input.requestId}`);
  if (input.resources && input.resources.length) {
    fields.push("Resources:");
    for (const r of input.resources) fields.push(`- ${r}`);
  }
  if (fields.length) message += `\n\n${fields.join("\n")}`;
  return message;
}
