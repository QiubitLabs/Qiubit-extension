import { useCallback } from 'react';
import { Wallet } from '../../types';
import { addWalletSecure as addWallet, hasPasswordSecure as hasPassword, storage } from '../../utils/storage';
import { keyringService } from '../../services/core/KeyringService';
import { privacyService } from '../../services/features/PrivacyService';

interface UseWalletCreationProps {
    password: string | null;
    pendingWallet: Wallet | null;
    setWallets: (wallets: Wallet[]) => void;
    setPassword: (pwd: string | null) => void;
    setIsUnlocked: (isUnlocked: boolean) => void;
    setBalance: (balance: number) => void;
    setNonce: (nonce: number) => void;
    setTransactions: (txs: any[]) => void;
    setView: (view: string) => void;
    setPendingWallet: (wallet: Wallet | null) => void;
    showToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
    saveActiveSession: (pwd: string) => Promise<void>;
    refreshBalance: (mode?: 'public' | 'private' | 'both', opts?: { force?: boolean }) => Promise<void>;
}

export function useWalletCreation({
    password,
    pendingWallet,
    setWallets,
    setPassword,
    setIsUnlocked,
    setBalance,
    setNonce,
    setTransactions,
    setView,
    setPendingWallet,
    showToast,
    saveActiveSession,
    refreshBalance
}: UseWalletCreationProps) {

    const handleSetupPassword = useCallback(async (newPassword: string) => {
        setPassword(newPassword);

        if (pendingWallet) {
            await addWallet(pendingWallet, newPassword);
            setWallets([{ ...pendingWallet, id: crypto.randomUUID(), name: 'Wallet 1' }]);
            setPendingWallet(null);
        }

        setIsUnlocked(true);
        setView('dashboard');
    }, [pendingWallet, setPassword, setWallets, setPendingWallet, setIsUnlocked, setView]);

    const handleWalletGenerated = useCallback(async (newWallet: Wallet, newPassword: string) => {
        try {
            if (!(await hasPassword())) {
                try {
                    await storage.clear();
                    sessionStorage.clear();
                } catch (clearErr) {
                    console.warn('[useWalletCreation] Could not force clear:', clearErr);
                }
            }

            await saveActiveSession(newPassword);

            const passToUse = newPassword || password!;

            try {
                // Using addWallet from storageSecure directly for correct context of new wallet creation
                await addWallet(newWallet, passToUse);
            } catch (addErr: any) {
                if (addErr.message && addErr.message.includes('Wallet already exists')) {
                    console.warn('[useWalletCreation] Wallet add skipped (duplicate/race-condition), proceeding to login...');
                } else {
                    throw addErr;
                }
            }

            // Initialize keyring
            await keyringService.initialize([], passToUse);
            keyringService.addKey(newWallet.address, newWallet.privateKeyB64, newWallet.publicKeyB64);

            setPassword(passToUse);
            const walletWithMeta = { ...newWallet, id: crypto.randomUUID(), name: 'Wallet 1' };
            setWallets([walletWithMeta]);
            setIsUnlocked(true);

            if (newWallet.privateKeyB64 && passToUse) {
                privacyService.setPrivateKey(newWallet.privateKeyB64, passToUse);
            }

            setBalance(0);
            setNonce(0);
            setTransactions([]);

            setView('dashboard');

            setTimeout(() => {
                refreshBalance('both', { force: true });
            }, 200);
        } catch (err: any) {
            console.error('Failed to create wallet:', err);
            showToast(err.message || 'Failed to create wallet', 'error');
        }
    }, [password, saveActiveSession, showToast, setView, setWallets, setPassword, setIsUnlocked, setBalance, setNonce, setTransactions, refreshBalance]);

    return { handleSetupPassword, handleWalletGenerated };
}
