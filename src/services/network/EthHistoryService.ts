/**
 * EthHistoryService - Fetch EVM-side transaction history via Alchemy
 * Uses alchemy_getAssetTransfers (same as TokenDetailView) for consistency.
 */

const ALCHEMY_RPC = typeof import.meta !== 'undefined'
    ? import.meta.env.VITE_ETH_RPC_URL || ''
    : '';

export interface EthTransaction {
    hash: string;
    from: string;
    to: string;
    value: string;
    tokenSymbol?: string;
    tokenDecimal?: string;
    contractAddress?: string;
    timeStamp: string;
    isError?: string;
}

async function fetchAlchemyTransfers(
    evmAddress: string,
    direction: 'in' | 'out',
    limit: number
): Promise<any[]> {
    const params: any = {
        category: ['external', 'erc20'],
        withMetadata: true,
        maxCount: `0x${limit.toString(16)}`,
        order: 'desc',
    };

    if (direction === 'in') {
        params.toAddress = evmAddress;
    } else {
        params.fromAddress = evmAddress;
    }

    try {
        const res = await fetch(ALCHEMY_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getAssetTransfers',
                params: [params]
            })
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data?.result?.transfers || [];
    } catch {
        return [];
    }
}

/** Fetch native ETH transactions (both incoming and outgoing) */
export async function getEthTransactions(evmAddress: string, limit = 20): Promise<EthTransaction[]> {
    const [incoming, outgoing] = await Promise.all([
        fetchAlchemyTransfers(evmAddress, 'in', limit),
        fetchAlchemyTransfers(evmAddress, 'out', limit),
    ]);

    const toEthTx = (t: any): EthTransaction => ({
        hash: t.hash,
        from: t.from || '',
        to: t.to || '',
        value: t.rawContract?.value
            ? BigInt(t.rawContract.value).toString()
            : String(Math.round((t.value || 0) * 1e18)),
        timeStamp: t.metadata?.blockTimestamp
            ? String(Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000))
            : String(Math.floor(Date.now() / 1000)),
    });

    const seen = new Set<string>();
    return [...incoming, ...outgoing]
        .filter((t: any) => t.category === 'external')
        .map(toEthTx)
        .filter(tx => {
            if (seen.has(tx.hash)) return false;
            seen.add(tx.hash);
            return true;
        });
}

/** Fetch ERC20 token transactions for an EVM address (both directions) */
export async function getErc20Transactions(evmAddress: string, limit = 20): Promise<EthTransaction[]> {
    const [incoming, outgoing] = await Promise.all([
        fetchAlchemyTransfers(evmAddress, 'in', limit),
        fetchAlchemyTransfers(evmAddress, 'out', limit),
    ]);

    const toEthTx = (t: any): EthTransaction => ({
        hash: t.hash,
        from: t.from || '',
        to: t.to || '',
        value: t.rawContract?.value
            ? BigInt(t.rawContract.value).toString()
            : String(Math.round((t.value || 0) * Math.pow(10, parseInt(t.rawContract?.decimal || '18', 16)))),
        tokenSymbol: t.asset || '',
        tokenDecimal: t.rawContract?.decimal
            ? String(parseInt(t.rawContract.decimal, 16))
            : '18',
        contractAddress: t.rawContract?.address || '',
        timeStamp: t.metadata?.blockTimestamp
            ? String(Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000))
            : String(Math.floor(Date.now() / 1000)),
    });

    const seen = new Set<string>();
    return [...incoming, ...outgoing]
        .filter((t: any) => t.category === 'erc20')
        .map(toEthTx)
        .filter(tx => {
            if (seen.has(tx.hash)) return false;
            seen.add(tx.hash);
            return true;
        });
}

/** Convert Alchemy tx to our Transaction format */
export function ethTxToTransaction(tx: EthTransaction, myEvmAddress: string, isErc20 = false): import('../../types').Transaction {
    const isIncoming = tx.to?.toLowerCase() === myEvmAddress.toLowerCase();
    const decimals = isErc20 ? parseInt(tx.tokenDecimal || '18') : 18;
    const divisor = Math.pow(10, decimals);
    let amount = 0;
    try {
        amount = Number(BigInt(tx.value || '0')) / divisor;
    } catch {
        amount = parseFloat(tx.value || '0') / divisor;
    }

    return {
        hash: tx.hash,
        type: isIncoming ? 'in' : 'out',
        amount,
        address: isIncoming ? tx.from : tx.to,
        timestamp: parseInt(tx.timeStamp) * 1000,
        status: tx.isError === '1' ? 'failed' : 'confirmed',
        token: isErc20 ? tx.tokenSymbol : 'ETH',
        fee: 0,
    };
}
