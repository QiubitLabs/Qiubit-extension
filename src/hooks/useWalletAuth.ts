import { useCallback } from 'react';
import { Wallet } from '../types';
import { loadWalletsSecure as loadWallets, getActiveWalletIndex, setActiveWalletIndex as saveActiveWalletIdx } from '../utils/storage';
import { keyringService } from '../services/core/KeyringService';
import { ocs01Manager } from '../services/features/OCS01TokenService';
import { privacyService } from '../services/features/PrivacyService';
import { SessionService } from '../services/core/SessionService';
import { WalletService } from '../services/core/WalletService';

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
    showToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
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
    refreshTransactions
}: UseWalletAuthProps) {

    // Fix unused variable warnings
    // @ts-ignore
    const _keep1 = setSessionKey;
    // @ts-ignore
    const _keep2 = saveActiveSession;
    // @ts-ignore
    const _keep3 = refreshAllBalances;

    // Lock wallet - NOW DELEGATED to SessionService
    const handleLock = useCallback(async () => {
        // UI State Clear
        lock();
        setView('lock');

        // Core Service Clear
        await SessionService.logout();
    }, [lock, setView]);

    // Unlock wallet with password
    const handleUnlock = useCallback(async (enteredPassword: string) => {
        try {
            // 1. Load Wallets (Required for Keyring unlock)
            const loadedWallets = await loadWallets(enteredPassword);
            if (!loadedWallets || loadedWallets.length === 0) {
                // If it fails but password might be right (empty wallet?), strictly it throws if auth fails
                // loadWallets throws if MAC mismatch usually.
                // Or returns empty array if valid pw but no wallets.
                // Let's assume standard flow:
                if (!loadedWallets) throw new Error('Invalid password or corrupted data');
                if (loadedWallets.length === 0) throw new Error('No wallets found');
            }

            // 2. Delegate Core Login (Verify + Keyring + Session + Sync)
            await SessionService.login(enteredPassword, loadedWallets);

            // 3. UI State Updates
            setWallets(loadedWallets);
            setPassword(enteredPassword);
            setIsUnlocked(true);

            // 4. Set Active Wallet (use raw setter + explicit storage save to avoid stale wallets closure)
            const savedIndex = await getActiveWalletIndex();
            const targetIndex = (savedIndex >= 0 && savedIndex < loadedWallets.length) ? savedIndex : 0;
            setActiveWalletIdx(targetIndex);        // React state (raw setter, no stale closure issue)
            await saveActiveWalletIdx(targetIndex); // Persist to chrome.storage

            // Keyring Active Wallet
            await keyringService.setActiveWallet(loadedWallets[targetIndex].address);

            // 5. Initialize Feature Services (TODO: Move to SessionService?)
            await ocs01Manager.initializeSecure(enteredPassword);

            const activePk = keyringService.getPrivateKey(loadedWallets[targetIndex].address);
            if (activePk) {
                // Privacy service init
                privacyService.setPrivateKey(activePk, enteredPassword);
            }

            // 6. Navigation & Data Refresh
            setView('dashboard');

            // Use new WalletService for balances
            // We can fire and forget, or await.
            WalletService.refreshBalances(loadedWallets).then(updated => {
                if (updated !== loadedWallets) {
                    setWallets(updated); // Update React state if balances changed
                }
            });

            setTimeout(() => refreshTransactions(), 100);

        } catch (error) {
            console.error('[useWalletAuth] Failed to unlock:', error);
            await SessionService.logout(); // Clean up partial state
            throw error;
        }
    }, [
        settings,
        refreshTransactions,
        setPassword,
        setIsUnlocked,
        setWallets,
        setActiveWalletIdx,
        setView
    ]);

    // Handle password change
    const handlePasswordChange = useCallback(async (newPassword: string) => {
        try {
            setPassword(newPassword);

            if (wallets.length > 0) {
                // Re-init services
                await keyringService.initialize(wallets, newPassword);

                // Re-login session with new password
                // This implicitly updates session encryption
                await SessionService.login(newPassword, wallets);

                const activeWallet = wallets[activeWalletIndex];
                if (activeWallet) {
                    await keyringService.setActiveWallet(activeWallet.address);
                    await ocs01Manager.initializeSecure(newPassword);
                    const activePk = keyringService.getPrivateKey(activeWallet.address);
                    if (activePk) {
                        privacyService.setPrivateKey(activePk, newPassword);
                    }
                }
            }
            showToast('Password updated successfully', 'success');
        } catch (error) {
            console.error('Failed to update services after password change:', error);
            showToast('Password changed, but session refresh failed. Please re-lock.', 'warning');
        }
    }, [wallets, activeWalletIndex, setPassword, showToast]);

    return {
        handleLock,
        handleUnlock,
        handlePasswordChange
    };
}
