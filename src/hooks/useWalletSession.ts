import { useState, useCallback } from "react";
import { SessionService } from "../services/core/SessionService";

export function useWalletSession() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<number | null>(null);

  const clearActiveSession = useCallback(async () => {
    await SessionService.logout();
    setIsUnlocked(false);
    setPassword(null);
    setSessionKey(null);
    setSessionExpiry(null);
  }, []);

  const saveActiveSession = useCallback(async (_pwd: string) => {}, []);

  const restoreActiveSession = useCallback(async () => {
    const restoredPwd = await SessionService.restoreSession();
    if (restoredPwd) {
      setPassword(restoredPwd);
      setIsUnlocked(true);

      setSessionKey(SessionService.getSessionKey());

      return restoredPwd;
    }
    return null;
  }, []);

  const extendSession = useCallback(() => {
    SessionService.extendSession();
  }, []);

  const unlock = useCallback((pwd: string) => {
    setPassword(pwd);
    setIsUnlocked(true);
  }, []);

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
    setSessionKey,
  };
}
