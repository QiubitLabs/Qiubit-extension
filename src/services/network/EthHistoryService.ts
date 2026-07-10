/**
 * EthHistoryService — EVM transaction history.
 *
 * Primary  : Moralis REST API — instant per-address queries, no block scanning.
 *            Supported: ETH, BSC, Polygon, Base, Arbitrum, Sepolia.
 * Fallback : eth_getLogs scanning for chains not yet on Moralis (Monad, Hyperliquid).
 *
 * Typical call count per refresh:
 *   Moralis chains  : 2 calls per chain (native + ERC20 in parallel)
 *   Fallback chains : 2–10 getLogs per chain (newest-first, early-exit)
 */

import { ethers } from "ethers";
import { resolveNetwork } from "./NetworkResolver";
import { getRpcList } from "../../config/rpcEndpoints";
import type { Transaction } from "../../types";

const MORALIS_KEY = import.meta.env.VITE_MORALIS_API_KEY as string | undefined;
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

const MORALIS_CHAIN: Record<string, string> = {
  ethereum: "0x1",
  bsc: "0x38",
  polygon: "0x89",
  base: "0x2105",
  arbitrum: "0xa4b1",
};

const ANKR_KEY = import.meta.env.VITE_ANKR_API_KEY as string | undefined;
const ANKR_BASE = "https://rpc.ankr.com/multichain";

const ANKR_CHAIN: Record<string, string> = {
  ethereum: "eth",
  bsc: "bsc",
  polygon: "polygon",
  base: "base",
  arbitrum: "arbitrum",
};

const TRANSFER_SIG =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const INITIAL_LOOKBACK: Record<number, number> = {
  143: 50_000, // Monad          ~14h @ 1s/block
  999: 50_000, // Hyperliquid    ~14h @ 1s/block
};
const DEFAULT_LOOKBACK = 20_000;
const CHUNK = 2_000;
const MAX_CHUNKS = 5;

const tokenMeta = new Map<string, { symbol: string; decimals: number }>();
const blockTs = new Map<number, number>();

const _apiCache = new Map<string, { ts: number; data: EthTransaction[] }>();
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function _apiGet(key: string): EthTransaction[] | null {
  const c = _apiCache.get(key);
  if (c && Date.now() - c.ts < API_CACHE_TTL) return c.data;
  _apiCache.delete(key);
  return null;
}
function _apiSet(key: string, data: EthTransaction[]): void {
  if (_apiCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of _apiCache)
      if (now - v.ts > API_CACHE_TTL) _apiCache.delete(k);
  }
  _apiCache.set(key, { ts: Date.now(), data });
}

const LS_MLAST = "octra_mlast:";
function getMoralisLastTs(key: string): string | undefined {
  try {
    return localStorage.getItem(LS_MLAST + key) ?? undefined;
  } catch {
    return undefined;
  }
}
function setMoralisLastTs(key: string, isoTs: string): void {
  try {
    localStorage.setItem(LS_MLAST + key, isoTs);
  } catch {
    /* ignore */
  }
}

const LS_EMPTY = "octra_empty:";
const EMPTY_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Returns true if this endpoint was confirmed empty within the last 24 h. */
export function isEndpointEmpty(tag: string): boolean {
  try {
    const v = localStorage.getItem(LS_EMPTY + tag);
    return v !== null && Date.now() - parseInt(v, 10) < EMPTY_TTL;
  } catch {
    return false;
  }
}
/** Record that an endpoint returned 0 results right now. */
export function markEndpointEmpty(tag: string): void {
  try {
    localStorage.setItem(LS_EMPTY + tag, String(Date.now()));
  } catch {}
}
/** Remove empty mark — endpoint has confirmed activity again. */
export function clearEndpointEmpty(tag: string): void {
  try {
    localStorage.removeItem(LS_EMPTY + tag);
  } catch {}
}
/** Canonical tag for native txn endpoint. */
export function nativeTag(networkId: string, address: string): string {
  return `n:${networkId}:${address.toLowerCase()}`;
}
/** Canonical tag for ERC20 transfer endpoint. */
export function erc20Tag(networkId: string, address: string): string {
  return `e:${networkId}:${address.toLowerCase()}`;
}

