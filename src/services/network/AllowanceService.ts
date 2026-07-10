/**
 * AllowanceService — discovers and revokes ERC-20 token approvals.
 *
 * Discovery scans the chain's Approval(owner, spender, value) event logs where
 * owner = the wallet, then reads the *current* on-chain allowance for each
 * (token, spender) pair so stale/spent approvals are filtered out. Revoke
 * builds an approve(spender, 0) transaction and signs it via KeyringService.
 */

import { ethers } from "ethers";
import { getBalanceRpcList } from "../../utils/evmProvider";
import { getRpcList } from "../../config/rpcEndpoints";
import { keyringService } from "../core/KeyringService";

// keccak256("Approval(address,address,uint256)")
const APPROVAL_TOPIC =
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const MAX_UINT256 = (1n << 256n) - 1n;

// Etherscan V2: one API key covers 60+ chains via the `chainid` param. Its
// logs/getLogs endpoint paginates full-history scans that raw public RPCs
// reject, so we use it first and only fall back to eth_getLogs when a chain
// isn't indexed by Etherscan (e.g. Monad, Hyperliquid).
const ETHERSCAN_V2_URL = "https://api.etherscan.io/v2/api";
const ETHERSCAN_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY as
  | string
  | undefined;
const ETHERSCAN_V2_CHAINS = new Set<number>([
  1, // Ethereum
  11155111, // Sepolia
  56, // BSC
  137, // Polygon
  8453, // Base
  42161, // Arbitrum
  10, // Optimism
]);
const ETHERSCAN_PAGE_SIZE = 1000;
const ETHERSCAN_MAX_PAGES = 5;

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export interface TokenApproval {
  token: string;
  tokenSymbol: string;
  decimals: number;
  spender: string;
  /** Raw allowance as a decimal string. */
  allowanceRaw: string;
  /** True when the allowance is (near) unlimited. */
  isUnlimited: boolean;
}

function topicToAddress(topic: string): string {
  return ethers.getAddress("0x" + topic.slice(-40));
}

/**
 * Ordered RPC list for approval scanning. Private/archive endpoints
 * (Infura, dRPC, …) are tried first because they allow full-range
 * eth_getLogs; public nodes that reject wide ranges come last.
 */
function scanRpcList(chainId: number): string[] {
  const priv = getRpcList(chainId);
  const merged = [...priv];
  for (const url of getBalanceRpcList(chainId)) {
    if (url && !merged.includes(url)) merged.push(url);
  }
  return merged;
}

/** A raw Approval log reduced to the fields we need. */
interface ApprovalLog {
  address: string;
  topics: string[];
}

/**
 * Fetch Approval logs via the Etherscan V2 API. Returns null when the explorer
 * can't serve this chain (no key, unsupported chainId, or an API error) so the
 * caller can fall back to a raw RPC scan. An empty array means "scanned, no
 * approvals" and is a valid result.
 */
async function fetchApprovalsViaExplorer(
  ownerTopic: string,
  chainId: number,
): Promise<ApprovalLog[] | null> {
  if (!ETHERSCAN_KEY || !ETHERSCAN_V2_CHAINS.has(chainId)) return null;

  const logs: ApprovalLog[] = [];
  for (let page = 1; page <= ETHERSCAN_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      chainid: String(chainId),
      module: "logs",
      action: "getLogs",
      fromBlock: "0",
      toBlock: "latest",
      topic0: APPROVAL_TOPIC,
      topic1: ownerTopic,
      topic0_1_opr: "and",
      page: String(page),
      offset: String(ETHERSCAN_PAGE_SIZE),
      apikey: ETHERSCAN_KEY,
    });

    let data: any;
    try {
      const res = await fetch(`${ETHERSCAN_V2_URL}?${params}`);
      if (!res.ok) return page === 1 ? null : logs;
      data = await res.json();
    } catch {
      return page === 1 ? null : logs;
    }

    // status "0" + "No records found" is a valid empty result; any other
    // status "0" (bad key, rate limit, unsupported chain) → fall back.
    if (data.status === "0") {
      const msg = String(data.message || "").toLowerCase();
      if (msg.includes("no records")) return logs;
      return page === 1 ? null : logs;
    }
    if (!Array.isArray(data.result)) return page === 1 ? null : logs;

    for (const log of data.result) {
      if (Array.isArray(log.topics) && log.topics.length >= 3) {
        logs.push({ address: log.address, topics: log.topics });
      }
    }
    if (data.result.length < ETHERSCAN_PAGE_SIZE) break; // last page
  }
  return logs;
}

