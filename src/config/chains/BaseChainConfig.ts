export interface Erc20Config {
    symbol: string;
    name: string;
    contractAddress: string;
    decimals: number;
    logoUrl: string;
}

export interface ChainConfig {
    id: string;
    displayName: string;
    shortName: string;
    chainId: number | null;
    isEVM: boolean;
    isTestnet: boolean;
    rpcUrl: string;
    rpcUrls: string[];
    iconUrl: string;
    badgeColor: string;
    nativeSymbol: string;
    nativeDecimals: number;
    blockExplorerUrl?: string;
    erc20Tokens?: Erc20Config[];
}

export abstract class BaseChainConfig implements ChainConfig {
    abstract id: string;
    abstract displayName: string;
    abstract shortName: string;
    abstract chainId: number | null;
    abstract isEVM: boolean;
    abstract isTestnet: boolean;
    abstract rpcUrl: string;
    abstract rpcUrls: string[];
    abstract iconUrl: string;
    abstract badgeColor: string;
    abstract nativeSymbol: string;
    abstract nativeDecimals: number;
    blockExplorerUrl?: string;
    erc20Tokens?: Erc20Config[];

    getInsufficientFundsMessage(): string {
        return `Insufficient ${this.nativeSymbol} balance for gas fee. Please deposit some ${this.nativeSymbol}.`;
    }
}
