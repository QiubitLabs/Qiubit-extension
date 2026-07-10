/**
 * Qiubit Wallet Constants
 * Central configuration for storage keys, network, and app settings
 */

export const STORAGE_KEYS = {
  WALLETS: "_x7f_v3_blob",
  BACKUP_WALLETS: "__backup__x7f_v3_blob",
  ACTIVE_WALLET: "_x3a_idx",
  SETTINGS: "_x9c_cfg",
  TX_HISTORY: "_x4e_hist",
  PRIVACY_LOGS: "_x5p_logs",
  PRIVACY_BALANCE_CACHE: "_x6e_priv_bal",
  BALANCE_CACHE: "_x7b_bal_cache",
  TOKEN_CACHE: "_x8t_tok_cache",
  CUSTOM_TOKENS: "_x0c_custom_tokens",
  PASSWORD_HASH: "_x2b_auth", // SHA-256 hash of password
  ACTIVITY_LOGS: "__activity_logs",
};

export const BRIDGE_CONFIG = {
  OCTRA_VAULT: "oct5MrNfjiXFNRDLwsodn8Zm9hDKNGAYt3eQDCQ52bSpCHq",
  WOCT_TOKEN: "0x4647e1fE715c9e23959022C2416C71867F5a6E80",
  ETH_BRIDGE: "0xE7eD69b852fd2a1406080B26A37e8E04e7dA4caE",
  SIGNER_URL: "/api/bridge/signer",
  RECOVERY_URL: "https://relayer-002838819188.octra.network/recovery.json",
  SEPOLIA_CHAIN_ID: "0xaa36a7",
  OCT_DECIMALS: 6,
};

export const NETWORKS = {
  TESTNET: {
    id: "testnet",
    name: "Octra Testnet",
    rpcUrl: import.meta.env.VITE_TESTNET_RPC_URL || "",
    explorer: "https://testnet.octrascan.io",
  },
  MAINNET: {
    id: "mainnet",
    name: "Octra Mainnet",
    rpcUrl: import.meta.env.VITE_RPC_URL || "https://octra.network",
    explorer: "https://octrascan.io",
  },
};

/**
 * Utility to generate explorer URLs
 */
export const getExplorerUrl = (
  type: "tx" | "address",
  value: string,
  network: "mainnet" | "testnet" = "testnet",
) => {
  const base =
    network === "mainnet"
      ? NETWORKS.MAINNET.explorer
      : NETWORKS.TESTNET.explorer;
  if (type === "tx") return `${base}/tx.html?hash=${value}`;
  return `${base}/address.html?addr=${value}`;
};

export const SECURITY = {
  PBKDF2_ITERATIONS: 1000000,
  MAX_PASSWORD_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
};

export const APP_VERSION = "4.0.0";
export const STORAGE_VERSION = 4;
