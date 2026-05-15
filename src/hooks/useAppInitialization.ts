import { useState, useCallback } from 'react';
import {
    hasPasswordSecure as hasPassword,
    hasWalletsSecure as hasWallets
} from '../utils/storage';
import { loadSettingsPlain, saveSettingsPlain } from '../utils/storage/settings';
import { setRpcUrl } from '../services/network/RpcService';

export function useAppInitialization() {
    const [view, setView] = useState<string>('loading');
    const [settings, setSettingsState] = useState<any>(() => loadSettingsPlain());

    // Initialize app
    const initializeApp = useCallback(async (restoreSession: () => Promise<string | null>, onSessionRestored: (pwd: string) => Promise<void>) => {
        try {
            const savedSettings = loadSettingsPlain();
            const settingsWithDefaults = {
                ...savedSettings,
                network: 'mainnet' // Force mainnet
            };

            if ((settingsWithDefaults as any).rpcUrl) {
                setRpcUrl((settingsWithDefaults as any).rpcUrl);
            }
            setSettingsState(settingsWithDefaults);

            const hasWalletsConfigured = await hasWallets();
            const hasPasswordConfigured = await hasPassword();

            if (hasWalletsConfigured && hasPasswordConfigured) {
                // Try to restore session
                const restoredPwd = await restoreSession();

                if (restoredPwd) {
                    await onSessionRestored(restoredPwd);
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
            setView('welcome');
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
