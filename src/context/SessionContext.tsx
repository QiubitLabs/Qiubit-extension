import React, { createContext, useContext, ReactNode } from 'react';
import { useWalletSession } from '../hooks/useWalletSession';

// Define the shape of the context
type SessionContextType = ReturnType<typeof useWalletSession>;

const SessionContext = createContext<SessionContextType | null>(null);

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const session = useWalletSession();

    return (
        <SessionContext.Provider value={session}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return context;
};
