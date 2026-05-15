import { useState, useCallback } from 'react';
import { SessionService } from '../services/core/SessionService';

export function useWalletSession() {
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [password, setPassword] = useState<string | null>(null);
    const [sessionKey, setSessionKey] = useState<string | null>(null);
    const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);

    // Clear session
    const clearActiveSession = useCallback(async () => {
        await SessionService.logout();
        setIsUnlocked(false);
        setPassword(null);
        setSessionKey(null);
        setSessionExpiry(null);
    }, []);

    // Save session (Legacy wrapper/No-op if handled by Login)
    // Actually, App.tsx might call this? 
    // usage: await saveActiveSession(enteredPassword);
    // SessionService.login() handles saving.
    // If we keep this, it should probably be a "ensureSaved" or similar.
    // But since useWalletAuth calls SessionService.login directly, this might be unused by simplified hooks.
    // We kept it in props of useWalletAuth but didn't use it.
    const saveActiveSession = useCallback(async (_pwd: string) => {
        // No-op here because SessionService.login already saves it.
        // Or we could trigger SessionService to persist if not already?
        // Let's assume login handles it.
    }, []);

    // Restore session
    const restoreActiveSession = useCallback(async () => {
        const restoredPwd = await SessionService.restoreSession();
        if (restoredPwd) {
            setPassword(restoredPwd);
            setIsUnlocked(true);

            // Sync local state with Service state
            setSessionKey(SessionService.getSessionKey());
            // We can't easily get expiry from service public API yet without getter
            // But it's not critical for UI unless UI shows timer.

            return restoredPwd;
        }
        return null;
    }, []);

    // Extend session
    const extendSession = useCallback(() => {
        SessionService.extendSession();
        // Update local state if needed (e.g. for UI timer)
    }, []);

    // Unlock (Local state update)
    const unlock = useCallback((pwd: string) => {
        setPassword(pwd);
        setIsUnlocked(true);
    }, []);

    // Lock
    const lock = useCallback(() => {
        clearActiveSession();
    }, [clearActiveSession]);

    return {
        isUnlocked,
        password,
        sessionKey,
        sessionExpiry,
        unlock,
        lock,
        extendSession,
        saveActiveSession,
        restoreActiveSession,
        clearActiveSession,
        setIsUnlocked,
        setPassword,
        setSessionKey
    };
}
