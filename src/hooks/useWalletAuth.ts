import { useCallback } from "react";
import { ethers } from "ethers";
import { Wallet } from "../types";
import {
  loadWalletsSecure as loadWallets,
  saveWalletsSecure as saveWallets,
  getActiveWalletIndex,
  setActiveWalletIndex as saveActiveWalletIdx,
} from "../utils/storage";
import { keyringService } from "../services/core/KeyringService";
import { ocs01Manager } from "../services/features/OCS01TokenService";
import { privacyService } from "../services/features/PrivacyService";
import { SessionService } from "../services/core/SessionService";
import { WalletService } from "../services/core/WalletService";

import {
  deriveSolanaKeysFromMnemonic,
  deriveSuiKeysFromMnemonic,
  deriveBitcoinKeysFromMnemonic,
} from "../utils/crypto/keys";
import nacl from "tweetnacl";
import { base58Encode, bufferToHex } from "../utils/crypto/format";
import { blake2b } from "@noble/hashes/blake2b";
import { ripemd160 } from "@noble/hashes/ripemd160";
import { sha256 } from "@noble/hashes/sha256";
import { toBech32Address } from "../utils/crypto/derivation/bitcoin";

async function migrateEvmKeys(
  wallets: Wallet[],
): Promise<{ wallets: Wallet[]; changed: boolean }> {
  let changed = false;
  const migrated = await Promise.all(
    wallets.map(async (w) => {
      let patchedWallet = { ...w };

      if (
        patchedWallet.mnemonic &&
        Array.isArray(patchedWallet.mnemonic) &&
        patchedWallet.mnemonic.length >= 12 &&
        !patchedWallet.evmPrivateKeyHex
      ) {
        try {
          const mnemonicStr = patchedWallet.mnemonic.join(" ");
          const hdIndex =
            typeof patchedWallet.hdIndex === "number"
              ? patchedWallet.hdIndex
              : 0;
          const evmNode = ethers.HDNodeWallet.fromPhrase(
            mnemonicStr,
            undefined,
            `m/44'/60'/0'/0/${hdIndex}`,
          );
          changed = true;
          patchedWallet = {
            ...patchedWallet,
            evmAddress: evmNode.address,
            evmPrivateKeyHex: evmNode.privateKey.startsWith("0x")
              ? evmNode.privateKey.slice(2)
              : evmNode.privateKey,
          };
        } catch {
          /* keep unchanged on failure */
        }
      }

      if (
        !patchedWallet.evmAddress &&
        patchedWallet.privateKeyHex &&
        (!patchedWallet.mnemonic ||
          !Array.isArray(patchedWallet.mnemonic) ||
          patchedWallet.mnemonic.length < 12)
      ) {
        try {
          const pk = patchedWallet.privateKeyHex.startsWith("0x")
            ? patchedWallet.privateKeyHex
            : "0x" + patchedWallet.privateKeyHex;
          const evmWallet = new ethers.Wallet(pk);
          changed = true;
          patchedWallet = {
            ...patchedWallet,
            evmAddress: evmWallet.address,
            evmPrivateKeyHex: patchedWallet.privateKeyHex,
          };
        } catch {
          /* keep unchanged on failure */
        }
      }

      if (
        patchedWallet.mnemonic &&
        Array.isArray(patchedWallet.mnemonic) &&
        patchedWallet.mnemonic.length >= 12 &&
        !patchedWallet.solanaAddress
      ) {
        try {
          const mnemonicStr = patchedWallet.mnemonic.join(" ");
          const hdIndex =
            typeof patchedWallet.hdIndex === "number"
              ? patchedWallet.hdIndex
              : 0;
          const solanaKeys = await deriveSolanaKeysFromMnemonic(
            mnemonicStr,
            hdIndex,
          );
          changed = true;
          patchedWallet = {
            ...patchedWallet,
            solanaAddress: solanaKeys.address,
            solanaPrivateKeyHex: solanaKeys.privateKeyHex,
          };
        } catch (e) {
          console.error("Failed to migrate Solana key on unlock", e);
        }
      }

      if (
        patchedWallet.mnemonic &&
        Array.isArray(patchedWallet.mnemonic) &&
        patchedWallet.mnemonic.length >= 12 &&
        !patchedWallet.suiAddress
      ) {
        try {
          const mnemonicStr = patchedWallet.mnemonic.join(" ");
          const hdIndex =
            typeof patchedWallet.hdIndex === "number"
              ? patchedWallet.hdIndex
              : 0;
          const suiKeys = await deriveSuiKeysFromMnemonic(mnemonicStr, hdIndex);
          changed = true;
          patchedWallet = {
            ...patchedWallet,
            suiAddress: suiKeys.address,
            suiPrivateKeyHex: suiKeys.privateKeyHex,
          };
        } catch (e) {
          console.error("Failed to migrate Sui key on unlock", e);
        }
      }

      if (
        patchedWallet.mnemonic &&
        Array.isArray(patchedWallet.mnemonic) &&
        patchedWallet.mnemonic.length >= 12 &&
        !patchedWallet.bitcoinAddress
      ) {
        try {
          const mnemonicStr = patchedWallet.mnemonic.join(" ");
          const hdIndex =
            typeof patchedWallet.hdIndex === "number"
              ? patchedWallet.hdIndex
              : 0;
          const bitcoinKeys = await deriveBitcoinKeysFromMnemonic(
            mnemonicStr,
            hdIndex,
          );
          changed = true;
          patchedWallet = {
            ...patchedWallet,
            bitcoinAddress: bitcoinKeys.address,
            bitcoinPrivateKeyHex: bitcoinKeys.privateKeyHex,
          };
        } catch (e) {
          console.error("Failed to migrate Bitcoin key on unlock", e);
        }
      }

      if (
        (!patchedWallet.solanaAddress ||
          !patchedWallet.suiAddress ||
          !patchedWallet.bitcoinAddress) &&
        (!patchedWallet.mnemonic ||
          !Array.isArray(patchedWallet.mnemonic) ||
          patchedWallet.mnemonic.length === 0) &&
        patchedWallet.privateKeyHex
      ) {
        try {
          changed = true;
          let pk = patchedWallet.privateKeyHex;
          if (pk.startsWith("0x")) pk = pk.slice(2);
          if (/^[a-fA-F0-9]{64}$/.test(pk)) {
            const seedBytes = new Uint8Array(Buffer.from(pk, "hex"));

            if (!patchedWallet.solanaAddress) {
              const solKeyPair = nacl.sign.keyPair.fromSeed(seedBytes);
              const solPublicKey = solKeyPair.publicKey;
              patchedWallet.solanaAddress = base58Encode(solPublicKey);
              patchedWallet.solanaPrivateKeyHex = pk;
            }

            if (!patchedWallet.suiAddress) {
              const suiKeyPair = nacl.sign.keyPair.fromSeed(seedBytes);
              const suiPublicKey = suiKeyPair.publicKey;
              const suiData = new Uint8Array(1 + 32);
              suiData[0] = 0x00;
              suiData.set(suiPublicKey, 1);
              const suiHash = blake2b(suiData, { dkLen: 32 });
              patchedWallet.suiAddress = "0x" + bufferToHex(suiHash);
              patchedWallet.suiPrivateKeyHex = pk;
            }

            if (!patchedWallet.bitcoinAddress) {
              const evmPrivKeyHex = pk.startsWith("0x") ? pk : "0x" + pk;
              const compressedPubKey = ethers.SigningKey.computePublicKey(
                evmPrivKeyHex,
                true,
              );
              const pubKeyBytes = ethers.getBytes(compressedPubKey);
              const sha = sha256(pubKeyBytes);
              const rip = ripemd160(sha);
              patchedWallet.bitcoinAddress = toBech32Address(rip);
              patchedWallet.bitcoinPrivateKeyHex = evmPrivKeyHex;
            }
          }
        } catch (e) {
          console.error(
            "Failed to patch Solana/Sui/Bitcoin fallback on unlock",
            e,
          );
        }
      }

      return patchedWallet;
    }),
  );
  return { wallets: migrated, changed };
}

