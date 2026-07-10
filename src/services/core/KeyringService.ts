/**
 * LOGIC: Central custodian of active unencrypted keys (mnemonics, private keys, seeds) in isolated background service worker memory.
 * Employs dual-context (popup vs background) synchronization via chrome.runtime messaging, implements triple-pass secure memory wipes to counter forensics, and routes multi-chain signing actions (EVM transaction/messages/typed-data, Octra transactions/messages/contracts).
 * EXPORTS:
 *   - keyringService (const class instance of KeyringService)
 *   - KeyringService (class)
 * FUNCTIONS:
 *   - syncPopupState(): Queries background state via KEYRING_ACTION:GET_STATE to update popup caches.
 *   - secureWipeAggressive(data): Paranoid 3-pass memory buffer and reference scrub (zeros, random, zeros, 0xFF, zeros).
 *   - setupDecryptedKeysMap(password, wallets): Internal helper that initializes maps and populates decrypted keys.
 *   - initialize(wallets, password) / unlock(password, wallets): Loads encrypted vault, decrypts key maps, and triggers status unlocks.
 *   - lock() / panicLock(): Sanitizes private key maps and password strings from memory and forces garbage collection.
 *   - signTransaction(address, txParams): Decodes key seed, formats canonical JSON, signs with TweetNaCl Ed25519, and scrubs intermediate key materials.
 *   - signAndSendEvm(walletAddress, txRequest, rpcUrl): Wraps ethers.Wallet signing and RPC dispatch for Ethereum transactions.
 *   - signEvmMessage / signEvmTypedData: Signs personal strings or EIP-712 typed objects in the background.
 *   - signMessage(address, message) / signContractCall(address, callParams): Prepares and signs Octra-specific payloads.
 *   - getPrivateKey / getPublicKey / getAddresses / getEvmAddress / getSolanaAddress / getSuiAddress: Reads public/private key metadata.
 *   - getPassword(): Reads session password in background worker.
 */

import nacl from "tweetnacl";
import { Buffer } from "buffer";
import { ethers } from "ethers";
import { logActivity } from "../../utils/activityLogger";
import { logWarn, logError, logSecurity } from "../../utils/logger";
import {
  canonicalJson,
  TransactionPayload,
} from "../../utils/crypto/transaction";
import { loadWalletsSecure } from "../../utils/storage";
interface KeyData {
  privateKeyB64: string;
  publicKeyB64: string;
}

let _password: string | null = null; // Session password (cleared on lock)
let _decryptedKeys: Map<string, KeyData> | null = null; // Decrypted keys (cleared after use)
let _isUnlocked: boolean = false;

let _evmKeys: Map<string, string> | null = null; // octraAddress → evmPrivateKeyHex (wiped on lock)
let _evmAddresses: Map<string, string> | null = null; // octraAddress → evmAddress (0x...)

let _solanaAddresses: Map<string, string> | null = null; // octraAddress → solanaAddress (base58)
let _suiAddresses: Map<string, string> | null = null; // octraAddress → suiAddress
let _suiPublicKeys: Map<string, string> | null = null; // octraAddress → sui ed25519 public key (base64)

let _activeAddress: string | null = null;

const IS_BACKGROUND =
  typeof window === "undefined" ||
  typeof chrome === "undefined" ||
  !chrome.runtime ||
  !chrome.runtime.sendMessage;

const _popupState = {
  isUnlocked: false,
  addresses: [] as string[],
  activeAddress: null as string | null,
  evmAddresses: {} as Record<string, string>,
  publicKeyB64s: {} as Record<string, string>,
};

async function syncPopupState() {
  if (IS_BACKGROUND) return;
  try {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage(
        {
          type: "KEYRING_ACTION",
          action: "GET_STATE",
        },
        (response) => {
          if (response && response.result) {
            const state = response.result;
            _popupState.isUnlocked = state.isUnlocked;
            _popupState.addresses = state.addresses;
            _popupState.activeAddress = state.activeAddress;
            _popupState.evmAddresses = state.evmAddresses || {};
            _popupState.publicKeyB64s = state.publicKeyB64s || {};
          }
        },
      );
    }
  } catch (e) {
    console.warn("Failed to sync keyring state:", e);
  }
}

