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
        }
    }, [wallets]);

    // Add new wallet
    const handleAddWallet = useCallback(async (newWallet: Wallet, pwd: string) => {
        await addWallet(newWallet, pwd);
        const walletWithMeta = { ...newWallet, id: crypto.randomUUID(), name: `Wallet ${wallets.length + 1}` };
        setWallets([...wallets, walletWithMeta]);
        keyringService.addKey(newWallet.address, newWallet.privateKeyB64, newWallet.publicKeyB64);
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
    }, [wallets, password]);

    // Load wallets
    const loadWalletsData = useCallback(async (pwd: string) => {
        const loadedWallets = await loadWallets(pwd);
        
        let needSave = false;
        const patchedWallets = loadedWallets.map(w => {
            if (!w.evmAddress && w.privateKeyHex) {
                try {
                    needSave = true;
                    let pk = w.privateKeyHex;
                    if (!pk.startsWith('0x')) pk = '0x' + pk;
                    const evmWallet = new ethers.Wallet(pk);
                    return { ...w, evmAddress: evmWallet.address };
                } catch(e) {
                    console.error("Failed to patch EVM address", e);
                }
            }
            return w;
        });

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