/**
 * Full-range eth_getLogs fallback for chains Etherscan doesn't index. Public
 * nodes often reject block-0→latest ranges, so this is best-effort.
 */
async function fetchApprovalsViaRpc(
  ownerTopic: string,
  chainId: number,
): Promise<ApprovalLog[]> {
  const rpcs = scanRpcList(chainId);
  if (rpcs.length === 0) throw new Error("No RPC configured for this network.");

  const filter = {
    fromBlock: 0,
    toBlock: "latest" as const,
    topics: [APPROVAL_TOPIC, ownerTopic],
  };

  let rangeRejected = false;
  for (const url of rpcs) {
    try {
      const p = new ethers.JsonRpcProvider(url, chainId, {
        staticNetwork: true,
      });
      const logs = await p.getLogs(filter);
      return logs.map((l) => ({ address: l.address, topics: [...l.topics] }));
    } catch (e: any) {
      const msg = String(e?.message || e).toLowerCase();
      if (msg.includes("range") || msg.includes("limit") || msg.includes("block"))
        rangeRejected = true;
    }
  }

  throw new Error(
    rangeRejected
      ? "This network's RPCs limit log scans, so approvals can't be listed here. Try Ethereum or an L2."
      : "No reachable RPC returned approval logs for this network.",
  );
}

/** First RPC that responds, used for the (cheap) allowance eth_call reads. */
async function firstReachableProvider(
  chainId: number,
): Promise<ethers.JsonRpcProvider> {
  for (const url of scanRpcList(chainId)) {
    try {
      const p = new ethers.JsonRpcProvider(url, chainId, {
        staticNetwork: true,
      });
      await p.getBlockNumber();
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error("No reachable RPC for this network.");
}

export async function discoverApprovals(
  owner: string,
  chainId: number,
): Promise<TokenApproval[]> {
  const ownerTopic = ethers.zeroPadValue(owner.toLowerCase(), 32);

  // Prefer the Etherscan index (full-history, paginated); fall back to a raw
  // RPC scan for chains it doesn't cover.
  let logs = await fetchApprovalsViaExplorer(ownerTopic, chainId);
  if (logs === null) {
    logs = await fetchApprovalsViaRpc(ownerTopic, chainId);
  }

  // Reading current allowances is a plain eth_call, allowed by any RPC.
  const provider = await firstReachableProvider(chainId);

  // Keep the latest (token, spender) pair only
  const pairs = new Map<string, { token: string; spender: string }>();
  for (const log of logs) {
    if (log.topics.length < 3) continue;
    const token = ethers.getAddress(log.address);
    const spender = topicToAddress(log.topics[2]);
    pairs.set(`${token}:${spender}`, { token, spender });
  }

  const results: TokenApproval[] = [];
  await Promise.all(
    Array.from(pairs.values()).map(async ({ token, spender }) => {
      try {
        const c = new ethers.Contract(token, ERC20_ABI, provider);
        const allowance: bigint = await c.allowance(owner, spender);
        if (allowance === 0n) return; // already revoked / spent
        const [symbol, decimals] = await Promise.all([
          c.symbol().catch(() => "?"),
          c.decimals().catch(() => 18),
        ]);
        results.push({
          token,
          tokenSymbol: symbol,
          decimals: Number(decimals),
          spender,
          allowanceRaw: allowance.toString(),
          isUnlimited: allowance > MAX_UINT256 / 2n,
        });
      } catch {
        /* skip unreadable token */
      }
    }),
  );

  return results.sort((a, b) =>
    a.tokenSymbol.localeCompare(b.tokenSymbol),
  );
}

export async function revokeApproval(params: {
  owner: string;
  token: string;
  spender: string;
  chainId: number;
  rpcUrl: string;
}): Promise<string> {
  const { owner, token, spender, rpcUrl } = params;
  const iface = new ethers.Interface(ERC20_ABI);
  const data = iface.encodeFunctionData("approve", [spender, 0n]);
  const txResponse = await keyringService.signAndSendEvm(
    owner,
    { to: token, data },
    rpcUrl,
  );
  return txResponse.hash;
}

/** Human-readable allowance ("Unlimited" or a formatted number). */
export function formatAllowance(a: TokenApproval): string {
  if (a.isUnlimited) return "Unlimited";
  try {
    const v = ethers.formatUnits(a.allowanceRaw, a.decimals);
    return parseFloat(v).toLocaleString("en-US", { maximumFractionDigits: 4 });
  } catch {
    return a.allowanceRaw;
  }
}