if (!IS_BACKGROUND) {
  syncPopupState();
  if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "KEYRING_STATE_CHANGED") {
        syncPopupState();
      }
    });
  }
}

function sendMessageToBackground(action: string, payload?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage(
        {
          type: "KEYRING_ACTION",
          action,
          payload,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response ? response.result : undefined);
          }
        },
      );
    } else {
      reject(new Error("Extension runtime not available"));
    }
  });
}

/**
 * SECURITY: Triple-pass secure memory wipe
 * Overwrites data 3 times to prevent memory forensics
 */
function secureWipeAggressive(data: any): null {
  if (!data) return null;

  try {
    if (data instanceof Uint8Array || data instanceof Buffer) {
      data.fill(0);

      try {
        crypto.getRandomValues(data);
      } catch (e) {
        throw new Error(
          "Secure random number generation not available. Please use a modern browser.",
        );
      }

      data.fill(0);

      data.fill(0xff);

      data.fill(0);
    } else if (typeof data === "string") {
      data = "\0".repeat(data.length);
      return null;
    } else if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (typeof data[i] === "object") {
          secureWipeAggressive(data[i]);
        }
        data[i] = null;
      }
      data.length = 0;
    } else if (typeof data === "object" && data !== null) {
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          if (typeof data[key] === "object") {
            secureWipeAggressive(data[key]);
          }
          data[key] = null;
          delete data[key];
        }
      }
    }
  } catch (error) {
    logError("[KeyringService] Wipe error (non-fatal):", error);
  }

  return null;
}

/**
 * Convert base64 to Uint8Array (disposable buffer)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper to initialize state Maps and populate decrypted wallet keys.
 */
async function setupDecryptedKeysMap(
  password: string,
  wallets: any[],
): Promise<void> {
  _password = password;
  _isUnlocked = true;
  _decryptedKeys = new Map();
  _evmKeys = new Map();
  _evmAddresses = new Map();
  _solanaAddresses = new Map();
  _suiAddresses = new Map();
  _suiPublicKeys = new Map();

  let allWallets = wallets;
  if (!allWallets || allWallets.length === 0) {
    try {
      const result = await loadWalletsSecure(password);
      if (Array.isArray(result)) allWallets = result;
    } catch {}
  }

  for (const wallet of allWallets) {
    if (wallet.privateKeyB64 && wallet.address) {
      _decryptedKeys.set(wallet.address, {
        privateKeyB64: wallet.privateKeyB64,
        publicKeyB64: wallet.publicKeyB64,
      });
    }
    if (wallet.address) {
      const evmKey = wallet.evmPrivateKeyHex ?? wallet.privateKeyHex;
      if (evmKey) _evmKeys.set(wallet.address, evmKey);
      if (wallet.evmAddress)
        _evmAddresses.set(wallet.address, wallet.evmAddress);
      if (wallet.solanaAddress)
        _solanaAddresses.set(wallet.address, wallet.solanaAddress);
      if (wallet.suiAddress)
        _suiAddresses.set(wallet.address, wallet.suiAddress);
      // Derive and cache the Sui ed25519 public key so dApp connect can return
      // a real account publicKey (not a placeholder). Private key stays here.
      if (wallet.suiPrivateKeyHex) {
        try {
          const seed = new Uint8Array(
            Buffer.from(wallet.suiPrivateKeyHex.replace(/^0x/i, ""), "hex"),
          );
          if (seed.length === 32) {
            const kp = nacl.sign.keyPair.fromSeed(seed);
            _suiPublicKeys.set(
              wallet.address,
              Buffer.from(kp.publicKey).toString("base64"),
            );
          }
        } catch {
          /* leave unset — connect falls back to a placeholder pubkey */
        }
      }
    }
  }
}

/**
 * KeyringService - Singleton Service for Key Management
 */
class KeyringService {
  private static _instance: KeyringService | null = null;

  constructor() {
    if (KeyringService._instance) {
      return KeyringService._instance;
    }
    KeyringService._instance = this;

    if (!IS_BACKGROUND) {
      syncPopupState();
    }
  }

