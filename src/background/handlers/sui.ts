import { suiConnections } from "../store";
import {
  getWalletFromStorage,
  getWalletPublicInfo,
  getWalletByOctraAddress,
  requireConnectedWallet,
  saveSuiConnections,
} from "../helpers";
import { requestApproval } from "./approval";
import { keyringService } from "../../services/core/KeyringService";
import type { DappResponse } from "../types";

const SUI_GUARD = {
  notConnectedMessage: "Sui wallet not connected",
  lockedMessage: "Wallet locked. Please unlock.",
};

export async function handleSuiConnect(
  origin: string,
  title: string | undefined,
  favicon: string | undefined,
): Promise<DappResponse> {
  const existing = suiConnections.get(origin);
  if (existing?.connected && existing.address) {
    return {
      result: {
        address: existing.address,
        accounts: [{ address: existing.address }],
        suiPublicKey: existing.publicKey ?? null,
      },
    };
  }

  const wallet = await getWalletFromStorage();
  let approvalResult: any;
  try {
    approvalResult = await requestApproval(
      origin,
      "connect",
      { title, favicon, chain: "sui" },
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
  const address =
    keyringService.getSuiAddress(octraAddr) ||
    getWalletByOctraAddress(octraAddr)?.suiAddress ||
    (octraAddr === fresh.address ? fresh.suiAddress : null) ||
    null;
  if (!address) {
    return {
      error: {
        code: 4900,
        message: "No Sui-compatible key found in wallet.",
      },
    };
  }

  const suiPublicKey = keyringService.getSuiPublicKey(octraAddr);
  suiConnections.set(origin, {
    origin,
    address,
    connected: true,
    connectedAt: Date.now(),
    octraAddress: octraAddr,
    publicKey: suiPublicKey ?? undefined,
  });
  saveSuiConnections();

  return {
    result: { address, accounts: [{ address }], suiPublicKey },
  };
}

export async function handleSuiDisconnect(
  origin: string,
): Promise<DappResponse> {
  suiConnections.delete(origin);
  saveSuiConnections();
  return { result: true };
}

export async function handleSuiGetAccounts(
  origin: string,
): Promise<DappResponse> {
  const connection = suiConnections.get(origin);
  if (!connection?.connected) return { result: [] };
  return { result: [{ address: connection.address }] };
}

export async function handleSuiSignMessage(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = suiConnections.get(origin);
  const guard = await requireConnectedWallet(connection, SUI_GUARD);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(
      origin,
      "suiSignMessage",
      {
        message: params.message || params,
        address: connection!.address,
        chain: "sui",
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

export async function handleSuiSignTransaction(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = suiConnections.get(origin);
  const guard = await requireConnectedWallet(connection, SUI_GUARD);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(
      origin,
      "suiSignTransaction",
      {
        // inpage sends { txBlock, address } — unwrap to the raw tx bytes so
        // the signer never receives the envelope object.
        transaction: params.transaction || params.txBlock || params,
        address: connection!.address,
        chain: "sui",
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

export async function handleSuiSignAndExecuteTransaction(
  origin: string,
  params: any,
): Promise<DappResponse> {
  const connection = suiConnections.get(origin);
  const guard = await requireConnectedWallet(connection, SUI_GUARD);
  if (guard.error) return { error: guard.error };
  const wallet = guard.wallet;
  try {
    const result = await requestApproval(
      origin,
      "suiSignAndExecuteTransaction",
      {
        // inpage sends { txBlock, options, address } — unwrap the tx bytes and
        // forward options (carries the target chain, e.g. "sui:testnet").
        transaction: params.transaction || params.txBlock || params,
        options: params.options,
        address: connection!.address,
        chain: "sui",
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
