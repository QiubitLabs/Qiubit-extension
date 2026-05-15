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
    type: 'in' | 'out' | 'shield' | 'unshield' | 'private' | 'claim';
    amount: number | string;
    address: string;
    timestamp: number | string;
    status: 'confirmed' | 'pending' | 'failed' | 'timeout';
    epoch?: number;
    ou?: string | number;
    symbol?: string;
    token?: string;
    finality?: string;
    fee?: string | number;
    description?: string;
    contractAddress?: string;
}

export interface Settings {
    network?: 'mainnet' | 'testnet';
    rpcUrl?: string;
    [key: string]: any;
}

export interface Token {
    symbol: string;
    name: string;
    balance: number | string;
    isNative?: boolean;
    logoUrl?: string;
    logoType?: string;
    contractAddress?: string;
    [key: string]: any;
}
