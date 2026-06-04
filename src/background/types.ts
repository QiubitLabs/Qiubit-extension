export interface DappConnection {
    origin: string;
    title?: string;
    favicon?: string;
    address: string;
    evmAddress: string | null;
    connected: boolean;
    connectedAt: number;
    networkId: string;
    chainId: number;
    networkSetting: string;
}

export interface DappApproval {
    type: string;
    origin: string;
    params: Record<string, any>;
    timestamp: number;
    resolve: (val: any) => void;
    reject: (err: any) => void;
}

export interface SessionCache {
    address?: string;
    evmAddress?: string;
    publicKeyB64?: string;
    publicKey?: string;
    network?: string;
    encryptedPrivateKey?: string;
    [key: string]: any;
}

export interface WalletInfo {
    address: string;
    evmAddress?: string | null;
    solanaAddress?: string | null;
    suiAddress?: string | null;
    publicKeyB64?: string | null;
    publicKey?: string | null;
    network?: string;
    privateKey?: string;
    privateKeyB64?: string;
    [key: string]: any;
}

export interface ChainConnection {
    origin: string;
    address: string;
    connected: boolean;
    connectedAt: number;
}

export interface DappResponse {
    result?: any;
    error?: { code: number; message: string } | string;
}
