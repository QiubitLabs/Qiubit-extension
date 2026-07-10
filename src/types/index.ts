export interface Wallet {
  mnemonic?: string[] | null;
  seedHex?: string;
  privateKeyHex: string;
  publicKeyHex: string;
  privateKeyB64: string;
  publicKeyB64: string;
  address: string;
  evmAddress?: string;
  id?: string;
  name?: string;
  lastKnownBalance?: number;
  [key: string]: any;
}

export interface Transaction {
  hash?: string;
  type: "in" | "out" | "shield" | "unshield" | "private" | "claim" | "swap";
  amount: number | string;
  address: string;
  timestamp: number | string;
  status: "confirmed" | "pending" | "failed" | "timeout";
  epoch?: number;
  ou?: string | number;
  symbol?: string;
  token?: string;
  finality?: string;
  fee?: string | number;
  description?: string;
  contractAddress?: string;
  networkId?: string; // which registry network this tx belongs to (e.g. 'ethereum', 'bsc', 'octra')
  fromTokenSymbol?: string;
  fromAmount?: string | number;
  toTokenSymbol?: string;
  toAmount?: string | number;
  logoUrl?: string;
  chainId?: number;
}

export interface Settings {
  network?: string; // 'all' | any key in NETWORK_REGISTRY (e.g. 'octra', 'ethereum', 'sepolia')
  rpcUrl?: string;
  [key: string]: any;
}

/** Discriminator for which VM/runtime a token lives on. Extend this union when adding a new chain. */
export type VMType = "evm" | "solana" | "sui" | "bitcoin" | "octra";

export interface Token {
  symbol: string;
  name: string;
  balance: number | string;
  /** Which VM this token belongs to. Preferred over the legacy is* boolean flags. */
  vm?: VMType;
  isNative?: boolean;
  isEVM?: boolean;
  isOCS01?: boolean;
  isTestnet?: boolean;
  chainId?: number;
  logoUrl?: string;
  logoType?: string;
  contractAddress?: string;
  decimals?: number;
  [key: string]: any;
}
