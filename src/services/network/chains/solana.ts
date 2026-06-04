import { solanaRpc } from '../SolanaRpcService';

export const SOLANA_CHAIN_ID = 1151111081099710;

export async function fetchSolanaBalance(address: string): Promise<string> {
    return solanaRpc.getBalance(address);
}

export function buildSolanaToken(address: string, balance = '0') {
    return {
        symbol: 'SOL',
        name: 'Solana',
        balance,
        vm: 'solana' as const,
        isNative: false,
        isSolana: true,
        chainId: SOLANA_CHAIN_ID,
        logoUrl: 'https://icons.llamao.fi/icons/chains/rsz_solana.jpg',
        decimals: 9,
        ownerAddress: address,
    };
}
