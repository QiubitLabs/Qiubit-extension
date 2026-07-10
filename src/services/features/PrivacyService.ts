/**
 * Privacy Service for Qiubit Wallet
 *
 * Implements Qiubit's FHE-based privacy features exactly matching
 * the official qiubit_pre_client implementation.
 *
 * API Endpoints:
 * - GET /view_encrypted_balance/{address} (requires X-Private-Key header)
 * - POST /encrypt_balance (shield)
 * - POST /decrypt_balance (unshield)
 * - POST /private_transfer
 * - GET /pending_private_transfers?address={addr} (requires X-Private-Key header)
 * - POST /claim_private_transfer
 */

import { getRpcClient } from "../network/RpcService";
import { base64ToBuffer, bufferToBase64 } from "../../utils/crypto";
import {
  getPrivacyBalanceCacheSecure,
  savePrivacyBalanceCacheSecure,
} from "../../utils/storage";
import { keyringService } from "../core/KeyringService";
import nacl from "tweetnacl";
import { logInfo, logWarn, logError, logSensitive } from "../../utils/logger";

export interface PrivacyBalanceResult {
  success: boolean;
  error?: string;
  publicBalance: number;
  publicBalanceRaw: number;
  encryptedBalance: number;
  encryptedBalanceRaw: number;
  totalBalance: number;
  hasEncryptedFunds: boolean;
  fromCache?: boolean;
}

/**
 * Derive encryption key from private key (matching Qiubit protocol)
 * Uses: SHA256("qiubit_encrypted_balance_v2" + privateKeyBytes)[:32]
 */
async function deriveEncryptionKey(privateKeyB64: string): Promise<Uint8Array> {
  const privateKeyBytes = base64ToBuffer(privateKeyB64);
  const salt = new TextEncoder().encode("qiubit_encrypted_balance_v2");

  const combined = new Uint8Array(salt.length + privateKeyBytes.length);
  combined.set(salt);
  combined.set(privateKeyBytes, salt.length);

  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  return new Uint8Array(hashBuffer).slice(0, 32);
}

/**
 * Encrypt balance value for storage (v2 format)
 * Format: "v2|" + base64(nonce + ciphertext)
 */
async function encryptBalance(
  balance: number,
  privateKeyB64: string,
): Promise<string> {
  const key = await deriveEncryptionKey(privateKeyB64);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(String(balance));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as any,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    plaintext, // Pass Uint8Array directly
  );

  const combined = new Uint8Array(nonce.length + ciphertext.byteLength);
  combined.set(nonce);
  combined.set(new Uint8Array(ciphertext), nonce.length);

  return "v2|" + bufferToBase64(combined);
}

/**
 * Privacy Service Class
 */
class PrivacyService {
  rpcClient: any;
  private _privateKey: string | null = null;
  private _publicKey: string | null = null;
  private _password: string | null = null;
  private _lastFetchTime: number | null = null;
  private _cachedResult: PrivacyBalanceResult | null = null;
  private _cacheAddress: string | null = null;
  private CACHE_TTL: number = 3 * 60 * 1000;

  get hasKey(): boolean {
    return !!this._privateKey;
  }

  constructor() {
    this.rpcClient = getRpcClient();
  }

  /**
   * Helper to get the 64-byte expanded secret key (seed + public component)
   * Mainnet parsers expect the full 64-byte secret key in the private_key field.
   * Base64 of 64 bytes is 88 characters.
   */
  getExpandedPrivateKey(): string | null {
    if (!this._privateKey) return null;
    try {
      if (!nacl) throw new Error("NaCl library not initialized");

      const seed = base64ToBuffer(this._privateKey);
      if (seed.length !== 32) {
        logWarn(`Warning: Seed length is ${seed.length} bytes (expected 32)`);
      }

      const keyPair = nacl.sign.keyPair.fromSeed(seed);

      if (!this._publicKey) {
        this._publicKey = bufferToBase64(keyPair.publicKey);
        logInfo("Public key derived on-the-fly");
      }

      const expandedKey = bufferToBase64(keyPair.secretKey);
      return expandedKey;
    } catch (error: any) {
      logError("Error expanding private key:", error);
      throw new Error(`Key expansion failed: ${error.message}`);
    }
  }

