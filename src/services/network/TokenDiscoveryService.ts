/**
 * TokenDiscoveryService — discover all ERC20 tokens held by an address, per chain.
 *
 * Priority per chain:
 *   1. Moralis  — ETH, BSC, Polygon, Base, Arbitrum, Sepolia
 *   2. Ankr     — ETH, BSC, Polygon, Base, Arbitrum (fallback)
 *   3. eth_getLogs — Monad, Hyperliquid, any chain not covered above
 *
 * Results cached in chrome.storage.local for 2 hours.
 */

import { ethers } from "ethers";
import { getRpcList } from "../../config/rpcEndpoints";
import { NETWORK_REGISTRY } from "../../constants/networks/registry";

const MORALIS_KEY = import.meta.env.VITE_MORALIS_API_KEY as string | undefined;
const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const ANKR_KEY = import.meta.env.VITE_ANKR_API_KEY as string | undefined;
const ANKR_RPC = `https://rpc.ankr.com/multichain${ANKR_KEY ? `/${ANKR_KEY}` : ""}`;

const MORALIS_CHAIN: Record<number, string> = {
  1: "0x1",
  56: "0x38",
  137: "0x89",
  8453: "0x2105",
  42161: "0xa4b1",
};
const ANKR_CHAIN: Record<number, string> = {
  1: "eth",
  56: "bsc",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
};

const TRUSTWALLET_CHAIN: Record<number, string> = {
  1: "ethereum",
  56: "smartchain",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  11155111: "ethereum",
};

const TRANSFER_SIG =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const LOGS_LOOKBACK = 50_000; // blocks to scan for eth_getLogs chains
const LOGS_CHUNK = 2_000;

export interface DiscoveredToken {
  chainId: number;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceRaw: string;
  logoUrl?: string;
}

function cacheKey(chainId: number, address: string) {
  return `td:${chainId}:${address.toLowerCase()}`;
}

async function readCache(key: string): Promise<DiscoveredToken[] | null> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await chrome.storage.local.get(key);
      const c = res[key] as
        | { ts: number; tokens: DiscoveredToken[] }
        | undefined;
      if (c && Date.now() - c.ts < CACHE_TTL) return c.tokens;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function writeCache(
  key: string,
  tokens: DiscoveredToken[],
): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [key]: { ts: Date.now(), tokens } });
    }
  } catch {
    /* ignore */
  }
}

