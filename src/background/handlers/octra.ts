/**
 * LOGIC: Handles native Octra protocol JSON-RPC requests originating from connected dApps.
 * Connects with KeyringService to verify locks, enforces connection handshakes, prompts UI popup approvals for signing and sending payloads, and executes read/write smart contract calls.
 * EXPORTS:
 *   - handleGetBalance (async function)
 *   - handleSignMessage (async function)
 *   - handleSignTransaction (async function)
 *   - handleSendTransaction (async function)
 *   - handleGetEncryptedBalance (async function)
 *   - handleContractCall (async function)
 *   - handleContractView (async function)
 *   - handleGetPendingTransactions (async function)
 *   - ensureNonce (async function)
 * FUNCTIONS:
 *   - handleGetBalance(origin, params): Requires an active connection, pulls raw balance from RPC node, updates local cache, and returns detailed balance payload.
 *   - handleSignMessage(origin, params): Intercepts message signing, redirects to approval screens, and returns signatures.
 *   - handleSignTransaction(origin, params) / handleSendTransaction(origin, params): Pre-fills missing nonces, pops transaction approval modals, signs, and option-broadcasts signed TX.
 *   - handleGetEncryptedBalance(origin): Retrieves FHE private balance values from RPC using secret key.
 *   - handleContractCall(origin, params) / handleContractView(params): Executes transactions or views against registered smart contracts.
 *   - handleGetPendingTransactions(origin): Queries staged pending transactions.
 *   - ensureNonce(txParams, address): Interrogates NonceManager or local storage cache to fill missing sequence values.
 */

import { getRpcClient } from "../../services/network/RpcService";
import { nonceManager } from "../../services/core/NonceManager";
import { dappConnections } from "../store";
import { requireConnectedWallet } from "../helpers";
import { requestApproval } from "./approval";
import { keyringService } from "../../services/core/KeyringService";
import type { DappResponse, WalletInfo } from "../types";

const OCTRA_GUARD = {
  notConnectedMessage: "Not connected",
  lockedCode: -32603,
  lockedMessage: "Wallet locked. Please unlock the extension.",
};

async function guardOctraRequest(
  origin: string,
): Promise<{ wallet?: WalletInfo; error?: { code: number; message: string } }> {
  return requireConnectedWallet(dappConnections.get(origin), OCTRA_GUARD);
}

export async function handleGetBalance(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = dappConnections.get(origin);
  if (!connection?.connected)
    return { error: { code: 4100, message: "Not connected" } };
  const { address } = params;
  try {
    const client = getRpcClient();
    const data = await client.getBalanceRaw(address);
    const rawBalance = data.balanceRaw;
    const nonce = data.pendingNonce;

    const cacheData = await chrome.storage.local.get(["balances", "nonces"]);
    const balances: Record<string, string> =
      (cacheData.balances as Record<string, string>) || {};
    const nonces: Record<string, number> =
      (cacheData.nonces as Record<string, number>) || {};
    balances[address] = rawBalance;
    nonces[address] = nonce;
    await chrome.storage.local.set({ balances, nonces });
    return {
      result: {
        address,
        balance: rawBalance,
        formatted: (parseFloat(rawBalance) / 1_000_000).toFixed(6),
        nonce,
        _source: "network",
      },
    };
  } catch (_) {}

  const cacheData = await chrome.storage.local.get(["balances", "nonces"]);
  const rawBal =
    ((cacheData.balances as Record<string, string>) || {})[address] || "0";
  const cachedNonce =
    ((cacheData.nonces as Record<string, number>) || {})[address] || 0;
  return {
    result: {
      address,
      balance: rawBal,
      formatted: (parseFloat(rawBal) / 1_000_000).toFixed(6),
      nonce: cachedNonce,
      _source: "cache",
    },
  };
}

export async function handleSignMessage(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const guard = await guardOctraRequest(origin);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(origin, "signMessage", params, wallet);
    return { result: result.result };
  } catch (err: any) {
    return {
      error: {
        code: 4001,
        message: err?.message || "User rejected message signing",
      },
    };
  }
}

