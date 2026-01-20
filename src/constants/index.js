/**
 * Octra Wallet Constants
 * Central configuration for storage keys, network, and app settings
 */

// Storage Keys (Unified for v3 and v4)
export const STORAGE_KEYS = {
    WALLETS: '_x7f_v3_blob',
    BACKUP_WALLETS: '__backup_._x7f_v3_blob',
    ACTIVE_WALLET: '_x3a_idx',
    SETTINGS: '_x9c_cfg',
    TX_HISTORY: '_x4e_hist',
    PRIVACY_LOGS: '_x5p_logs',
    PRIVACY_BALANCE_CACHE: '_x6e_priv_bal',
    BALANCE_CACHE: '_x7b_bal_cache',
    TOKEN_CACHE: '_x8t_tok_cache',
    CUSTOM_TOKENS: '_x0c_custom_tokens',
    PASSWORD_HASH: '_x2b_auth', // SHA-256 hash of password
    ACTIVITY_LOGS: '__activity_logs',
};

// Network Configuration
export const NETWORKS = {
    TESTNET: {
        id: 'testnet',
        name: 'Octra Testnet',
        rpcUrl: import.meta.env.VITE_TESTNET_RPC_URL || '',
        explorer: 'https://explorer.testnet.octra.network',
    },
    MAINNET: {
        id: 'mainnet',
        name: 'Octra Mainnet',
        rpcUrl: import.meta.env.VITE_RPC_URL || 'https://octra.network',
        explorer: 'https://explorer.octra.network',
    }
};

// Security Constants
export const SECURITY = {
    PBKDF2_ITERATIONS: 1000000,
    MAX_PASSWORD_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
};

// App Versions
export const APP_VERSION = '4.0.0';
export const STORAGE_VERSION = 4;
