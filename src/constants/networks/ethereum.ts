import { EvmNetworkConfig } from "./types";

export const ETHEREUM_NETWORK: EvmNetworkConfig = {
  chainId: 1,
  name: "Ethereum Mainnet",
  rpcUrl: "https://cloudflare-eth.com",
  nativeToken: {
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    logoUrl: "/eth-icon.svg",
  },
  tokens: [
    {
      symbol: "wOCT",
      name: "Wrapped Octra (ETH)",
      decimals: 6,
      contractAddress: "0x4647e1fE715c9e23959022C2416C71867F5a6E80",
      logoUrl: "/qiubit-icon.svg",
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
    },
    {
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
    },
    {
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      contractAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
    },
    {
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
      contractAddress: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
    },
    {
      symbol: "LINK",
      name: "Chainlink",
      decimals: 18,
      contractAddress: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
    },
    {
      symbol: "UNI",
      name: "Uniswap",
      decimals: 18,
      contractAddress: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
    },
    {
      symbol: "PEPE",
      name: "Pepe",
      decimals: 18,
      contractAddress: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png",
    },
    {
      symbol: "SHIB",
      name: "SHIBA INU",
      decimals: 18,
      contractAddress: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png",
    },
    {
      symbol: "MATIC",
      name: "Polygon",
      decimals: 18,
      contractAddress: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0/logo.png",
    },
    {
      symbol: "GRT",
      name: "The Graph",
      decimals: 18,
      contractAddress: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xc944E90C64B2c07662A292be6244BDf05Cda44a7/logo.png",
    },
    {
      symbol: "AAVE",
      name: "Aave",
      decimals: 18,
      contractAddress: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png",
    },
    {
      symbol: "MKR",
      name: "Maker",
      decimals: 18,
      contractAddress: "0x9f8F72aA9304c8B593d555F12ef6589cC3A579A2",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12ef6589cC3A579A2/logo.png",
    },
    {
      symbol: "LDO",
      name: "Lido DAO",
      decimals: 18,
      contractAddress: "0x5A98FcBE2B3eB3e90C40d0068FD99169C53F6af2",
      logoUrl:
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x5A98FcBE2B3eB3e90C40d0068FD99169C53F6af2/logo.png",
    },
  ],
};