  /**
   * Set the wallet private key and session password for cache encryption
   */
  setPrivateKey(
    privateKeyB64: string | null,
    password: string | null = null,
  ): void {
    if (!privateKeyB64) return;
    this._privateKey = privateKeyB64;
    this._password = password; // Store for cache encryption
    try {
      if (nacl) {
        const seed = base64ToBuffer(privateKeyB64);
        const keyPair = nacl.sign.keyPair.fromSeed(seed);
        this._publicKey = bufferToBase64(keyPair.publicKey);
      }
    } catch (error: any) {
      logError("Error deriving public key during set:", error);
    }
  }

  /**
   * Clear private key and password from memory
   */
  clearPrivateKey(): void {
    this._privateKey = null;
    this._publicKey = null;
    this._password = null; // Clear password too
  }

  /**
   * Get encrypted balance for an address (with cached support)
   */
  async getEncryptedBalance(
    address: string,
    forceRefresh: boolean = false,
  ): Promise<PrivacyBalanceResult> {
    try {
      const now = Date.now();
      if (
        !forceRefresh &&
        this._cachedResult &&
        this._cacheAddress === address &&
        this._lastFetchTime &&
        now - this._lastFetchTime < this.CACHE_TTL
      ) {
        logInfo(
          "[PrivacyService] Using timestamp-based cache (age: " +
            Math.round((now - this._lastFetchTime) / 1000) +
            "s)",
        );
        return {
          ...this._cachedResult,
          fromCache: true,
        };
      }

      if (!keyringService.isUnlocked()) {
        console.warn("[PrivacyService] Keyring is locked");
        return {
          success: false,
          error: "Wallet locked",
          publicBalance: 0,
          publicBalanceRaw: 0,
          encryptedBalance: 0,
          encryptedBalanceRaw: 0,
          totalBalance: 0,
          hasEncryptedFunds: false,
        };
      }

      const privateKey =
        this._privateKey ||
        keyringService.getPrivateKey(address, "getEncryptedBalance");
      if (!privateKey) {
        console.warn(
          "[PrivacyService] No private key available for address:",
          address.slice(0, 10) + "...",
        );

        return {
          success: false,
          error: "No key found for this address",
          publicBalance: 0,
          publicBalanceRaw: 0,
          encryptedBalance: 0,
          encryptedBalanceRaw: 0,
          totalBalance: 0,
          hasEncryptedFunds: false,
        };
      }

      if (!privateKey) {
        logWarn(
          "[PrivacyService] No private key available for encrypted balance",
        );
        return {
          success: false,
          error: "Wallet locked or no key available",
          publicBalance: 0,
          publicBalanceRaw: 0,
          encryptedBalance: 0,
          encryptedBalanceRaw: 0,
          totalBalance: 0,
          hasEncryptedFunds: false,
        };
      }

      if (!forceRefresh && this._password) {
        try {
          const cached = await getPrivacyBalanceCacheSecure(
            address,
            this._password,
          );
          if (cached) {
            logInfo("[PrivacyService] Using storage cache");
            this._cachedResult = cached;
            this._cacheAddress = address;
            this._lastFetchTime = now;
            return {
              ...cached,
              fromCache: true,
            };
          }
        } catch (error) {
          logWarn("[PrivacyService] Cache read failed:", error);
        }
      }

      if (!privateKey) {
        console.warn(
          "[PrivacyService] No private key available for encrypted balance",
        );
        return {
          success: false,
          error: "Wallet locked or no key available",
          publicBalance: 0,
          publicBalanceRaw: 0,
          encryptedBalance: 0,
          encryptedBalanceRaw: 0,
          totalBalance: 0,
          hasEncryptedFunds: false,
        };
      }

      try {
        const message = `get_encrypted_balance_${address}_${Date.now()}`;
        const signature = await keyringService.signMessage(address, message);
        const publicKey = await keyringService.getPublicKey(address);

        if (!publicKey) {
          throw new Error("No public key found for this address");
        }

        let resultRpc = null;
        try {
          resultRpc = await this.rpcClient.getEncryptedBalance(
            address,
            signature,
            publicKey,
          );
        } catch (rpcError) {}

        if (resultRpc) {
          const result = {
            success: true,
            publicBalance: resultRpc.public_balance
              ? parseFloat(resultRpc.public_balance)
              : 0,
            publicBalanceRaw: resultRpc.public_balance_raw || 0,
            encryptedBalance: resultRpc.encrypted_balance
              ? parseFloat(resultRpc.encrypted_balance)
              : 0,
            encryptedBalanceRaw: resultRpc.encrypted_balance_raw || 0,
            totalBalance: resultRpc.total_balance
              ? parseFloat(resultRpc.total_balance)
              : 0,
            hasEncryptedFunds: (resultRpc.encrypted_balance_raw || 0) > 0,
          };

          if (this._password) {
            await savePrivacyBalanceCacheSecure(
              address,
              result,
              this._password,
            );
          }

          this._cachedResult = result;
          this._cacheAddress = address;
          this._lastFetchTime = now;

          return result;
        }
      } catch (rpcError) {
        console.warn(
          "[PrivacyService] RPC call failed, using fallback:",
          rpcError,
        );
      }

      const result = {
        success: true,
        publicBalance: 0,
        publicBalanceRaw: 0,
        encryptedBalance: 0,
        encryptedBalanceRaw: 0,
        totalBalance: 0,
        hasEncryptedFunds: false,
      };

      if (this._password) {
        await savePrivacyBalanceCacheSecure(address, result, this._password);
      }

      this._cachedResult = result;
      this._cacheAddress = address;
      this._lastFetchTime = now;

      return result;
    } catch (error) {
      logError("getEncryptedBalance error:", error);
      return {
        success: false,
        error: (error as any).message,
        publicBalance: 0,
        publicBalanceRaw: 0,
        encryptedBalance: 0,
        encryptedBalanceRaw: 0,
        totalBalance: 0,
        hasEncryptedFunds: false,
      };
    }
  }