const LS_LB = "octra_lb:";
function getLastBlock(key: string): number | undefined {
  try {
    const v = localStorage.getItem(LS_LB + key);
    return v !== null ? parseInt(v, 10) : undefined;
  } catch {
    return undefined;
  }
}
function setLastBlock(key: string, block: number): void {
  try {
    localStorage.setItem(LS_LB + key, String(block));
  } catch {
    /* storage full */
  }
}

async function moralisFetch(
  path: string,
  params: Record<string, string>,
): Promise<any> {
  if (!MORALIS_KEY) return null;
  const url = `${MORALIS_BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "X-API-Key": MORALIS_KEY, accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchMoralisNative(
  evmAddress: string,
  limit: number,
  chain: string,
  fromDate?: string,
): Promise<EthTransaction[]> {
  try {
    const params: Record<string, string> = {
      chain,
      limit: String(limit),
      order: "DESC",
    };
    if (fromDate) params["from_date"] = fromDate;
    const data = await moralisFetch(`/${evmAddress}`, params);
    if (!data?.result) return [];
    return (data.result as any[]).map((tx) => ({
      hash: tx.hash,
      from: tx.from_address,
      to: tx.to_address,
      value: tx.value ?? "0",
      timeStamp: String(
        Math.floor(new Date(tx.block_timestamp).getTime() / 1000),
      ),
      isError: tx.receipt_status === "0" ? "1" : "0",
    }));
  } catch {
    return [];
  }
}

async function fetchMoralisErc20(
  evmAddress: string,
  limit: number,
  chain: string,
  fromDate?: string,
): Promise<EthTransaction[]> {
  try {
    const params: Record<string, string> = {
      chain,
      limit: String(limit),
      order: "DESC",
    };
    if (fromDate) params["from_date"] = fromDate;
    const data = await moralisFetch(`/${evmAddress}/erc20/transfers`, params);
    if (!data?.result) return [];
    return (data.result as any[]).map((tx) => ({
      hash: tx.transaction_hash,
      from: tx.from_address,
      to: tx.to_address,
      value: tx.value ?? "0",
      tokenSymbol: tx.token_symbol ?? "???",
      tokenDecimal: String(tx.token_decimals ?? 18),
      contractAddress: tx.address,
      timeStamp: String(
        Math.floor(new Date(tx.block_timestamp).getTime() / 1000),
      ),
    }));
  } catch {
    return [];
  }
}

async function ankrPost(
  method: string,
  params: Record<string, unknown>,
): Promise<any> {
  if (!ANKR_KEY) return null;
  try {
    const res = await fetch(`${ANKR_BASE}/${ANKR_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchAnkrNative(
  evmAddress: string,
  limit: number,
  blockchain: string,
): Promise<EthTransaction[]> {
  try {
    const data = await ankrPost("ankr_getTransactionsByAddress", {
      blockchain,
      address: evmAddress,
      pageSize: limit,
      descOrder: true,
    });
    const txs: any[] = data?.result?.transactions ?? [];
    return txs.map((tx) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: BigInt(tx.value ?? "0x0").toString(),
      timeStamp: String(parseInt(tx.timestamp ?? "0x0", 16)),
      isError: tx.status === "0x0" ? "1" : "0",
    }));
  } catch {
    return [];
  }
}

