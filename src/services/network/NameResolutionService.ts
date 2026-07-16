/**
 * NameResolutionService — resolves human-readable names to addresses:
 *
 *   ENS   (.eth) — via the ENS registry on Ethereum mainnet (ethers)
 *   SNS   (.sol) — Solana Name Service PDA lookup (raw RPC, no extra deps)
 *   SuiNS (.sui) — native `suix_resolveNameServiceAddress` RPC method
 *
 * All resolvers fail soft (return null) — a name that doesn't resolve is a
 * normal user-input state, not an error.
 */

import { ethers } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { getEvmRpcUrlForNetwork } from "../../utils/evmProvider";
import { getSolanaEndpoints } from "./SolanaRpcService";
import { SUI_MAINNET_RPCS } from "./SuiRpcService";

const RESOLVE_TIMEOUT_MS = 8000;

// Solana Name Service constants (see @bonfida/spl-name-service)
const SNS_NAME_PROGRAM = new PublicKey(
  "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX",
);
const SNS_SOL_TLD = new PublicKey(
  "58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx",
);
const SNS_HASH_PREFIX = "SPL Name Service";
// Name accounts store: parent(32) + owner(32) + class(32) + data
const SNS_OWNER_OFFSET = 32;

export type ResolvableChain = "evm" | "solana" | "sui";

/** Which name suffix belongs to which chain. */
const NAME_SUFFIXES: Record<ResolvableChain, string> = {
  evm: ".eth",
  solana: ".sol",
  sui: ".sui",
};

/** True when the input looks like a resolvable name for the given chain. */
export function looksLikeName(
  input: string,
  chain: ResolvableChain | null,
): boolean {
  if (!chain) return false;
  const name = input.trim().toLowerCase();
  return (
    name.length > NAME_SUFFIXES[chain].length &&
    name.endsWith(NAME_SUFFIXES[chain]) &&
    !name.includes(" ")
  );
}

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("resolve timeout")), RESOLVE_TIMEOUT_MS),
    ),
  ]);
}

async function resolveEns(name: string): Promise<string | null> {
  const provider = new ethers.JsonRpcProvider(
    getEvmRpcUrlForNetwork("ethereum"),
    undefined,
    { staticNetwork: true },
  );
  try {
    return await withTimeout(provider.resolveName(name));
  } finally {
    provider.destroy();
  }
}

async function resolveSns(name: string): Promise<string | null> {
  const bare = name.toLowerCase().replace(/\.sol$/, "");
  const input = new TextEncoder().encode(SNS_HASH_PREFIX + bare);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const hashedName = new Uint8Array(digest);

  const [nameAccount] = PublicKey.findProgramAddressSync(
    [hashedName, new Uint8Array(32), SNS_SOL_TLD.toBytes()],
    SNS_NAME_PROGRAM,
  );

  const rpcUrl = getSolanaEndpoints("mainnet")[0];
  const res = await withTimeout(
    fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [nameAccount.toBase58(), { encoding: "base64" }],
      }),
    }).then((r) => r.json()),
  );

  const b64 = res?.result?.value?.data?.[0];
  if (!b64) return null;
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  if (raw.length < SNS_OWNER_OFFSET + 32) return null;
  const owner = new PublicKey(raw.slice(SNS_OWNER_OFFSET, SNS_OWNER_OFFSET + 32));
  return owner.toBase58();
}

async function resolveSuins(name: string): Promise<string | null> {
  const res = await withTimeout(
    fetch(SUI_MAINNET_RPCS[0], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_resolveNameServiceAddress",
        params: [name.toLowerCase()],
      }),
    }).then((r) => r.json()),
  );
  return typeof res?.result === "string" ? res.result : null;
}

/**
 * Resolve a name to an address for the given chain.
 * Returns null when the name doesn't exist or resolution fails.
 */
export async function resolveRecipientName(
  input: string,
  chain: ResolvableChain,
): Promise<string | null> {
  const name = input.trim().toLowerCase();
  if (!looksLikeName(name, chain)) return null;
  try {
    switch (chain) {
      case "evm":
        return await resolveEns(name);
      case "solana":
        return await resolveSns(name);
      case "sui":
        return await resolveSuins(name);
    }
  } catch {
    return null;
  }
}