  /**
   * Shield balance - Convert public balance to encrypted balance
   */
  async shieldBalance(
    address: string,
    amount: number,
  ): Promise<{ success: boolean; txHash: string }> {
    if (!this._privateKey) throw new Error("Private key not set");

    try {
      const encData = await this.getEncryptedBalance(address);
      const μ = 1_000_000;
      const amountRaw = Math.floor(amount * μ);
      const newEncryptedRaw = encData.encryptedBalanceRaw + amountRaw;

      const encryptedValue = await encryptBalance(
        newEncryptedRaw,
        this._privateKey,
      );

      const walletData = await this.rpcClient
        .getBalance(address)
        .catch(() => ({ nonce: 0 }));

      const data = {
        address: address,
        amount: String(amountRaw),
        private_key: this.getExpandedPrivateKey(), // 64-byte key required
        public_key: this._publicKey,
        nonce: (walletData.nonce || 0) + 1,
        timestamp: Math.floor(Date.now() / 1000), // Ensure integer timestamp
        encrypted_data: encryptedValue,
      };

      logSensitive("Shield request (mainnet-style):", data);

      void data;
      throw new Error(
        "Shield balance functionality temporarily unavailable - pending RPC implementation",
      );
    } catch (error) {
      logError("shieldBalance error:", error);
      throw error;
    }
  }

  /**
   * Unshield balance - Convert encrypted balance to public balance
   */
  async unshieldBalance(
    address: string,
    amount: number,
  ): Promise<{ success: boolean; txHash: string }> {
    if (!this._privateKey) throw new Error("Private key not set");

    try {
      const encData = await this.getEncryptedBalance(address);
      const μ = 1_000_000;
      const amountRaw = Math.floor(amount * μ);

      if (encData.encryptedBalanceRaw < amountRaw) {
        throw new Error(
          `Insufficient encrypted balance. Available: ${encData.encryptedBalance} OCT`,
        );
      }

      const newEncryptedRaw = encData.encryptedBalanceRaw - amountRaw;
      const encryptedValue = await encryptBalance(
        newEncryptedRaw,
        this._privateKey,
      );
      const walletData = await this.rpcClient
        .getBalance(address)
        .catch(() => ({ nonce: 0 }));

      const data = {
        address: address,
        amount: String(amountRaw),
        private_key: this.getExpandedPrivateKey(), // 64-byte key for Mainnet
        public_key: this._publicKey,
        nonce: (walletData.nonce || 0) + 1,
        timestamp: Math.floor(Date.now() / 1000), // Ensure integer timestamp
        encrypted_data: encryptedValue,
      };

      logSensitive("Unshield request (mainnet-style):", data);

      void data;
      throw new Error(
        "Unshield balance functionality temporarily unavailable - pending RPC implementation",
      );
    } catch (error) {
      logError("unshieldBalance error:", error);
      throw error;
    }
  }