async function fetchAnkrErc20(
  evmAddress: string,
  limit: number,
  blockchain: string,
): Promise<EthTransaction[]> {
  try {
    const data = await ankrPost("ankr_getTokenTransfers", {
      blockchain,
      address: evmAddress,
      pageSize: limit,
      descOrder: true,
    });
    const transfers: any[] = data?.result?.transfers ?? [];
    return transfers.map((tx) => ({
      hash: tx.transactionHash,
      from: tx.fromAddress,
      to: tx.toAddress,
      value: tx.value ?? "0",
      tokenSymbol: tx.tokenSymbol ?? "???",
      tokenDecimal: String(tx.tokenDecimals ?? 18),
      contractAddress: tx.tokenAddress,
      timeStamp: String(tx.timestamp ?? Math.floor(Date.now() / 1000)),
    }));
  } catch {
    return [];
  }
}

async function getWorkingProvider(
  chainId: number,
): Promise<ethers.JsonRpcProvider | null> {
  for (const url of getRpcList(chainId)) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      return p;
    } catch {
      continue;
    }
  }
  return null;
}

async function hydrateTokenMeta(
  provider: ethers.JsonRpcProvider,
  contracts: string[],
): Promise<void> {
  const missing = [...new Set(contracts.map((a) => a.toLowerCase()))].filter(
    (a) => !tokenMeta.has(a),
  );
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(
      missing.slice(i, i + 5).map(async (addr) => {
        try {
          const c = new ethers.Contract(
            addr,
            [
              "function symbol() view returns (string)",
              "function decimals() view returns (uint8)",
            ],
            provider,
          );
          const [sym, dec] = await Promise.all([
            c.symbol().catch(() => "???"),
            c.decimals().catch(() => 18),
          ]);
          tokenMeta.set(addr, { symbol: String(sym), decimals: Number(dec) });
        } catch {
          tokenMeta.set(addr, { symbol: "???", decimals: 18 });
        }
      }),
    );
  }
}

async function hydrateBlockTs(
  provider: ethers.JsonRpcProvider,
  blockNumbers: number[],
): Promise<void> {
  const missing = [...new Set(blockNumbers)].filter((n) => !blockTs.has(n));
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(
      missing.slice(i, i + 5).map(async (bn) => {
        try {
          const b = await provider.getBlock(bn);
          if (b) blockTs.set(bn, b.timestamp);
        } catch {
          /* ignore */
        }
      }),
    );
  }
}