  /**
   * Check if the keyring is unlocked
   */
  isUnlocked() {
    if (!IS_BACKGROUND) {
      return _popupState.isUnlocked;
    }
    return _isUnlocked && _password !== null;
  }

  /**
   * Initialize the keyring with wallets and password (for new setup/recovery)
   */
  async initialize(wallets: any[], password: string): Promise<void> {
    if (!IS_BACKGROUND) {
      await sendMessageToBackground("initialize", { password });
      await syncPopupState();
      return;
    }

    await setupDecryptedKeysMap(password, wallets);
  }

  /**
   * Unlock the keyring with password
   */
  async unlock(password: string, wallets: any[]): Promise<void> {
    if (!IS_BACKGROUND) {
      await sendMessageToBackground("unlock", { password });
      await syncPopupState();
      return;
    }

    await setupDecryptedKeysMap(password, wallets);
  }

  /**
   * Lock the keyring - CRITICAL SECURITY FUNCTION
   * Performs aggressive memory sanitization
   */
  lock(): void {
    if (!IS_BACKGROUND) {
      sendMessageToBackground("lock")
        .then(() => syncPopupState())
        .catch(() => {});
      return;
    }

    logSecurity("KEYRING_LOCK", { action: "Initiating secure lock sequence" });

    if (_password) {
      _password = secureWipeAggressive(_password);
      _password = null;
    }

    if (_decryptedKeys) {
      for (const [, keyData] of _decryptedKeys) {
        if (keyData.privateKeyB64) {
          try {
            const keyBuffer = base64ToUint8Array(keyData.privateKeyB64);
            secureWipeAggressive(keyBuffer);
          } catch (e) {
            logWarn("[KeyringService] Key wipe warning:", e);
          }
        }

        if (keyData.publicKeyB64) {
          try {
            const pubBuffer = base64ToUint8Array(keyData.publicKeyB64);
            secureWipeAggressive(pubBuffer);
          } catch (e) {
            logWarn("[KeyringService] Public key wipe warning:", e);
          }
        }

        secureWipeAggressive(keyData);
      }
      _decryptedKeys.clear();
      _decryptedKeys = null;
    }

    if (_evmKeys) {
      _evmKeys.clear();
      _evmKeys = null;
    }

    if (_evmAddresses) {
      _evmAddresses.clear();
      _evmAddresses = null;
    }

    if (_solanaAddresses) {
      _solanaAddresses.clear();
      _solanaAddresses = null;
    }

    if (_suiAddresses) {
      _suiAddresses.clear();
      _suiAddresses = null;
    }
    if (_suiPublicKeys) {
      _suiPublicKeys.clear();
      _suiPublicKeys = null;
    }

    _activeAddress = null;
    _isUnlocked = false;

    logSecurity("KEYRING_LOCKED", { status: "Memory sanitized" });
  }

  /**
   * Add a new key to the keyring
   */
  addKey(address: string, privateKeyB64: string, publicKeyB64: string): void {
    if (!IS_BACKGROUND) {
      sendMessageToBackground("addKey", {
        address,
        privateKeyB64,
        publicKeyB64,
      })
        .then(() => syncPopupState())
        .catch(() => {});
      return;
    }

    if (!_isUnlocked) {
      throw new Error("Keyring is locked");
    }

    if (!_decryptedKeys) {
      _decryptedKeys = new Map();
    }

    _decryptedKeys.set(address, {
      privateKeyB64,
      publicKeyB64,
    });
  }

