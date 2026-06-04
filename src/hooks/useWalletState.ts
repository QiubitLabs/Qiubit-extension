import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { Wallet } from '../types';
import {
    loadWalletsSecure as loadWallets,
    saveWalletsSecure as saveWallets,
    addWalletSecure as addWallet,
    getActiveWalletIndex,
    setActiveWalletIndex as saveActiveWalletIndex,
    updateWalletNameSecure as updateWalletName
} from '../utils/storage';
import { keyringService } from '../services/core/KeyringService';
import { SessionService } from '../services/core/SessionService';

export function useWalletState(password: string | null) {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [activeWalletIndex, setActiveWalletIdx] = useState(0);
    const [pendingWallet, setPendingWallet] = useState<Wallet | null>(null);

    // Current active wallet
    const wallet = wallets[activeWalletIndex] || null;

    // Set active wallet
    const setActiveWallet = useCallback(async (index: number) => {
        if (index >= 0 && index < wallets.length) {
            setActiveWalletIdx(index);
            await saveActiveWalletIndex(index);
            await keyringService.setActiveWallet(wallets[index].address);
            // Re-sync session so background uses the newly active wallet
            SessionService.syncSessionToBackground();
        }
    }, [wallets]);

    // Add new wallet
    const handleAddWallet = useCallback(async (newWallet: Wallet, pwd: string) => {
        await addWallet(newWallet, pwd);
        const walletWithMeta = { ...newWallet, id: crypto.randomUUID(), name: `Wallet ${wallets.length + 1}` };
        const updatedWallets = [...wallets, walletWithMeta];
        setWallets(updatedWallets);
        await SessionService.updateDecryptedWallets(updatedWallets);
        keyringService.addKey(newWallet.address, newWallet.privateKeyB64, newWallet.publicKeyB64);
        const evmKey = newWallet.evmPrivateKeyHex ?? newWallet.privateKeyHex;
        if (evmKey) keyringService.addEvmKey(newWallet.address, evmKey);
    }, [wallets]);

    // Update wallet name
    const handleUpdateWalletName = useCallback(async (index: number, name: string) => {
        if (!password) return;
        const targetWallet = wallets[index];
        if (!targetWallet) return;

        await updateWalletName(targetWallet.address, name, password);
        const updatedWallets = wallets.map((w, i) =>
            i === index ? { ...w, name } : w
        );
        setWallets(updatedWallets);
        await SessionService.updateDecryptedWallets(updatedWallets);
    }, [wallets, password]);

    // Load wallets
    const loadWalletsData = useCallback(async (pwd: string) => {
        const loadedWallets = await loadWallets(pwd);

        let needSave = false;
        const patchedWallets = await Promise.all(loadedWallets.map(async (w) => {
            let patchedWallet = { ...w };

            // Migration: re-derive BIP44 EVM key for mnemonic wallets missing evmPrivateKeyHex
            if (patchedWallet.mnemonic && Array.isArray(patchedWallet.mnemonic) && patchedWallet.mnemonic.length >= 12 && !patchedWallet.evmPrivateKeyHex) {
                try {
                    const mnemonicStr = patchedWallet.mnemonic.join(' ');
                    const hdIndex = typeof patchedWallet.hdIndex === 'number' ? patchedWallet.hdIndex : 0;
                    const evmNode = ethers.HDNodeWallet.fromPhrase(mnemonicStr, undefined, `m/44'/60'/0'/0/${hdIndex}`);
                    needSave = true;
                    patchedWallet = {
                        ...patchedWallet,
                        evmAddress: evmNode.address,
                        evmPrivateKeyHex: evmNode.privateKey.startsWith('0x')
                            ? evmNode.privateKey.slice(2)
                            : evmNode.privateKey,
                    };
                } catch(e) {
                    console.error("Failed to migrate EVM key from mnemonic", e);
                }
            }
            // Legacy: patch evmAddress for private-key-only wallets (no mnemonic, no evmAddress)
            if (!patchedWallet.evmAddress && (!patchedWallet.mnemonic || !Array.isArray(patchedWallet.mnemonic) || patchedWallet.mnemonic.length === 0) && patchedWallet.privateKeyHex) {
                try {
                    needSave = true;
                    let pk = patchedWallet.privateKeyHex;
                    if (!pk.startsWith('0x')) pk = '0x' + pk;
                    const evmWallet = new ethers.Wallet(pk);
                    patchedWallet = { ...patchedWallet, evmAddress: evmWallet.address };
                } catch(e) {
                    console.error("Failed to patch EVM address", e);
                }
            }
            // Migration: re-derive standard Solana key for mnemonic wallets missing solanaAddress
            if (patchedWallet.mnemonic && Array.isArray(patchedWallet.mnemonic) && patchedWallet.mnemonic.length >= 12 && !patchedWallet.solanaAddress) {
                try {
                    const mnemonicStr = patchedWallet.mnemonic.join(' ');
                    const hdIndex = typeof patchedWallet.hdIndex === 'number' ? patchedWallet.hdIndex : 0;
                    const deriveSolanaKeysFromMnemonic = (await import('../utils/crypto/keys')).deriveSolanaKeysFromMnemonic;
                    const solanaKeys = await deriveSolanaKeysFromMnemonic(mnemonicStr, hdIndex);
                    needSave = true;
                    patchedWallet = {
                        ...patchedWallet,
                        solanaAddress: solanaKeys.address,
                        solanaPrivateKeyHex: solanaKeys.privateKeyHex,
                    };
                } catch (e) {
                    console.error("Failed to migrate Solana key from mnemonic", e);
                }
            }
            // Migration: re-derive standard Sui key for mnemonic wallets missing suiAddress
            if (patchedWallet.mnemonic && Array.isArray(patchedWallet.mnemonic) && patchedWallet.mnemonic.length >= 12 && !patchedWallet.suiAddress) {
                try {
                    const mnemonicStr = patchedWallet.mnemonic.join(' ');
                    const hdIndex = typeof patchedWallet.hdIndex === 'number' ? patchedWallet.hdIndex : 0;
                    const deriveSuiKeysFromMnemonic = (await import('../utils/crypto/keys')).deriveSuiKeysFromMnemonic;
                    const suiKeys = await deriveSuiKeysFromMnemonic(mnemonicStr, hdIndex);
                    needSave = true;
                    patchedWallet = {
                        ...patchedWallet,
                        suiAddress: suiKeys.address,
                        suiPrivateKeyHex: suiKeys.privateKeyHex,
                    };
                } catch (e) {
                    console.error("Failed to migrate Sui key from mnemonic", e);
                }
            }
            // Migration: re-derive standard Bitcoin key for mnemonic wallets missing bitcoinAddress
            if (patchedWallet.mnemonic && Array.isArray(patchedWallet.mnemonic) && patchedWallet.mnemonic.length >= 12 && !patchedWallet.bitcoinAddress) {
                try {
                    const mnemonicStr = patchedWallet.mnemonic.join(' ');
                    const hdIndex = typeof patchedWallet.hdIndex === 'number' ? patchedWallet.hdIndex : 0;
                    const deriveBitcoinKeysFromMnemonic = (await import('../utils/crypto/keys')).deriveBitcoinKeysFromMnemonic;
                    const bitcoinKeys = await deriveBitcoinKeysFromMnemonic(mnemonicStr, hdIndex);
                    needSave = true;
                    patchedWallet = {
                        ...patchedWallet,
                        bitcoinAddress: bitcoinKeys.address,
                        bitcoinPrivateKeyHex: bitcoinKeys.privateKeyHex,
                    };
                } catch (e) {
                    console.error("Failed to migrate Bitcoin key from mnemonic", e);
                }
            }
            // Legacy/Private Key only: patch solanaAddress, suiAddress, bitcoinAddress for private key only wallets
            if ((!patchedWallet.solanaAddress || !patchedWallet.suiAddress || !patchedWallet.bitcoinAddress) && (!patchedWallet.mnemonic || !Array.isArray(patchedWallet.mnemonic) || patchedWallet.mnemonic.length === 0) && patchedWallet.privateKeyHex) {
                try {
                    needSave = true;
                    let pk = patchedWallet.privateKeyHex;
                    if (pk.startsWith('0x')) pk = pk.slice(2);
                    if (/^[a-fA-F0-9]{64}$/.test(pk)) {
                        const seedBytes = new Uint8Array(Buffer.from(pk, 'hex'));
                        const nacl = (await import('tweetnacl')).default;
                        const base58Encode = (await import('../utils/crypto/format')).base58Encode;
                        const bufferToHex = (await import('../utils/crypto/format')).bufferToHex;

                        if (!patchedWallet.solanaAddress) {
                            const solKeyPair = nacl.sign.keyPair.fromSeed(seedBytes);
                            const solPublicKey = solKeyPair.publicKey;
                            patchedWallet.solanaAddress = base58Encode(solPublicKey);
                            patchedWallet.solanaPrivateKeyHex = pk;
                        }

                        if (!patchedWallet.suiAddress) {
                            const suiKeyPair = nacl.sign.keyPair.fromSeed(seedBytes);
                            const suiPublicKey = suiKeyPair.publicKey;
                            const blake2b = (await import('@noble/hashes/blake2b')).blake2b;
                            const suiData = new Uint8Array(1 + 32);
                            suiData[0] = 0x00;
                            suiData.set(suiPublicKey, 1);
                            const suiHash = blake2b(suiData, { dkLen: 32 });
                            patchedWallet.suiAddress = '0x' + bufferToHex(suiHash);
                            patchedWallet.suiPrivateKeyHex = pk;
                        }

                        if (!patchedWallet.bitcoinAddress) {
                            const ripemd160 = (await import('@noble/hashes/ripemd160')).ripemd160;
                            const sha256 = (await import('@noble/hashes/sha256')).sha256;
                            const ethers = await import('ethers');
                            const evmPrivKeyHex = pk.startsWith('0x') ? pk : '0x' + pk;
                            const compressedPubKey = ethers.SigningKey.computePublicKey(evmPrivKeyHex, true);
                            const pubKeyBytes = ethers.getBytes(compressedPubKey);
                            const sha = sha256(pubKeyBytes);
                            const rip = ripemd160(sha);
                            const toBech32Address = (await import('../utils/crypto/derivation/bitcoin')).toBech32Address;
                            patchedWallet.bitcoinAddress = toBech32Address(rip);
                            patchedWallet.bitcoinPrivateKeyHex = evmPrivKeyHex;
                        }
                    }
                } catch (e) {
                    console.error("Failed to patch Solana/Sui/Bitcoin address for private key wallet", e);
                }
            }
            return patchedWallet;
        }));

        if (needSave && pwd) {
            await saveWallets(patchedWallets, pwd);
        }

        setWallets(patchedWallets);

        const savedIndex = await getActiveWalletIndex();
        const activeIdx = savedIndex >= 0 && savedIndex < patchedWallets.length ? savedIndex : 0;
        setActiveWalletIdx(activeIdx);

        return patchedWallets;
    }, []);

    // Delete wallet
    const deleteWallet = useCallback(async (index: number, pwd: string) => {
        // Allow deleting the last wallet (reset state)
        // if (wallets.length <= 1) {
        //     throw new Error('Cannot delete the last wallet');
        // }

        const updatedWallets = wallets.filter((_, i) => i !== index);
        setWallets(updatedWallets);
        await saveWallets(updatedWallets, pwd);
        await SessionService.updateDecryptedWallets(updatedWallets);

        if (index === activeWalletIndex) {
            setActiveWalletIdx(0);
            await saveActiveWalletIndex(0);
            if (updatedWallets.length > 0) {
                await keyringService.setActiveWallet(updatedWallets[0].address);
            }
        } else if (index < activeWalletIndex) {
            const newIndex = activeWalletIndex - 1;
            setActiveWalletIdx(newIndex);
            await saveActiveWalletIndex(newIndex);
        }
    }, [wallets, activeWalletIndex]);


    return {
        wallets,
        activeWalletIndex,
        wallet,
        pendingWallet,
        setWallets,
        setActiveWalletIdx,
        setPendingWallet,
        setActiveWallet,
        handleAddWallet,
        handleUpdateWalletName,
        loadWalletsData,
        deleteWallet
    };
}