async function fetchLogsErc20(
  evmAddress: string,
  limit: number,
  networkId: string,
  chainId: number,
): Promise<EthTransaction[]> {
  const provider = await getWorkingProvider(chainId);
  if (!provider) return [];

  let latest: number;
  try {
    latest = await provider.getBlockNumber();
  } catch {
    return [];
  }

  const cacheKey = `${networkId}:${evmAddress.toLowerCase()}`;
  const lookback = INITIAL_LOOKBACK[chainId] ?? DEFAULT_LOOKBACK;
  const savedBlock = getLastBlock(cacheKey);
  const scanFrom =
    savedBlock !== undefined ? savedBlock + 1 : Math.max(0, latest - lookback);

  if (scanFrom > latest) return [];

  const paddedAddr = ethers.zeroPadValue(evmAddress.toLowerCase(), 32);
  const needed = limit * 3;
  const collected: ethers.Log[] = [];

  const isInitialScan = savedBlock === undefined;
  const effectiveMaxChunks = isInitialScan
    ? Math.min(50, Math.ceil(lookback / CHUNK))
    : MAX_CHUNKS;

  let chunks = 0;
  for (
    let hi = latest;
    hi >= scanFrom && chunks < effectiveMaxChunks;
    hi -= CHUNK, chunks++
  ) {
    const lo = Math.max(scanFrom, hi - CHUNK + 1);
    const [sent, recv] = await Promise.all([
      provider
        .getLogs({
          topics: [TRANSFER_SIG, paddedAddr],
          fromBlock: lo,
          toBlock: hi,
        })
        .catch(() => [] as ethers.Log[]),
      provider
        .getLogs({
          topics: [TRANSFER_SIG, null, paddedAddr],
          fromBlock: lo,
          toBlock: hi,
        })
        .catch(() => [] as ethers.Log[]),
    ]);
    collected.push(...sent, ...recv);
    if (collected.length >= needed) break;
  }

  setLastBlock(cacheKey, latest);
  if (!collected.length) return [];

  const seen = new Set<string>();
  const unique = collected.filter((log) => {
    if (log.topics.length < 3) return false;
    const key = `${log.transactionHash}:${(log as any).logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort(
    (a, b) =>
      b.blockNumber - a.blockNumber ||
      (a as any).logIndex - (b as any).logIndex,
  );
  const finalLogs = unique.slice(0, limit);

  await Promise.all([
    hydrateBlockTs(
      provider,
      finalLogs.map((l) => l.blockNumber),
    ),
    hydrateTokenMeta(
      provider,
      finalLogs.map((l) => l.address),
    ),
  ]);

  return finalLogs.map((log) => {
    const from = ethers.getAddress("0x" + log.topics[1].slice(26));
    const to = ethers.getAddress("0x" + log.topics[2].slice(26));
    const raw = BigInt(log.data === "0x" ? "0" : log.data);
    const meta = tokenMeta.get(log.address.toLowerCase()) ?? {
      symbol: "???",
      decimals: 18,
    };
    const ts = blockTs.get(log.blockNumber) ?? Math.floor(Date.now() / 1000);
    return {
      hash: log.transactionHash,
      from,
      to,
      value: raw.toString(),
      tokenSymbol: meta.symbol,
      tokenDecimal: String(meta.decimals),
      contractAddress: log.address,
      timeStamp: String(ts),
    } satisfies EthTransaction;
  });
}

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

/**
 * Fetch native token transfer history for an address on EVM chains.
 * Priority: Moralis → Ankr → Etherscan-compatible
 */
export async function getEthTransactions(
  evmAddress: string,
  limit = 20,
  networkId = "ethereum",
): Promise<EthTransaction[]> {
  const net = resolveNetwork(networkId);
  if (!net) return [];

  const cKey = `native:${networkId}:${evmAddress.toLowerCase()}`;
  const cached = _apiGet(cKey);
  if (cached) return cached;

  let result: EthTransaction[] = [];

  const moralisChain = MORALIS_CHAIN[networkId];
  if (moralisChain && MORALIS_KEY) {
    const lKey = `${networkId}:${evmAddress.toLowerCase()}:native`;
    const fromDate = getMoralisLastTs(lKey);
    const fresh = await fetchMoralisNative(
      evmAddress,
      limit,
      moralisChain,
      fromDate,
    );
    if (fresh.length > 0) {
      const latestTs = Math.max(
        ...fresh.map((t) => parseInt(t.timeStamp) * 1000),
      );
      setMoralisLastTs(lKey, new Date(latestTs).toISOString());
    }
    if (fresh.length > 0 || fromDate) {
      result = fresh;
      _apiSet(cKey, result);
      return result;
    }
  }

  const ankrChain = ANKR_CHAIN[networkId];
  if (ankrChain && ANKR_KEY) {
    const r = await fetchAnkrNative(evmAddress, limit, ankrChain);
    if (r.length > 0) {
      _apiSet(cKey, r);
      return r;
    }
  }

  if (
    net.historyApi?.type === "etherscan_compatible" &&
    net.historyApi.baseUrl
  ) {
    const params = new URLSearchParams({
      module: "account",
      action: "txlist",
      address: evmAddress,
      startblock: "0",
      endblock: "latest",
      sort: "desc",
      page: "1",
      offset: String(limit),
    });
    try {
      const res = await fetch(`${net.historyApi.baseUrl}?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (data.status !== "1" || !Array.isArray(data.result)) return [];
      const r = data.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        timeStamp: tx.timeStamp,
        isError: tx.isError,
      }));
      _apiSet(cKey, r);
      return r;
    } catch {
      return [];
    }
  }

  _apiSet(cKey, result);
  return result;
}

/**
 * Fetch ERC20 Transfer history for an address.
 * Priority: Moralis → Ankr → Etherscan-compatible → eth_getLogs
 */
