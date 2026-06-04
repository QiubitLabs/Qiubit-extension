import { bitcoinRpc } from '../BitcoinRpcService';

export const BITCOIN_CHAIN_ID = 20000000000001;

export async function fetchBitcoinBalance(address: string): Promise<string> {
    return bitcoinRpc.getBalance(address);
}

export function buildBitcoinToken(address: string, balance = '0') {
    return {
        symbol: 'BTC',
        name: 'Bitcoin',
        balance,
        vm: 'bitcoin' as const,
        isNative: false,
        isBitcoin: true,
        chainId: BITCOIN_CHAIN_ID,
        logoUrl: 'https://static.debank.com/image/chain/logo_url/btc/2860fac5e5542a773aa44fbcfedf7c19.png',
        decimals: 8,
        contractAddress: 'bitcoin',
        ownerAddress: address,
    };
}