interface UseWalletAuthProps {
  settings: any;
  wallets: Wallet[];
  activeWalletIndex: number;
  setPassword: (pwd: string | null) => void;
  setWallets: (wallets: Wallet[]) => void;
  setIsUnlocked: (isUnlocked: boolean) => void;
  setActiveWalletIdx: (index: number) => void;
  setSessionKey: (key: string | null) => void;
  setView: (view: string) => void;
  showToast: (
    message: string,
    type: "info" | "success" | "warning" | "error",
  ) => void;
  lock: () => void;
  saveActiveSession: (pwd: string) => Promise<void>;
  refreshAllBalances: () => Promise<void>;
  refreshTransactions: (opts?: { force?: boolean }) => Promise<void>;
}

export function useWalletAuth({
  settings,
  wallets,
  activeWalletIndex,
  setPassword,
  setWallets,
  setIsUnlocked,
  setActiveWalletIdx,
  setSessionKey,
  setView,
  showToast,
  lock,
  saveActiveSession,
  refreshAllBalances, // Legacy, we might use WalletService directly but keep prop for now
  refreshTransactions,
}: UseWalletAuthProps) {
  void saveActiveSession;
  void refreshAllBalances;

  const handleLock = useCallback(async () => {
    lock();
    setView("lock");

    await SessionService.logout();
  }, [lock, setView]);

  const handleUnlock = useCallback(
    async (enteredPassword: string) => {
      try {
        let loadedWallets = SessionService.getDecryptedWallets();
        if (!loadedWallets || loadedWallets.length === 0) {
          loadedWallets = await loadWallets(enteredPassword);
        }
        if (!loadedWallets || loadedWallets.length === 0) {
          if (!loadedWallets)
            throw new Error("Invalid password or corrupted data");
          if (loadedWallets.length === 0) throw new Error("No wallets found");
        }

        const { wallets: migratedWallets, changed } =
          await migrateEvmKeys(loadedWallets);
        if (changed) {
          await saveWallets(migratedWallets, enteredPassword);
        }

        await SessionService.login(enteredPassword, migratedWallets);

        setWallets(migratedWallets);
        setPassword(enteredPassword);
        setIsUnlocked(true);
        setSessionKey(SessionService.getSessionKey());

        const savedIndex = await getActiveWalletIndex();
        const targetIndex =
          savedIndex >= 0 && savedIndex < migratedWallets.length
            ? savedIndex
            : 0;
        setActiveWalletIdx(targetIndex); // React state (raw setter, no stale closure issue)
        await saveActiveWalletIdx(targetIndex); // Persist to chrome.storage

        await keyringService.setActiveWallet(
          migratedWallets[targetIndex].address,
        );
        SessionService.syncSessionToBackground();

        await ocs01Manager.initializeSecure(enteredPassword);

        const activePk = migratedWallets[targetIndex]?.privateKeyB64;
        if (activePk) {
          privacyService.setPrivateKey(activePk, enteredPassword);
        }

        setView("dashboard");

        WalletService.refreshBalances(migratedWallets).then((updated) => {
          if (updated !== migratedWallets) {
            setWallets(updated); // Update React state if balances changed
          }
        });

        setTimeout(() => refreshTransactions(), 100);
      } catch (error) {
        console.error("[useWalletAuth] Failed to unlock:", error);
        keyringService.lock();
        throw error;
      }
    },
    [
      settings,
      refreshTransactions,
      setPassword,
      setIsUnlocked,
      setWallets,
      setActiveWalletIdx,
      setView,
    ],
  );

  const handlePasswordChange = useCallback(
    async (newPassword: string) => {
      try {
        setPassword(newPassword);

        if (wallets.length > 0) {
          await keyringService.initialize(wallets, newPassword);

          await SessionService.login(newPassword, wallets);
          setSessionKey(SessionService.getSessionKey());

          const activeWallet = wallets[activeWalletIndex];
          if (activeWallet) {
            await keyringService.setActiveWallet(activeWallet.address);
            SessionService.syncSessionToBackground();
            await ocs01Manager.initializeSecure(newPassword);
            const activePk = activeWallet?.privateKeyB64;
            if (activePk) {
              privacyService.setPrivateKey(activePk, newPassword);
            }
          }
        }
        showToast("Password updated successfully", "success");
      } catch (error) {
        console.error(
          "Failed to update services after password change:",
          error,
        );
        showToast(
          "Password changed, but session refresh failed. Please re-lock.",
          "warning",
        );
      }
    },
    [wallets, activeWalletIndex, setPassword, showToast],
  );

  return {
    handleLock,
    handleUnlock,
    handlePasswordChange,
  };
}
