import { solanaConnections, suiConnections } from "../store";
import {
  getWalletFromStorage,
  getWalletPublicInfo,
  getWalletByOctraAddress,
  saveSolanaConnections,
  saveSuiConnections,
} from "../helpers";
import { requestApproval } from "./approval";
import { keyringService } from "../../services/core/KeyringService";
import type { DappResponse } from "../types";

interface DerivedAddresses {
  solana: string | null;
  sui: string | null;
  suiPublicKey: string | null;
}

/** Resolve the Solana + Sui addresses (and Sui pubkey) for one Octra account. */
function deriveChainAddresses(
  octraAddr: string,
  fresh: { address?: string; solanaAddress?: string | null; suiAddress?: string | null } | null,
): DerivedAddresses {
  const byAddr = getWalletByOctraAddress(octraAddr);
  const solana =
    keyringService.getSolanaAddress(octraAddr) ||
    byAddr?.solanaAddress ||
    (octraAddr === fresh?.address ? fresh?.solanaAddress ?? null : null) ||
    null;
  const sui =
    keyringService.getSuiAddress(octraAddr) ||
    byAddr?.suiAddress ||
    (octraAddr === fresh?.address ? fresh?.suiAddress ?? null : null) ||
    null;
  const suiPublicKey = sui ? keyringService.getSuiPublicKey(octraAddr) : null;
  return { solana, sui, suiPublicKey };
}

function storeSolana(origin: string, address: string, octraAddress: string): void {
  solanaConnections.set(origin, {
    origin,
    address,
    connected: true,
    connectedAt: Date.now(),
    octraAddress,
  });
  saveSolanaConnections();
}

function storeSui(
  origin: string,
  address: string,
  octraAddress: string,
  publicKey: string | null,
): void {
  suiConnections.set(origin, {
    origin,
    address,
    connected: true,
    connectedAt: Date.now(),
    octraAddress,
    publicKey: publicKey ?? undefined,
  });
  saveSuiConnections();
}

/**
 * Unified connect for the single multichain "Qiubit" wallet-standard wallet.
 * One approval grants both the Solana and Sui addresses (all derived from the
 * same key), so a Sui dApp and a Solana dApp both connect through one flow
 * without the wallet appearing twice in the registry.
 */
export async function handleMultichainConnect(
  origin: string,
  title: string | undefined,
  favicon: string | undefined,
): Promise<DappResponse> {
  const existingSol = solanaConnections.get(origin);
  const existingSui = suiConnections.get(origin);

  // Already trusted: return without a fresh approval. If only one chain was
  // connected (e.g. via a legacy single-chain path) but the account has a key
  // for the other, fill that gap silently so both chains resolve.
  if (existingSol?.connected || existingSui?.connected) {
    const octraAddr = existingSol?.octraAddress || existingSui?.octraAddress;
    if (octraAddr) {
      const d = deriveChainAddresses(octraAddr, null);
      if (d.solana && !existingSol?.connected) storeSolana(origin, d.solana, octraAddr);
      if (d.sui && !existingSui?.connected) storeSui(origin, d.sui, octraAddr, d.suiPublicKey);
      return {
        result: {
          solana: d.solana ?? existingSol?.address ?? null,
          sui: d.sui ?? existingSui?.address ?? null,
          suiPublicKey: d.suiPublicKey ?? existingSui?.publicKey ?? null,
        },
      };
    }
    // Legacy connection without a stored octraAddress — return what we have.
    return {
      result: {
        solana: existingSol?.address ?? null,
        sui: existingSui?.address ?? null,
        suiPublicKey: existingSui?.publicKey ?? null,
      },
    };
  }

  const wallet = await getWalletFromStorage();
  let approvalResult: any;
  try {
    approvalResult = await requestApproval(
      origin,
      "connect",
      { title, favicon, chain: "multichain" },
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
  const { solana, sui, suiPublicKey } = deriveChainAddresses(octraAddr, fresh);

  if (!solana && !sui) {
    return {
      error: {
        code: 4900,
        message: "No Solana or Sui key found in wallet.",
      },
    };
  }

  if (solana) storeSolana(origin, solana, octraAddr);
  if (sui) storeSui(origin, sui, octraAddr, suiPublicKey);

  return { result: { solana, sui, suiPublicKey } };
}