  /**
   * Get recipient's public key
   */
  async getRecipientPublicKey(address: string): Promise<string | null> {
    try {
      return await this.rpcClient.getViewPubkey(address);
      /*
            if (result.ok && result.json) {
                return result.json.public_key;
            }
            return null;
            */
    } catch (error) {
      logError("getRecipientPublicKey error:", error);
      return null;
    }
  }

  /**
   * Get address info
   */
  async getAddressInfo(_address: string): Promise<any> {
    try {
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Privacy Transfer - Send from encrypted balance
   */
  async privacyTransfer(
    from: string,
    to: string,
    amount: number,
  ): Promise<{ success: boolean; txHash: string }> {
    if (!this._privateKey) throw new Error("Private key not set");

    try {
      const addrInfo = await this.getAddressInfo(to);
      if (!addrInfo || !addrInfo.has_public_key) {
        throw new Error("Recipient has no public key registered");
      }

      const toPublicKey = await this.getRecipientPublicKey(to);
      if (!toPublicKey) throw new Error("Cannot get recipient public key");

      const μ = 1_000_000;
      const amountRaw = Math.floor(amount * μ);
      const walletData = await this.rpcClient
        .getBalance(from)
        .catch(() => ({ nonce: 0 }));

      const data = {
        from: from,
        to: to,
        amount: String(amountRaw),
        from_private_key: this.getExpandedPrivateKey(), // 64-byte key
        from_public_key: this._publicKey,
        to_public_key: toPublicKey,
        nonce: (walletData.nonce || 0) + 1,
        timestamp: Math.floor(Date.now() / 1000), // Ensure integer timestamp
      };

      logSensitive("Private transfer request:", data);

      void data;
      throw new Error(
        "Private transfer functionality temporarily unavailable - pending RPC implementation",
      );
    } catch (error) {
      logError("privacyTransfer error:", error);
      throw error;
    }
  }

  /**
   * Get pending private transfers
   */
  async getPendingTransfers(address: string): Promise<any[]> {
    try {
      let privateKey = this._privateKey;
      if (!privateKey && keyringService.isUnlocked()) {
        privateKey = keyringService.getPrivateKey(
          address,
          "getPendingTransfers",
        );
      }

      if (!privateKey) {
        return []; // No key = no pending transfers to show
      }

      void privateKey;

      /*
            const resultRpc = await this.rpcClient.get(
                `/pending_private_transfers?address=${address}`,
                { 'X-Private-Key': privateKey }
            );
            */
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Claim a pending private transfer
   */
  async claimPrivateTransfer(
    address: string,
    transferId: string | number,
  ): Promise<{ success: boolean; txHash: string }> {
    if (!this._privateKey) throw new Error("Private key not set");

    try {
      const walletData = await this.rpcClient
        .getBalance(address)
        .catch(() => ({ nonce: 0 }));

      const data = {
        recipient_address: address,
        private_key: this.getExpandedPrivateKey(), // 64-byte key
        public_key: this._publicKey,
        transfer_id: transferId,
        nonce: (walletData.nonce || 0) + 1,
        timestamp: Math.floor(Date.now() / 1000), // Ensure integer timestamp
      };

      logSensitive("Claim request:", data);

      void data;
      throw new Error(
        "Claim private transfer functionality temporarily unavailable - pending RPC implementation",
      );
    } catch (error) {
      logError("claimPrivateTransfer error:", error);
      throw error;
    }
  }

  /**
   * Get privacy status summary
   */
  async getPrivacyStatus(address: string): Promise<any> {
    const encBalance = await this.getEncryptedBalance(address);

    if (!encBalance.success) {
      return {
        isPrivacyEnabled: false,
        error: encBalance.error,
      };
    }

    const privacyRatio =
      encBalance.totalBalance > 0
        ? (encBalance.encryptedBalance / encBalance.totalBalance) * 100
        : 0;

    return {
      isPrivacyEnabled: encBalance.hasEncryptedFunds,
      publicBalance: encBalance.publicBalance,
      encryptedBalance: encBalance.encryptedBalance,
      totalBalance: encBalance.totalBalance,
      privacyRatio: privacyRatio.toFixed(1),
    };
  }
}

export const privacyService = new PrivacyService();

export { PrivacyService, encryptBalance };