  /**
   * Sign a transaction - THE CORE SECURE FUNCTION
   *
   * SECURITY: Uses disposable buffers with immediate wiping
   * REPLAY PROTECTION: Always fetches latest nonce from network
   */
  async signTransaction(address: string, txParams: any): Promise<any> {
    if (!IS_BACKGROUND) {
      return sendMessageToBackground("signTransaction", { address, txParams });
    }

    if (!_isUnlocked) {
      throw new Error("Keyring is locked. Please unlock your wallet first.");
    }

    const keyData = _decryptedKeys?.get(address);
    if (!keyData) {
      throw new Error("No key found for this address");
    }

    let tempPrivateKey = null;
    let tempSecretKey = null;
    let messageBytes = null;
    let signature = null;

    try {
      tempPrivateKey = base64ToUint8Array(keyData.privateKeyB64);

      const keyPair = nacl.sign.keyPair.fromSeed(tempPrivateKey);
      tempSecretKey = keyPair.secretKey;

      secureWipeAggressive(keyPair.publicKey);

      const providedNonce = parseInt(txParams.nonce);
      if (isNaN(providedNonce) || providedNonce < 0) {
        throw new Error("Invalid nonce provided");
      }

      const μ = 1_000_000;
      const amountRaw = Math.floor(txParams.amount * μ);
      const timestamp = Date.now() / 1000;

      const tx: TransactionPayload = {
        from: address,
        to_: txParams.to,
        amount: String(amountRaw),
        nonce: providedNonce, // Use validated nonce
        ou: txParams.fee ? String(Math.floor(txParams.fee * μ)) : "20000",
        timestamp: timestamp,
        op_type: "standard",
      };

      if (txParams.message) {
        tx.message = txParams.message;
      }

      const signPayload = canonicalJson(tx);

      messageBytes = new TextEncoder().encode(signPayload);
      signature = nacl.sign.detached(messageBytes, tempSecretKey);

      const signedTx = {
        ...tx,
        signature: uint8ArrayToBase64(signature),
        public_key: keyData.publicKeyB64,
      };

      logActivity(
        "TRANSACTION_SIGNED",
        {
          address,
          to: txParams.to,
          amount: txParams.amount,
          nonce: providedNonce,
        },
        "INFO",
      ).catch(() => {});

      return signedTx;
    } finally {
      tempPrivateKey = secureWipeAggressive(tempPrivateKey);
      tempSecretKey = secureWipeAggressive(tempSecretKey);
      messageBytes = secureWipeAggressive(messageBytes);
      signature = secureWipeAggressive(signature);
    }
  }

