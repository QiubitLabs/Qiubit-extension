import { useState, useCallback } from 'react';
import {
    hasPasswordSecure as hasPassword,
    hasWalletsSecure as hasWallets
} from '../utils/storage';
import { loadSettingsPlain, saveSettingsPlain } from '../utils/storage/settings';
import { migrateEvmHistory } from '../utils/storage/transactions';
import { setRpcUrl } from '../services/network/RpcService';

export function useAppInitialization() {
    const [view, setView] = useState<string>('loading');
    const [settings, setSettingsState] = useState<any>(() => loadSettingsPlain());

    // Initialize app
    const initializeApp = useCallback(async (restoreSession: () => Promise<string | null>, onSessionRestored: (pwd: string) => Promise<void>) => {
        // Fire-and-forget storage migration (safe, idempotent)
        migrateEvmHistory().catch(() => {});

        try {
            const savedSettings = loadSettingsPlain();
            let network = savedSettings?.network || 'all';
            if (network === 'mainnet' || network === 'testnet') {
                network = 'all';
            }
            const settingsWithDefaults = {
                ...savedSettings,
                network
            };

            // Persist migrated setting if it changed
            if (network !== savedSettings?.network) {
                saveSettingsPlain(settingsWithDefaults);
            }

            if ((settingsWithDefaults as any).rpcUrl) {
                setRpcUrl((settingsWithDefaults as any).rpcUrl);
            }
            setSettingsState(settingsWithDefaults);

            // Mirror network to chrome.storage.local for background SW access
            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({ dapp_active_network: network }).catch(() => {});
            }

            const hasWalletsConfigured = await hasWallets();
            const hasPasswordConfigured = await hasPassword();

            if (hasWalletsConfigured && hasPasswordConfigured) {
                // Try to restore session
                const restoredPwd = await restoreSession();

                if (restoredPwd) {
                    try {
                        await onSessionRestored(restoredPwd);
                    } catch (restoreErr) {
                        // Background session is already valid — don't show lock screen
                        // just because the UI hydration step failed. Log and continue.
                        console.warn('[useAppInitialization] onSessionRestored failed but session is valid:', restoreErr);
                    }
                    setView('dashboard');
                    return;
                }

                // If restore failed, show lock screen
                setView('lock');
            } else {
                // New user, show welcome
                setView('welcome');
            }
        } catch (error) {
            console.error('[useAppInitialization] Init error:', error);
            // Don't fall back to 'welcome' if wallets exist — show lock screen instead
            // so user can unlock rather than being forced to create a new wallet.
            try {
                const stillHasWallets = await hasWallets();
                setView(stillHasWallets ? 'lock' : 'welcome');
            } catch {
                setView('welcome');
            }
        }
    }, []);

    // Update settings
    const updateSettings = useCallback(async (newSettings: any) => {
        const updated = { ...settings, ...newSettings };
        setSettingsState(updated);
        saveSettingsPlain(updated);

        if (newSettings.rpcUrl) {
            setRpcUrl(newSettings.rpcUrl);
        }

        // Mirror network setting to chrome.storage.local so the background SW can read it
        if (newSettings.network !== undefined && typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ dapp_active_network: newSettings.network }).catch(() => {});
        }
    }, [settings]);

    return {
        view,
        settings,
        setView,
        setSettingsState,
        initializeApp,
        updateSettings
    };
}