export async function getErc20Transactions(
  evmAddress: string,
  limit = 20,
  networkId = "ethereum",
): Promise<EthTransaction[]> {
  const net = resolveNetwork(networkId);
  if (!net) return [];

  const cKey = `erc20:${networkId}:${evmAddress.toLowerCase()}`;
  const cached = _apiGet(cKey);
  if (cached) return cached;

  const moralisChain = MORALIS_CHAIN[networkId];
  if (moralisChain && MORALIS_KEY) {
    const lKey = `${networkId}:${evmAddress.toLowerCase()}:erc20`;
    const fromDate = getMoralisLastTs(lKey);
    const fresh = await fetchMoralisErc20(
      evmAddress,
      limit,
      moralisChain,
      fromDate,
    );
    if (fresh.length > 0) {
      const latestTs = Math.max(
        ...fresh.map((t) => parseInt(t.timeStamp) * 1000),
      );
      setMoralisLastTs(lKey, new Date(latestTs).toISOString());
    }
    if (fresh.length > 0 || fromDate) {
      _apiSet(cKey, fresh);
      return fresh;
    }
  }

  const ankrChain = ANKR_CHAIN[networkId];
  if (ankrChain && ANKR_KEY) {
    const r = await fetchAnkrErc20(evmAddress, limit, ankrChain);
    if (r.length > 0) {
      _apiSet(cKey, r);
      return r;
    }
  }

  if (
    net.historyApi?.type === "etherscan_compatible" &&
    net.historyApi.baseUrl
  ) {
    const params = new URLSearchParams({
      module: "account",
      action: "tokentx",
      address: evmAddress,
      startblock: "0",
      endblock: "latest",
      sort: "desc",
      page: "1",
      offset: String(limit),
    });
    try {
      const res = await fetch(`${net.historyApi.baseUrl}?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (data.status !== "1" || !Array.isArray(data.result)) return [];
      const r = data.result.map((tx: any) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        tokenSymbol: tx.tokenSymbol,
        tokenDecimal: tx.tokenDecimal,
        contractAddress: tx.contractAddress,
        timeStamp: tx.timeStamp,
      }));
      _apiSet(cKey, r);
      return r;
    } catch {
      return [];
    }
  }

  const chainId = net.chainId;
  if (!chainId) return [];
  const r = await fetchLogsErc20(evmAddress, limit, networkId, chainId);
  _apiSet(cKey, r);
  return r;
}

/** @deprecated Use getEthTransactions(addr, limit, 'sepolia') instead */
export async function getSepoliaTransactions(
  evmAddress: string,
  limit = 30,
): Promise<EthTransaction[]> {
  return getEthTransactions(evmAddress, limit, "sepolia");
}

/**
 * Convert a raw EthTransaction to our internal Transaction type.
 * nativeSymbol: the native token of the chain (e.g. 'ETH', 'BNB', 'POL').
 */
export function ethTxToTransaction(
  tx: EthTransaction,
  myEvmAddress: string,
  isErc20 = false,
  nativeSymbol = "ETH",
): Transaction {
  const isIncoming = tx.to?.toLowerCase() === myEvmAddress.toLowerCase();
  const decimals = isErc20 ? parseInt(tx.tokenDecimal || "18") : 18;
  let amount = 0;
  try {
    amount = Number(BigInt(tx.value || "0")) / Math.pow(10, decimals);
  } catch {
    amount = parseFloat(tx.value || "0") / Math.pow(10, decimals);
  }
  return {
    hash: tx.hash,
    type: isIncoming ? "in" : "out",
    amount,
    address: isIncoming ? tx.from : tx.to,
    timestamp: parseInt(tx.timeStamp) * 1000,
    status: tx.isError === "1" ? "failed" : "confirmed",
    token: isErc20 ? tx.tokenSymbol || undefined : nativeSymbol,
    contractAddress: isErc20 ? tx.contractAddress || undefined : undefined,
    fee: 0,
  };
}

export { getErc20Transactions as fetchAlchemyHistory };
