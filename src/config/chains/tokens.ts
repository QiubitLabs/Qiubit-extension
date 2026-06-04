import { Erc20Config } from './BaseChainConfig';

export const ETHEREUM_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'wOCT',    name: 'Wrapped Octra',           decimals: 6,   contractAddress: '0x4647e1fE715c9e23959022C2416C71867F5a6E80',  logoUrl: '/chains/ethereum/woct.svg' },
    { symbol: 'USDT',    name: 'Tether USDt',             decimals: 6,   contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',  logoUrl: '/chains/ethereum/usdt.png' },
    { symbol: 'USDC',    name: 'USDC',                    decimals: 6,   contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',  logoUrl: '/chains/ethereum/usdc.png' },
    { symbol: 'WBTC',    name: 'Wrapped Bitcoin',         decimals: 8,   contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',  logoUrl: '/chains/ethereum/wbtc.png' },
    { symbol: 'DAI',     name: 'Dai',                     decimals: 18,  contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',  logoUrl: '/chains/ethereum/dai.png' },
    { symbol: 'LINK',    name: 'Chainlink',               decimals: 18,  contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA',  logoUrl: '/chains/ethereum/link.png' },
    { symbol: 'UNI',     name: 'Uniswap',                 decimals: 18,  contractAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',  logoUrl: '/chains/ethereum/uni.png' },
    { symbol: 'AAVE',    name: 'Aave',                    decimals: 18,  contractAddress: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',  logoUrl: '/chains/ethereum/aave.png' },
    { symbol: 'SHIB',    name: 'Shiba Inu',               decimals: 18,  contractAddress: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',  logoUrl: '/chains/ethereum/shib.png' },
    { symbol: 'WETH',    name: 'WETH',                    decimals: 18,  contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  logoUrl: '/chains/ethereum/weth.png' },
];

export const BSC_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'USDT',    name: 'Tether USD',              decimals: 18,  contractAddress: '0x55d398326f99059fF775485246999027B3197955',  logoUrl: '/chains/bsc/usdt.png' },
    { symbol: 'USDC',    name: 'USD Coin',                decimals: 18,  contractAddress: '0x8AC76a51cc950d9822D68b83FE1Ad97B32CD580d',  logoUrl: '' },
    { symbol: 'BTCB',    name: 'BTCB Token',              decimals: 18,  contractAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',  logoUrl: '/chains/bsc/btcb.png' },
    { symbol: 'ETH',     name: 'Ethereum Token',          decimals: 18,  contractAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',  logoUrl: '/chains/bsc/eth.png' },
    { symbol: 'Cake',    name: 'PancakeSwap Token',       decimals: 18,  contractAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',  logoUrl: '/chains/bsc/cake.png' },
    { symbol: 'XRP',     name: 'XRP Token',               decimals: 18,  contractAddress: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',  logoUrl: '/chains/bsc/xrp.png' },
    { symbol: 'DOT',     name: 'Polkadot Token',          decimals: 18,  contractAddress: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',  logoUrl: '/chains/bsc/dot.png' },
    { symbol: 'WBNB',    name: 'Wrapped BNB',             decimals: 18,  contractAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',  logoUrl: '/chains/bsc/wbnb.png' },
    { symbol: 'BUSD',    name: 'BUSD Token',              decimals: 18,  contractAddress: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',  logoUrl: '/chains/bsc/busd.png' },
    { symbol: 'ADA',     name: 'Cardano Token',           decimals: 18,  contractAddress: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',  logoUrl: '/chains/bsc/ada.png' },
];

export const POLYGON_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'USDC',    name: 'USDC',                    decimals: 6,   contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',  logoUrl: '/chains/polygon/usdc.png' },
    { symbol: 'USDT',    name: 'Tether USDt',             decimals: 6,   contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',  logoUrl: '/chains/polygon/usdt.png' },
    { symbol: 'WETH',    name: 'WETH',                    decimals: 18,  contractAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',  logoUrl: '/chains/polygon/weth.png' },
    { symbol: 'WBTC',    name: 'Wrapped Bitcoin',         decimals: 8,   contractAddress: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',  logoUrl: '/chains/polygon/wbtc.png' },
    { symbol: 'DAI',     name: 'Dai',                     decimals: 18,  contractAddress: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',  logoUrl: '/chains/polygon/dai.png' },
    { symbol: 'LINK',    name: 'Chainlink',               decimals: 18,  contractAddress: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',  logoUrl: '/chains/polygon/link.png' },
    { symbol: 'AAVE',    name: 'Aave',                    decimals: 18,  contractAddress: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',  logoUrl: '/chains/polygon/aave.png' },
    { symbol: 'WMATIC',  name: 'Wrapped Matic',           decimals: 18,  contractAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',  logoUrl: '/chains/polygon/wmatic.png' },
    { symbol: 'BAL',     name: 'Balancer',                decimals: 18,  contractAddress: '0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3',  logoUrl: '/chains/polygon/bal.png' },
    { symbol: 'USDCE',   name: 'USD Coin Bridged',        decimals: 6,   contractAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',  logoUrl: '/chains/polygon/usdce.png' },
];

export const BASE_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'USDC',    name: 'USD Coin',                decimals: 6,   contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  logoUrl: '/chains/base/usdc.png' },
    { symbol: 'WETH',    name: 'Wrapped Ether',           decimals: 18,  contractAddress: '0x4200000000000000000000000000000000000006',  logoUrl: '/chains/base/weth.png' },
    { symbol: 'DAI',     name: 'Dai Stablecoin',          decimals: 18,  contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',  logoUrl: '/chains/base/dai.png' },
    { symbol: 'AERO',    name: 'Aerodrome',               decimals: 18,  contractAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',  logoUrl: '/chains/base/aero.png' },
    { symbol: 'cbETH',   name: 'Coinbase Wrapped Staked ETH', decimals: 18,  contractAddress: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',  logoUrl: '/chains/base/cbeth.png' },
    { symbol: 'USDbC',   name: 'USD Base Coin',           decimals: 6,   contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',  logoUrl: '/chains/base/usdbc.png' },
    { symbol: 'VIRTUAL', name: 'Virtual Protocol',        decimals: 18,  contractAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',  logoUrl: '/chains/base/virtual.png' },
    { symbol: 'EURC',    name: 'EURC',                    decimals: 6,   contractAddress: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42',  logoUrl: '/chains/base/eurc.png' },
    { symbol: 'BRETT',   name: 'Brett',                   decimals: 18,  contractAddress: '0x532f27101965dd16442E59d40670FaF5eBB142E4',  logoUrl: '/chains/base/brett.png' },
    { symbol: 'USDT',    name: 'Tether USD',              decimals: 6,   contractAddress: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',  logoUrl: '/chains/base/usdt.png' },
];

export const ARBITRUM_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'USDC',    name: 'USDC',                    decimals: 6,   contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  logoUrl: '/chains/arbitrum/usdc.png' },
    { symbol: 'USDT',    name: 'Tether USDt',             decimals: 6,   contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',  logoUrl: '/chains/arbitrum/usdt.png' },
    { symbol: 'ARB',     name: 'Arbitrum',                decimals: 18,  contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',  logoUrl: '/chains/arbitrum/arb.png' },
    { symbol: 'WBTC',    name: 'Wrapped Bitcoin',         decimals: 8,   contractAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',  logoUrl: '/chains/arbitrum/wbtc.png' },
    { symbol: 'LINK',    name: 'Chainlink',               decimals: 18,  contractAddress: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',  logoUrl: '/chains/arbitrum/link.png' },
    { symbol: 'WETH',    name: 'WETH',                    decimals: 18,  contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',  logoUrl: '/chains/arbitrum/weth.png' },
    { symbol: 'DAI',     name: 'Dai',                     decimals: 18,  contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',  logoUrl: '/chains/arbitrum/dai.png' },
    { symbol: 'STG',     name: 'Stargate Finance',        decimals: 18,  contractAddress: '0x6694340fc020c5E6B96567843da2df01b2CE1eb6',  logoUrl: '/chains/arbitrum/stg.png' },
    { symbol: 'LDO',     name: 'Lido DAO',                decimals: 18,  contractAddress: '0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60',  logoUrl: '/chains/arbitrum/ldo.png' },
    { symbol: 'JOE',     name: 'JoeToken',                decimals: 18,  contractAddress: '0x371c7ec6D8039ff7933a2AA28EB827Ffe1F52f07',  logoUrl: '/chains/arbitrum/joe.png' },
];

export const OPTIMISM_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'USDC',    name: 'USD Coin',                decimals: 6,   contractAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',  logoUrl: '/chains/optimism/usdc.png' },
    { symbol: 'USDT',    name: 'Tether USD',              decimals: 6,   contractAddress: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',  logoUrl: '/chains/optimism/usdt.png' },
    { symbol: 'WETH',    name: 'Wrapped Ether',           decimals: 18,  contractAddress: '0x4200000000000000000000000000000000000006',  logoUrl: '/chains/optimism/weth.png' },
    { symbol: 'DAI',     name: 'Dai Stablecoin',          decimals: 18,  contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',  logoUrl: '/chains/optimism/dai.png' },
    { symbol: 'OP',      name: 'Optimism',                decimals: 18,  contractAddress: '0x4200000000000000000000000000000000000042',  logoUrl: '/chains/optimism/op.png' },
    { symbol: 'WBTC',    name: 'Wrapped BTC',             decimals: 8,   contractAddress: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',  logoUrl: '' },
    { symbol: 'LINK',    name: 'ChainLink Token',         decimals: 18,  contractAddress: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',  logoUrl: '/chains/optimism/link.png' },
    { symbol: 'SNX',     name: 'Synthetix Network Token', decimals: 18,  contractAddress: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4',  logoUrl: '/chains/optimism/snx.png' },
    { symbol: 'VELO',    name: 'VelodromeV2',             decimals: 18,  contractAddress: '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db',  logoUrl: '/chains/optimism/velo.png' },
    { symbol: 'wstETH',  name: 'Wrapped liquid staked Ether 2.0', decimals: 18,  contractAddress: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',  logoUrl: '/chains/optimism/wsteth.png' },
];

// ── Solana SPL token list ─────────────────────────────────────────────────────
export interface SplTokenConfig {
    symbol: string;
    name: string;
    decimals: number;
    mintAddress: string; // Solana program address
    logoUrl: string;
}

export const SOLANA_SPL_TOKENS: SplTokenConfig[] = [
    { symbol: 'USDC',  name: 'USD Coin',      decimals: 6,  mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', logoUrl: '/chains/solana/usdc.png' },
    { symbol: 'USDT',  name: 'Tether USD',    decimals: 6,  mintAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  logoUrl: '/chains/solana/usdt.png' },
    { symbol: 'RAY',   name: 'Raydium',       decimals: 6,  mintAddress: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',  logoUrl: '/chains/solana/ray.png' },
    { symbol: 'BONK',  name: 'Bonk',          decimals: 5,  mintAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',  logoUrl: '/chains/solana/bonk.png' },
    { symbol: 'JUP',   name: 'Jupiter',       decimals: 6,  mintAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',   logoUrl: '/chains/solana/jup.png' },
    { symbol: 'WIF',   name: 'dogwifhat',     decimals: 6,  mintAddress: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',  logoUrl: '/chains/solana/wif.png' },
    { symbol: 'PYTH',  name: 'Pyth Network',  decimals: 6,  mintAddress: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',  logoUrl: '/chains/solana/pyth.png' },
];





// ── Hyperliquid EVM (chainId 999) ERC-20 tokens ──────────────────────────────
export const HYPERLIQUID_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'WHYPE',  name: 'Wrapped HYPE',  decimals: 18, contractAddress: '0x5555555555555555555555555555555555555555', logoUrl: '/chains/hyperliquid/whype.png' },
    { symbol: 'USDC',   name: 'USD Coin',       decimals: 6,  contractAddress: '0xb88339cb7199b77e23db6e890353e22632ba630f', logoUrl: '/chains/hyperliquid/usdc.png' },
    { symbol: 'USDT0',  name: 'USDT0',          decimals: 6,  contractAddress: '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', logoUrl: '/chains/hyperliquid/usdt0.png' },
    { symbol: 'PURR',   name: 'Purr',           decimals: 18, contractAddress: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', logoUrl: '/chains/hyperliquid/purr.png' },
];





// ── Monad (chainId 143) ERC-20 tokens ────────────────────────────────────────
// All addresses verified via CoinGecko coin list (platform: "monad")
export const MONAD_ERC20_TOKENS: Erc20Config[] = [
    { symbol: 'WMON',   name: 'Wrapped MON',    decimals: 18, contractAddress: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', logoUrl: '/chains/monad/wmon.png' },
    { symbol: 'USDC',   name: 'USD Coin',        decimals: 6,  contractAddress: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', logoUrl: '/chains/monad/usdc.png' },
    { symbol: 'USDT0',  name: 'USDT0',           decimals: 6,  contractAddress: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', logoUrl: '/chains/monad/usdt0.png' },
    { symbol: 'WETH',   name: 'Wrapped Ether',   decimals: 18, contractAddress: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', logoUrl: '/chains/monad/weth.png' },
    { symbol: 'WBTC',   name: 'Wrapped Bitcoin', decimals: 8,  contractAddress: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', logoUrl: '/chains/monad/wbtc.png' },
    { symbol: 'LINK',   name: 'Chainlink',       decimals: 18, contractAddress: '0x6fE981dbD557f81FF66836af0932cba535cbc343', logoUrl: '/chains/ethereum/link.png' },
];





// ── SUI coin type list ────────────────────────────────────────────────────────
export interface SuiCoinConfig {
    symbol: string;
    name: string;
    decimals: number;
    coinType: string; // SUI coin type (full type path)
    logoUrl: string;
}

export const SUI_COIN_TOKENS: SuiCoinConfig[] = [
    { symbol: 'USDC',  name: 'USD Coin',     decimals: 6, coinType: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN', logoUrl: '/chains/sui/usdc.png' },
    { symbol: 'USDT',  name: 'Tether USD',   decimals: 6, coinType: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', logoUrl: '/chains/sui/usdt.png' },
    { symbol: 'DEEP',  name: 'DeepBook',     decimals: 6, coinType: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', logoUrl: '/chains/sui/deep.png' },
    { symbol: 'CETUS', name: 'Cetus Protocol', decimals: 9, coinType: '0x6864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS', logoUrl: '/chains/sui/cetus.png' },
];