export async function handleSignTransaction(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const guard = await guardOctraRequest(origin);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet!;
  try {
    const txParams = { ...(params.transaction || params) };
    await ensureNonce(txParams, wallet.address);
    const approvalParams = params.transaction
      ? { ...params, transaction: txParams }
      : txParams;
    return await requestApproval(
      origin,
      "signTransaction",
      approvalParams,
      wallet,
    );
  } catch (err: any) {
    return {
      error: { code: 4001, message: err.message || "User rejected signature" },
    };
  }
}

export async function handleSendTransaction(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const guard = await guardOctraRequest(origin);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet!;
  try {
    const txParams = { ...(params.transaction || params) };
    await ensureNonce(txParams, wallet.address);
    const approvalParams = params.transaction
      ? { ...params, transaction: txParams }
      : txParams;
    return await requestApproval(
      origin,
      "sendTransaction",
      approvalParams,
      wallet,
    );
  } catch (err: any) {
    return {
      error: {
        code: 4001,
        message: err.message || "User rejected transaction",
      },
    };
  }
}

export async function handleGetEncryptedBalance(
  origin: string,
): Promise<DappResponse> {
  const guard = await guardOctraRequest(origin);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet!;
  try {
    const client = getRpcClient();
    const pk = keyringService.getPrivateKey(wallet.address) || "";
    const pubB64 =
      keyringService.getPublicKey(wallet.address) || wallet.publicKeyB64 || "";
    const data = await client.getEncryptedBalance(wallet.address, pk, pubB64);
    return { result: data };
  } catch (err: any) {
    return {
      error: {
        code: 5000,
        message: err.message || "Failed to fetch encrypted balance",
      },
    };
  }
}

export async function handleContractCall(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const guard = await guardOctraRequest(origin);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet!;
  const approvalParams = {
    contractAddress: params.address,
    method: params.method,
    params: params.params || [],
    amount: params.amount || "0",
  };
  try {
    const approved = await requestApproval(
      origin,
      "contractCall",
      approvalParams,
      wallet,
    );
    if (!approved)
      return { error: { code: 4001, message: "User rejected contract call" } };
    const client = getRpcClient();
    const result = await client.callContractMethod(
      params.address,
      params.method,
      params.params || [],
      wallet.address,
      params.amount || "0",
    );
    return { result };
  } catch (err: any) {
    return {
      error: { code: 5000, message: err.message || "Contract call failed" },
    };
  }
}

export async function handleContractView(params: any): Promise<DappResponse> {
  try {
    const client = getRpcClient();
    const result = await client.callContractView(
      params.address,
      params.method,
      params.params || [],
      params.caller || params.address,
    );
    return { result };
  } catch (err: any) {
    return {
      error: { code: 5000, message: err.message || "Contract view failed" },
    };
  }
}

export async function handleGetPendingTransactions(
  origin: string,
): Promise<DappResponse> {
  const guard = await guardOctraRequest(origin);
  if (guard.error) return { error: guard.error };
  try {
    const client = getRpcClient();
    const result = await client.getStagedTransactions();
    return { result: result || [] };
  } catch (err: any) {
    return {
      error: {
        code: 5000,
        message: err.message || "Failed to fetch pending transactions",
      },
    };
  }
}

export async function ensureNonce(
  txParams: any,
  address: string,
): Promise<void> {
  if (
    txParams.nonce !== undefined &&
    txParams.nonce !== null &&
    txParams.nonce !== ""
  )
    return;
  try {
    txParams.nonce = await nonceManager.getNext(address);
    return;
  } catch (e) {
    console.warn("[Background] Failed to fetch nonce from NonceManager:", e);
  }
  // Fallback: the cache stores the last-used nonce, so the next one is +1.
  const cached = await chrome.storage.local.get("nonces");
  const lastUsed = ((cached.nonces as Record<string, number>) || {})[address];
  if (lastUsed === undefined) {
    throw new Error(
      "Unable to determine transaction nonce. Please try again.",
    );
  }
  txParams.nonce = lastUsed + 1;
}
