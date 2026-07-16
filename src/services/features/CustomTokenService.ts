/**
 * CustomTokenService — per-wallet user-added ERC20 tokens.
 *
 * Storage key: `custom_tokens_v1`
 * Shape: { [walletAddress: string]: CustomToken[] }
 *
 * Tokens are scoped by wallet (Octra address) so each account has its own list.
 */

import { ethers } from "ethers";
import { getEvmRpcUrlForChain } from "../../utils/evmProvider";

const STORAGE_KEY = "custom_tokens_v1";

export interface CustomToken {
  contractAddress: string; // checksummed 0x address
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string;
  chainId: number;
  addedAt: number;
}

async function readAll(): Promise<Record<string, CustomToken[]>> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ? JSON.parse(result[STORAGE_KEY] as string) : {};
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, CustomToken[]>): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(data) });
}

export async function getCustomTokens(
  walletAddress: string,
  chainId?: number,
): Promise<CustomToken[]> {
  const all = await readAll();
  const list = all[walletAddress] ?? [];
  return chainId != null ? list.filter((t) => t.chainId === chainId) : list;
}

export async function addCustomToken(
  walletAddress: string,
  token: CustomToken,
): Promise<void> {
  const all = await readAll();
  const list = all[walletAddress] ?? [];
  const exists = list.findIndex(
    (t) =>
      t.contractAddress.toLowerCase() === token.contractAddress.toLowerCase() &&
      t.chainId === token.chainId,
  );
  if (exists >= 0) {
    list[exists] = token;
  } else {
    list.push(token);
  }
  all[walletAddress] = list;
  await writeAll(all);
}

export async function removeCustomToken(
  walletAddress: string,
  contractAddress: string,
  chainId: number,
): Promise<void> {
  const all = await readAll();
  const list = all[walletAddress] ?? [];
  all[walletAddress] = list.filter(
    (t) =>
      !(
        t.contractAddress.toLowerCase() === contractAddress.toLowerCase() &&
        t.chainId === chainId
      ),
  );
  await writeAll(all);
}

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
];

/**
 * Try to resolve a token logo from LI.FI (broad multi-chain coverage).
 * Falls back silently to empty string — caller should use TrustWallet CDN as backup.
 */
async function fetchLogoFromLiFi(
  contractAddress: string,
  chainId: number,
): Promise<string> {
  try {
    const key =
      (typeof import.meta !== "undefined"
        ? (import.meta.env.VITE_LIFI_API_KEY as string | undefined)
        : undefined) || "";
    const headers: HeadersInit = key ? { "x-lifi-api-key": key } : {};
    const res = await fetch(
      `https://li.quest/v1/token?chain=${chainId}&token=${contractAddress}`,
      { headers, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return "";
    const data = await res.json();
    return (data?.logoURI as string) || "";
  } catch {
    return "";
  }
}

/**
 * Fetch on-chain metadata for an ERC20 token.
 *
 * Logo resolution order:
 *   1. LI.FI API (most comprehensive multi-chain token list)
 *   2. TrustWallet assets CDN (known major tokens only)
 *
 * For truly unknown tokens, logoUrl will be the TrustWallet CDN URL which
 * may 404 — the TokenIcon component handles that with a symbol-based fallback.
 */
export async function fetchTokenMetadata(
  contractAddress: string,
  chainId: number,
): Promise<Omit<CustomToken, "addedAt">> {
  if (!ethers.isAddress(contractAddress)) {
    throw new Error("Invalid contract address");
  }

  const checksummed = ethers.getAddress(contractAddress);
  // getEvmRpcUrlForChain resolves custom user-added chains to their own RPC
  // (getRpcEndpoint fell back to Ethereum, so custom-network tokens failed).
  const rpcUrl = getEvmRpcUrlForChain(chainId);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(checksummed, ERC20_ABI, provider);

  const [symbol, name, decimals] = await Promise.all([
    contract.symbol() as Promise<string>,
    contract.name() as Promise<string>,
    contract.decimals() as Promise<bigint>,
  ]);

  const lifiLogo = await fetchLogoFromLiFi(checksummed, chainId);
  const logoUrl = lifiLogo || resolveTokenLogoTrustWallet(checksummed, chainId);

  return {
    contractAddress: checksummed,
    symbol,
    name,
    decimals: Number(decimals),
    logoUrl,
    chainId,
  };
}

const CHAIN_FOLDER: Record<number, string> = {
  1: "ethereum",
  56: "smartchain",
  137: "polygon",
  42161: "arbitrum",
  10: "optimism",
  8453: "base",
  43114: "avalanchec",
  11155111: "ethereum",
};

function resolveTokenLogoTrustWallet(
  contractAddress: string,
  chainId: number,
): string {
  const folder = CHAIN_FOLDER[chainId] ?? "ethereum";
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folder}/assets/${contractAddress}/logo.png`;
}
