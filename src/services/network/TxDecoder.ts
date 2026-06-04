/**
 * TxDecoder — decode EVM transaction calldata into human-readable form.
 *
 * Strategy:
 *   1. Full ethers.Interface decode if ABI is available (via AbiService).
 *   2. 4byte.directory lookup for the function signature (cached in localStorage).
 *   3. Final fallback: show "Unknown (0xABCD1234)" format.
 */

import { Interface, type TransactionDescription, getBytes } from 'ethers';
import { fetchAbi } from './AbiService';

export interface DecodedTx {
    method: string;
    /** Full signature string, e.g. "transfer(address,uint256)" */
    signature: string | null;
    args: Record<string, string>;
    fullyDecoded: boolean;
    selector: string;
}

const FOURBYTE_CACHE_KEY = '4byte_cache_v1';
const FOURBYTE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface FourByteEntry { sig: string; fetchedAt: number }
type FourByteCache = Record<string, FourByteEntry>;

function read4byteCache(): FourByteCache {
    try { return JSON.parse(localStorage.getItem(FOURBYTE_CACHE_KEY) || '{}'); }
    catch { return {}; }
}

function write4byteCache(cache: FourByteCache): void {
    try { localStorage.setItem(FOURBYTE_CACHE_KEY, JSON.stringify(cache)); }
    catch { /* quota — ignore */ }
}

/** Decode calldata given the contract address and chainId. */
export async function decodeTx(
    calldata: string,
    contractAddress: string,
    chainId: number
): Promise<DecodedTx | null> {
    if (!calldata || calldata === '0x' || calldata.length < 10) return null;

    const selector = calldata.slice(0, 10).toLowerCase();

    // 1. Full ABI decode
    try {
        const abi = await fetchAbi(contractAddress, chainId);
        if (abi && abi.length > 0) {
            const iface = new Interface(abi);
            const parsed: TransactionDescription | null = iface.parseTransaction({ data: calldata });
            if (parsed) {
                const args: Record<string, string> = {};
                parsed.fragment.inputs.forEach((input, i) => {
                    args[input.name || `arg${i}`] = String(parsed.args[i]);
                });
                const signature = `${parsed.name}(${parsed.fragment.inputs.map(i => i.type).join(',')})`;
                return { method: parsed.name, signature, args, fullyDecoded: true, selector };
            }
        }
    } catch { /* fall through */ }

    // 2. 4byte.directory lookup (with cache)
    try {
        const result = await lookup4byte(selector);
        if (result) {
            const methodName = result.split('(')[0];
            return { method: methodName, signature: result, args: {}, fullyDecoded: false, selector };
        }
    } catch { /* fall through */ }

    // 3. Raw fallback — clearly labeled as unknown
    return {
        method: `Unknown`,
        signature: null,
        args: {},
        fullyDecoded: false,
        selector,
    };
}

async function lookup4byte(selector: string): Promise<string | null> {
    const cache = read4byteCache();
    const cached = cache[selector];
    if (cached && Date.now() - cached.fetchedAt < FOURBYTE_TTL_MS) {
        return cached.sig;
    }

    const hex = selector.startsWith('0x') ? selector.slice(2) : selector;
    const res = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=0x${hex}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;

    const sig: string = data.results[0].text_signature;
    cache[selector] = { sig, fetchedAt: Date.now() };
    write4byteCache(cache);
    return sig;
}

/** Format a DecodedTx for compact display in the approval UI. */
export function formatDecodedTx(decoded: DecodedTx): string {
    if (!decoded.fullyDecoded && !decoded.signature) {
        return `Unknown (${decoded.selector})`;
    }
    if (decoded.fullyDecoded && Object.keys(decoded.args).length > 0) {
        const argPairs = Object.entries(decoded.args)
            .map(([k, v]) => `${k}: ${truncate(String(v), 20)}`)
            .join(', ');
        return `${decoded.method}(${argPairs})`;
    }
    return decoded.signature ?? decoded.method;
}

function truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

// Re-export for tests / utilities
export { getBytes };