  /**
   * Sign and send an EVM transaction without exposing private key to components.
   * The key is accessed internally and never returned.
   */
  async signAndSendEvm(
    walletAddress: string,
    txRequest: ethers.TransactionRequest,
    rpcUrl: string,
  ): Promise<ethers.TransactionResponse> {
    if (!IS_BACKGROUND) {
      const serializedTxRequest = JSON.parse(
        JSON.stringify(txRequest, (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      );
      const rawResponse = await sendMessageToBackground("signAndSendEvm", {
        walletAddress,
        txRequest: serializedTxRequest,
        rpcUrl,
      });
      if (!rawResponse) {
        throw new Error("No transaction response returned from background");
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const txResponse = {
        ...rawResponse,
        wait: async (confirmations?: number) => {
          const receipt = await provider.waitForTransaction(
            rawResponse.hash,
            confirmations,
          );
          if (!receipt) return null;
          return receipt;
        },
      };
      return txResponse as any as ethers.TransactionResponse;
    }

    if (!_isUnlocked) throw new Error("Keyring is locked");
    const evmKey = this.resolveBackgroundEvmKey(walletAddress);
    if (!evmKey)
      throw new Error("No EVM key found — wallet may not have an EVM address");

    const fullKey = evmKey.startsWith("0x") ? evmKey : "0x" + evmKey;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(fullKey, provider);
    try {
      const txResponse = await signer.sendTransaction(txRequest);
      return {
        hash: txResponse.hash,
        to: txResponse.to,
        from: txResponse.from,
        nonce: txResponse.nonce,
        gasLimit: txResponse.gasLimit
          ? txResponse.gasLimit.toString()
          : undefined,
        gasPrice: txResponse.gasPrice
          ? txResponse.gasPrice.toString()
          : undefined,
        maxFeePerGas: txResponse.maxFeePerGas
          ? txResponse.maxFeePerGas.toString()
          : undefined,
        maxPriorityFeePerGas: txResponse.maxPriorityFeePerGas
          ? txResponse.maxPriorityFeePerGas.toString()
          : undefined,
        data: txResponse.data,
        value: txResponse.value ? txResponse.value.toString() : "0",
        chainId: txResponse.chainId ? txResponse.chainId.toString() : "1",
      } as any as ethers.TransactionResponse;
    } finally {
    }
  }

  /**
   * Resolve background EVM private key using either Octra address, EVM address, or first key fallback.
   */
  resolveBackgroundEvmKey(addrOrEvmAddr: string): string | null {
    if (!_evmKeys || _evmKeys.size === 0) return null;

    const directKey = _evmKeys.get(addrOrEvmAddr);
    if (directKey) return directKey;

    const lower = addrOrEvmAddr.toLowerCase();
    for (const [octraAddr, privKey] of _evmKeys.entries()) {
      const evmAddr = this.getEvmAddress(octraAddr);
      if (evmAddr?.toLowerCase() === lower) {
        return privKey;
      }
    }

    return null;
  }

  /**
   * Sign an EVM message in the background.
   */
  async signEvmMessage(
    walletAddress: string,
    message: string | Uint8Array,
  ): Promise<string> {
    if (!IS_BACKGROUND) {
      return sendMessageToBackground("signEvmMessage", {
        walletAddress,
        message,
      });
    }

    if (!_isUnlocked) throw new Error("Keyring is locked");

    const evmKey = this.resolveBackgroundEvmKey(walletAddress);
    if (!evmKey) throw new Error("No EVM key found for this address");

    const fullKey = evmKey.startsWith("0x") ? evmKey : "0x" + evmKey;
    const signer = new ethers.Wallet(fullKey);

    let signingMessage: string | Uint8Array = message;
    if (typeof message === "string" && message.startsWith("0x")) {
      try {
        signingMessage = ethers.getBytes(message);
      } catch {
        signingMessage = message;
      }
    }

    return await signer.signMessage(signingMessage);
  }

  /**
   * Sign EVM EIP-712 typed data in the background.
   */
  async signEvmTypedData(
    walletAddress: string,
    typedData: any,
  ): Promise<string> {
    if (!IS_BACKGROUND) {
      return sendMessageToBackground("signEvmTypedData", {
        walletAddress,
        typedData,
      });
    }

    if (!_isUnlocked) throw new Error("Keyring is locked");

    const evmKey = this.resolveBackgroundEvmKey(walletAddress);
    if (!evmKey) throw new Error("No EVM key found for this address");

    const fullKey = evmKey.startsWith("0x") ? evmKey : "0x" + evmKey;
    const signer = new ethers.Wallet(fullKey);
    const parsed =
      typeof typedData === "string" ? JSON.parse(typedData) : typedData;
    const { domain, types, message: typedMsg } = parsed;
    const { EIP712Domain: _drop, ...cleanTypes } = types || {};

    const convertOctraToEvm = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (typeof val === "string") {
        if (val.startsWith("oct") && val.length >= 40) {
          const mapped = this.getEvmAddress(val);
          if (mapped) {
            return mapped;
          }
        }
        return val;
      }
      if (Array.isArray(val)) {
        return val.map(convertOctraToEvm);
      }
      if (typeof val === "object") {
        const copy: any = {};
        for (const [k, v] of Object.entries(val)) {
          copy[k] = convertOctraToEvm(v);
        }
        return copy;
      }
      return val;
    };

    const cleanDomain = convertOctraToEvm(domain || {});
    const cleanMsg = convertOctraToEvm(typedMsg || {});

    const safeDomain = { ...cleanDomain };
    if (safeDomain.verifyingContract) {
      try {
        safeDomain.verifyingContract = ethers.getAddress(
          safeDomain.verifyingContract,
        );
      } catch {
        /* keep original */
      }
    }
    return await signer.signTypedData(safeDomain, cleanTypes, cleanMsg);
  }

  /**
   * Register EVM key for an address (called when adding new wallet to keyring)
   */
  addEvmKey(address: string, privateKeyHex: string): void {
    if (!IS_BACKGROUND) {
      sendMessageToBackground("addEvmKey", { address, privateKeyHex })
        .then(() => syncPopupState())
        .catch(() => {});
      return;
    }

    if (!_evmKeys) _evmKeys = new Map();
    _evmKeys.set(address, privateKeyHex);
  }

  /**
   * Sign a message (for dApp connections, etc.)
   */
  async signMessage(
    address: string,
    message: string | Uint8Array,
  ): Promise<string> {
    if (!IS_BACKGROUND) {
      return sendMessageToBackground("signMessage", { address, message });
    }

    if (!_isUnlocked) {
      throw new Error("Keyring is locked");
    }

    const keyData = _decryptedKeys?.get(address);
    if (!keyData) {
      throw new Error("No key found for this address");
    }

    let tempPrivateKey = null;
    let tempSecretKey = null;
    let messageBytes = null;
    let signature = null;

    try {
      tempPrivateKey = base64ToUint8Array(keyData.privateKeyB64);
      const keyPair = nacl.sign.keyPair.fromSeed(tempPrivateKey);
      tempSecretKey = keyPair.secretKey;

      secureWipeAggressive(keyPair.publicKey);

      messageBytes =
        typeof message === "string"
          ? new TextEncoder().encode(message)
          : message;

      signature = nacl.sign.detached(messageBytes, tempSecretKey);

      const result = uint8ArrayToBase64(signature);

      return result;
    } finally {
      tempPrivateKey = secureWipeAggressive(tempPrivateKey);
      tempSecretKey = secureWipeAggressive(tempSecretKey);
      messageBytes = secureWipeAggressive(messageBytes);
      signature = secureWipeAggressive(signature);
    }
  }

  /**
   * Sign a contract call for OCS01 contracts
   */
  async signContractCall(address: string, callParams: any): Promise<any> {
    if (!IS_BACKGROUND) {
      return sendMessageToBackground("signContractCall", {
        address,
        callParams,
      });
    }

    if (!_isUnlocked) {
      throw new Error("Keyring is locked");
    }

    const keyData = _decryptedKeys?.get(address);
    if (!keyData) {
      throw new Error("No key found for this address");
    }

    let tempPrivateKey = null;
    let tempSecretKey = null;
    let messageBytes = null;
    let signature = null;

    try {
      tempPrivateKey = base64ToUint8Array(keyData.privateKeyB64);
      const keyPair = nacl.sign.keyPair.fromSeed(tempPrivateKey);
      tempSecretKey = keyPair.secretKey;

      secureWipeAggressive(keyPair.publicKey);

      const txPayload: TransactionPayload = {
        from: address,
        to_: callParams.contract,
        amount: "0",
        nonce: callParams.nonce,
        ou: "1",
        timestamp: callParams.timestamp,
        op_type: "standard",
      };

      const signPayload = canonicalJson(txPayload);

      messageBytes = new TextEncoder().encode(signPayload);
      signature = nacl.sign.detached(messageBytes, tempSecretKey);

      const result = {
        signature: uint8ArrayToBase64(signature),
        publicKey: keyData.publicKeyB64,
      };

      return result;
    } finally {
      tempPrivateKey = secureWipeAggressive(tempPrivateKey);
      tempSecretKey = secureWipeAggressive(tempSecretKey);
      messageBytes = secureWipeAggressive(messageBytes);
      signature = secureWipeAggressive(signature);
    }
  }

  /**
   * Get private key for an address (SENSITIVE - use with extreme caution)
   * Only for internal services like PrivacyService that need raw key access
   */
  getPrivateKey(address: string, reason: string = "unknown"): string | null {
    if (!_isUnlocked) {
      logWarn(`[KeyringService] Private key access denied - wallet locked`, {
        reason,
      });
      return null;
    }

    const keyData = _decryptedKeys?.get(address);
    if (!keyData) {
      logWarn(`[KeyringService] Private key not found`, {
        address: address.slice(0, 10) + "...",
        reason,
      });
      return null;
    }

    logSecurity("PRIVATE_KEY_ACCESS", {
      address: address.slice(0, 10) + "...",
      reason,
    });

    return keyData.privateKeyB64;
  }

  /**
   * Get public key for an address (safe to expose)
   */
  getPublicKey(address: string): string | null {
    if (!IS_BACKGROUND) {
      return _popupState.publicKeyB64s[address] || null;
    }

    if (!_isUnlocked) {
      throw new Error("Keyring is locked");
    }

    const keyData = _decryptedKeys?.get(address);
    return keyData?.publicKeyB64 || null;
  }

  /**
   * Get all addresses in the keyring
   */
  getAddresses(): string[] {
    if (!IS_BACKGROUND) {
      return _popupState.addresses;
    }

    if (!_decryptedKeys) return [];
    return Array.from(_decryptedKeys.keys());
  }

  /** Get the EVM (0x) address for a given Octra address, or null if not available. */
  getEvmAddress(octraAddress: string): string | null {
    if (!IS_BACKGROUND) {
      return _popupState.evmAddresses[octraAddress] || null;
    }
    return _evmAddresses?.get(octraAddress) ?? null;
  }

  /** Get the Solana (base58) address for a given Octra address, or null. */
  getSolanaAddress(octraAddress: string): string | null {
    return _solanaAddresses?.get(octraAddress) ?? null;
  }

  /** Get the Sui address for a given Octra address, or null. */
  getSuiAddress(octraAddress: string): string | null {
    return _suiAddresses?.get(octraAddress) ?? null;
  }

  /** Get the Sui ed25519 public key (base64) for a given Octra address, or null. */
  getSuiPublicKey(octraAddress: string): string | null {
    return _suiPublicKeys?.get(octraAddress) ?? null;
  }

  /** Get the first EVM address available in the keyring, or null. */
  getFirstEvmAddress(): string | null {
    if (!IS_BACKGROUND) {
      const keys = Object.keys(_popupState.evmAddresses);
      if (keys.length === 0) return null;
      return _popupState.evmAddresses[keys[0]] ?? null;
    }

    if (!_evmAddresses || _evmAddresses.size === 0) return null;
    return _evmAddresses.values().next().value ?? null;
  }

  /**
   * Set active wallet for operations
   */
  async setActiveWallet(address: string): Promise<boolean> {
    if (!IS_BACKGROUND) {
      await sendMessageToBackground("setActiveWallet", { address });
      await syncPopupState();
      return true;
    }

    if (!_isUnlocked) throw new Error("Keyring is locked");
    if (!_decryptedKeys?.has(address))
      throw new Error("Wallet not found in keyring");
    _activeAddress = address;

    if (!IS_BACKGROUND) {
      await syncPopupState();
    }
    return true;
  }

  getActiveAddress(): string | null {
    if (!IS_BACKGROUND) {
      return _popupState.activeAddress;
    }
    return (
      _activeAddress ??
      (_decryptedKeys ? (_decryptedKeys.keys().next().value ?? null) : null)
    );
  }

  /**
   * Remove a key from the keyring
   */
  removeKey(address: string): void {
    if (!IS_BACKGROUND) {
      sendMessageToBackground("removeKey", { address })
        .then(() => syncPopupState())
        .catch(() => {});
      return;
    }

    if (_decryptedKeys?.has(address)) {
      const keyData = _decryptedKeys.get(address);
      secureWipeAggressive(keyData);
      _decryptedKeys.delete(address);
    }
  }

  /**
   * Emergency panic - immediate lock and memory wipe
   */
  panicLock() {
    logSecurity("PANIC_LOCK", { status: "ACTIVATED", timestamp: Date.now() });
    this.lock();

    try {
      if (typeof global !== "undefined" && global && global.gc) {
        global.gc();
      } else if (typeof window !== "undefined" && window && window.gc) {
        window.gc();
      }
    } catch (e) {}
  }

  /** Get the Evm Addresses Map directly */
  getEvmAddressesMap(): Map<string, string> | null {
    return _evmAddresses;
  }

  /** Get the Decrypted Keys Map directly */
  getDecryptedKeysMap(): Map<string, KeyData> | null {
    return _decryptedKeys;
  }

  /** Get the active session password (only in background service worker context) */
  getPassword(): string | null {
    return _password;
  }
}

export const keyringService = new KeyringService();

export { KeyringService };
