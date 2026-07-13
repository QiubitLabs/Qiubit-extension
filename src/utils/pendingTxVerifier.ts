/**
 * pendingTxVerifier — flips locally-recorded "pending" transactions to
 * confirmed/failed by checking each hash on its own chain.
 *
 * Local-only history records every user action (send/swap/dApp tx) as
 * "pending"; nothing else re-reads the chain, so without this pass a landed
 * transaction stays "Pending" forever. Works for all chains: Octra, EVM
 * (built-in + custom), Solana (mainnet/devnet/testnet), Sui (mainnet/testnet),
 * Bitcoin. Cost: one targeted RPC per pending hash — nothing else.
 */

import { resolveNetwork } from "../services/network/NetworkResolver";
import {
  SUI_MAINNET_RPCS,
  SUI_TESTNET_RPCS,
} from "../services/network/SuiRpcService";
import { getSolanaEndpoints } from "../services/network/SolanaRpcService";
import { getRpcList } from "../config/rpcEndpoints";
import {
  saveTxHistorySecure,
  saveEvmTxHistory,
} from "./storage";

type PendingTx = {
  hash: string;
  status?: string;
  networkId?: string;
  network?: string;
  [key: string]: any;
};

type TxOutcome = "confirmed" | "failed" | null;

async function rpcPost(url: string, body: unknown): Promise<any | null> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function checkSui(hash: string, urls: string[]): Promise<TxOutcome> {
  for (const url of urls) {
    const data = await rpcPost(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "sui_getTransactionBlock",
      params: [hash, { showEffects: true }],
    });
    const status = data?.result?.effects?.status?.status;
    if (status === "success") return "confirmed";
    if (status === "failure") return "failed";
    // "not found" errors mean still indexing — try next endpoint / stay pending
    if (data?.result) return null;
  }
  return null;
}

async function checkSolana(hash: string, urls: string[]): Promise<TxOutcome> {
  for (const url of urls) {
    const data = await rpcPost(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignatureStatuses",
      params: [[hash], { searchTransactionHistory: true }],
    });
    const st = data?.result?.value?.[0];
    if (!st) continue;
    if (st.err) return "failed";
    if (
      st.confirmationStatus === "confirmed" ||
      st.confirmationStatus === "finalized"
    )
      return "confirmed";
    return null; // processed but not yet confirmed
  }
  return null;
}

async function checkEvm(hash: string, chainId: number): Promise<TxOutcome> {
  const urls = getRpcList(chainId);
  const custom = resolveNetwork(`user_${chainId}`)?.rpcUrl;
  if (custom && !urls.includes(custom)) urls.push(custom);
  for (const url of urls) {
    const data = await rpcPost(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionReceipt",
      params: [hash],
    });
    const receipt = data?.result;
    if (receipt?.status === "0x1") return "confirmed";
    if (receipt?.status === "0x0") return "failed";
    if (data && receipt === null) return null; // known-not-mined yet
  }
  return null;
}

async function checkBitcoin(hash: string): Promise<TxOutcome> {
  try {
    const resp = await fetch(`https://mempool.space/api/tx/${hash}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.status?.confirmed === true) return "confirmed";
    return null;
  } catch {
    return null;
  }
}

async function checkOctra(hash: string): Promise<TxOutcome> {
  try {
    const { getRpcClient } = await import("../services/network/RpcService");
    const txData = await getRpcClient().getTransaction(hash);
    if (txData?.status === "confirmed") return "confirmed";
    if (txData?.status === "failed") return "failed";
    return null;
  } catch {
    return null;
  }
}

function outcomeFor(tx: PendingTx): Promise<TxOutcome> {
  const netId = tx.networkId || tx.network || "";
  if (netId.startsWith("sui"))
    return checkSui(
      tx.hash,
      netId === "sui-testnet" ? SUI_TESTNET_RPCS : SUI_MAINNET_RPCS,
    );
  if (netId.startsWith("solana")) {
    const cluster =
      netId === "solana-devnet"
        ? "devnet"
        : netId === "solana-testnet"
          ? "testnet"
          : "mainnet";
    return checkSolana(tx.hash, getSolanaEndpoints(cluster));
  }
  if (netId === "bitcoin") return checkBitcoin(tx.hash);
  if (netId === "octra" || netId === "mainnet" || netId === "")
    return checkOctra(tx.hash);
  // EVM: built-in id ("polygon"), custom id ("user_4441") — both resolve.
  const config = resolveNetwork(netId);
  if (config?.isEVM && config.chainId) return checkEvm(tx.hash, config.chainId);
  return Promise.resolve(null);
}

/**
 * Check every pending tx once and persist confirmed/failed flips into the
 * store it was recorded in. Returns true when at least one status changed
 * (the caller's storage poll then repaints the list).
 */
export async function verifyPendingTransactions(
  pending: PendingTx[],
  octraAddress: string,
  evmAddress?: string | null,
): Promise<boolean> {
  let changed = false;
  await Promise.allSettled(
    pending.map(async (tx) => {
      if (!tx.hash || tx.status !== "pending") return;
      const outcome = await outcomeFor(tx);
      if (!outcome) return;
      changed = true;
      const netId = tx.networkId || tx.network || "";
      const config = resolveNetwork(netId);
      if (config?.isEVM && evmAddress) {
        await saveEvmTxHistory(netId, evmAddress, [
          { ...tx, status: outcome } as any,
        ]).catch(() => {});
      } else {
        const storeNetwork = tx.network || tx.networkId || "mainnet";
        await saveTxHistorySecure(
          [{ ...tx, status: outcome }],
          storeNetwork,
          octraAddress,
        );
      }
    }),
  );
  return changed;
}