function trustWalletLogo(
  chainId: number,
  checksumAddr: string,
): string | undefined {
  const chain = TRUSTWALLET_CHAIN[chainId];
  if (!chain) return undefined;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chain}/assets/${checksumAddr}/logo.png`;
}

async function fetchMoralisTokens(
  address: string,
  chainId: number,
): Promise<DiscoveredToken[] | null> {
  const chain = MORALIS_CHAIN[chainId];
  if (!chain || !MORALIS_KEY) return null;
  try {
    const url = `${MORALIS_BASE}/${address}/erc20?chain=${chain}&limit=100&exclude_spam=true`;
    const res = await fetch(url, {
      headers: { "X-API-Key": MORALIS_KEY, accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data?.result ?? [];
    return items
      .filter((t) => t.balance && t.balance !== "0" && t.possible_spam !== true)
      .map((t) => {
        const dec = parseInt(t.decimals ?? "18", 10);
        const raw = t.balance ?? "0";
        let bal = "0";
        try {
          bal = Number(ethers.formatUnits(BigInt(raw), dec)).toFixed(
            dec > 6 ? 4 : 2,
          );
        } catch {
          /* ignore */
        }
        let addr = t.token_address ?? "";
        try {
          addr = ethers.getAddress(addr);
        } catch {
          /* ignore */
        }
        return {
          chainId,
          contractAddress: addr,
          symbol: t.symbol ?? "???",
          name: t.name ?? "Unknown Token",
          decimals: dec,
          balance: bal,
          balanceRaw: raw,
          logoUrl: t.logo ?? t.thumbnail ?? trustWalletLogo(chainId, addr),
        } satisfies DiscoveredToken;
      });
  } catch {
    return null;
  }
}

async function fetchAnkrTokens(
  address: string,
  chainId: number,
): Promise<DiscoveredToken[] | null> {
  const blockchain = ANKR_CHAIN[chainId];
  if (!blockchain || !ANKR_KEY) return null;
  try {
    const res = await fetch(ANKR_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ankr_getAccountBalance",
        params: { blockchain, walletAddress: address, onlyWhitelisted: false },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const assets: any[] = data?.result?.assets ?? [];
    return assets
      .filter(
        (a) =>
          a.tokenType === "ERC20" &&
          a.balanceRawInteger &&
          a.balanceRawInteger !== "0",
      )
      .map((a) => {
        const dec = parseInt(a.tokenDecimals ?? "18", 10);
        const raw = a.balanceRawInteger ?? "0";
        let bal = "0";
        try {
          bal = Number(ethers.formatUnits(BigInt(raw), dec)).toFixed(
            dec > 6 ? 4 : 2,
          );
        } catch {
          /* ignore */
        }
        let addr = a.contractAddress ?? "";
        try {
          addr = ethers.getAddress(addr);
        } catch {
          /* ignore */
        }
        return {
          chainId,
          contractAddress: addr,
          symbol: a.tokenSymbol ?? "???",
          name: a.tokenName ?? "Unknown Token",
          decimals: dec,
          balance: bal,
          balanceRaw: raw,
          logoUrl: a.thumbnail ?? trustWalletLogo(chainId, addr),
        } satisfies DiscoveredToken;
      });
  } catch {
    return null;
  }
}

async function fetchLogsTokens(
  address: string,
  chainId: number,
): Promise<DiscoveredToken[]> {
  const rpcs = getRpcList(chainId);
  if (!rpcs.length) return [];

  let provider: ethers.JsonRpcProvider | null = null;
  for (const url of rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      provider = p;
      break;
    } catch {
      continue;
    }
  }
  if (!provider) return [];

  let latest: number;
  try {
    latest = await provider.getBlockNumber();
  } catch {
    return [];
  }

  const scanFrom = Math.max(0, latest - LOGS_LOOKBACK);
  const paddedAddr = ethers.zeroPadValue(address.toLowerCase(), 32);
  const foundContracts = new Set<string>();

  for (let hi = latest; hi >= scanFrom; hi -= LOGS_CHUNK) {
    const lo = Math.max(scanFrom, hi - LOGS_CHUNK + 1);
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
    [...sent, ...recv].forEach((l) =>
      foundContracts.add(l.address.toLowerCase()),
    );
    if (foundContracts.size >= 50) break;
  }

  if (!foundContracts.size) return [];

  const erc20Abi = [
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
  ];

  const results = await Promise.all(
    [...foundContracts].map(async (addr) => {
      try {
        const checksumAddr = ethers.getAddress(addr);
        const c = new ethers.Contract(checksumAddr, erc20Abi, provider!);
        const [symbol, name, decimals, rawBal] = await Promise.all([
          c.symbol().catch(() => "???"),
          c.name().catch(() => "Unknown Token"),
          c.decimals().catch(() => 18),
          c.balanceOf(address).catch(() => 0n),
        ]);
        if (!rawBal || rawBal === 0n) return null;
        const dec = Number(decimals);
        const raw = rawBal.toString();
        const bal = Number(ethers.formatUnits(rawBal, dec)).toFixed(
          dec > 6 ? 4 : 2,
        );
        return {
          chainId,
          contractAddress: checksumAddr,
          symbol: String(symbol),
          name: String(name),
          decimals: dec,
          balance: bal,
          balanceRaw: raw,
          logoUrl: undefined,
        } satisfies DiscoveredToken;
      } catch {
        return null;
      }
    }),
  );

  return results.filter(Boolean) as DiscoveredToken[];
}

/**
 * Discover all ERC20 tokens held by `address` on the given chain.
 * Results are cached for 2 hours; pass `force=true` to skip cache.
 */
export async function discoverTokens(
  address: string,
  chainId: number,
  force = false,
): Promise<DiscoveredToken[]> {
  const key = cacheKey(chainId, address);
  if (!force) {
    const cached = await readCache(key);
    if (cached) return cached;
  }

  let tokens: DiscoveredToken[] | null = null;

  if (MORALIS_CHAIN[chainId] && MORALIS_KEY) {
    tokens = await fetchMoralisTokens(address, chainId);
  }

  if (!tokens?.length && ANKR_CHAIN[chainId] && ANKR_KEY) {
    tokens = await fetchAnkrTokens(address, chainId);
  }

  if (!tokens?.length) {
    tokens = await fetchLogsTokens(address, chainId);
  }

  const result = tokens ?? [];
  await writeCache(key, result);
  return result;
}

/**
 * Discover tokens across ALL EVM chains supported by this wallet.
 * Runs all chains in parallel.
 */
export async function discoverAllChainTokens(
  address: string,
  force = false,
): Promise<DiscoveredToken[]> {
  const evmChainIds = Object.values(NETWORK_REGISTRY)
    .filter((n) => n.isEVM && n.chainId !== null && n.id !== "sepolia")
    .map((n) => n.chainId as number);

  const results = await Promise.allSettled(
    evmChainIds.map((chainId) => discoverTokens(address, chainId, force)),
  );

  const all: DiscoveredToken[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }
  return all;
}
