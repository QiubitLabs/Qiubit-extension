import { solanaConnections } from "../store";
import {
  getWalletFromStorage,
  getWalletPublicInfo,
  getWalletByOctraAddress,
  requireConnectedWallet,
  saveSolanaConnections,
} from "../helpers";
import { requestApproval } from "./approval";
import { keyringService } from "../../services/core/KeyringService";
import type { DappResponse } from "../types";

const SOLANA_GUARD = {
  notConnectedMessage: "Solana wallet not connected",
  lockedMessage: "Wallet locked. Please unlock.",
};

export async function handleSolanaConnect(
  origin: string,
  title: string | undefined,
  favicon: string | undefined,
): Promise<DappResponse> {
  const existing = solanaConnections.get(origin);
  if (existing?.connected && existing.address) {
    return { result: { publicKey: existing.address } };
  }

  const wallet = await getWalletFromStorage();
  let approvalResult: any;
  try {
    approvalResult = await requestApproval(
      origin,
      "connect",
      { title, favicon, chain: "solana" },
      wallet,
    );
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected connection",
      },
    };
  }

  const selectedOctraAddr = approvalResult?.selectedOctraAddress;
  const fresh = (await getWalletFromStorage()) || (await getWalletPublicInfo());
  if (!fresh?.address) {
    return {
      error: {
        code: 4900,
        message: "Wallet session expired. Please unlock and try again.",
      },
    };
  }

  const octraAddr = selectedOctraAddr || fresh.address;
  const publicKey =
    keyringService.getSolanaAddress(octraAddr) ||
    getWalletByOctraAddress(octraAddr)?.solanaAddress ||
    (octraAddr === fresh.address ? fresh.solanaAddress : null) ||
    null;
  if (!publicKey) {
    return {
      error: {
        code: 4900,
        message: "No Solana-compatible key found in wallet.",
      },
    };
  }

  solanaConnections.set(origin, {
    origin,
    address: publicKey,
    connected: true,
    connectedAt: Date.now(),
    octraAddress: octraAddr,
  });
  saveSolanaConnections();

  return { result: { publicKey } };
}

export async function handleSolanaDisconnect(
  origin: string,
): Promise<DappResponse> {
  solanaConnections.delete(origin);
  saveSolanaConnections();
  return { result: true };
}

export async function handleSolanaGetAccount(
  origin: string,
): Promise<DappResponse> {
  const connection = solanaConnections.get(origin);
  if (!connection?.connected) return { result: null };
  return { result: { publicKey: connection.address } };
}

export async function handleSolanaSignMessage(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = solanaConnections.get(origin);
  const guard = await requireConnectedWallet(connection, SOLANA_GUARD);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(
      origin,
      "solanaSignMessage",
      {
        message: params.message || params,
        publicKey: connection!.address,
        chain: "solana",
      },
      wallet,
    );
    return { result: result.result };
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected sign request",
      },
    };
  }
}

export async function handleSolanaSignTransaction(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = solanaConnections.get(origin);
  const guard = await requireConnectedWallet(connection, SOLANA_GUARD);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(
      origin,
      "solanaSignTransaction",
      {
        transaction: params.transaction || params,
        publicKey: connection!.address,
        chain: "solana",
      },
      wallet,
    );
    return { result: result.result };
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected transaction",
      },
    };
  }
}

export async function handleSolanaSignAllTransactions(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = solanaConnections.get(origin);
  const guard = await requireConnectedWallet(connection, SOLANA_GUARD);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(
      origin,
      "solanaSignAllTransactions",
      {
        transactions: params.transactions || params,
        publicKey: connection!.address,
        chain: "solana",
      },
      wallet,
    );
    return { result: result.result };
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected transactions",
      },
    };
  }
}

export async function handleSolanaSendTransaction(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = solanaConnections.get(origin);
  const guard = await requireConnectedWallet(connection, SOLANA_GUARD);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(
      origin,
      "solanaSendTransaction",
      {
        transaction: params.transaction || params,
        publicKey: connection!.address,
        chain: "solana",
      },
      wallet,
    );
    return { result: result.result };
  } catch (err: any) {
    return {
      error: {
        code: err.code || 4001,
        message: err.message || "User rejected send",
      },
    };
  }
}
