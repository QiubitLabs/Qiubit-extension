/**
 * EvmTxActions — replace-by-fee actions for stuck (pending) EVM transactions.
 *
 *   speedUpEvmTx — re-broadcasts the same transaction (same nonce) with
 *                  ~15% higher fees so miners pick the replacement
 *   cancelEvmTx  — replaces the pending nonce with a 0-value self-transfer,
 *                  effectively cancelling the original
 *
 * Both fail with a clear error when the transaction has already been mined.
 */

import { ethers } from "ethers";
import { keyringService } from "../core/KeyringService";
import { resolveNetwork } from "./NetworkResolver";
import { getEvmRpcUrlForNetwork } from "../../utils/evmProvider";

// Nodes reject replacements below a 10% bump; use 15% for headroom.
const FEE_BUMP_NUM = 115n;
const FEE_BUMP_DEN = 100n;

const bump = (v: bigint): bigint => (v * FEE_BUMP_NUM) / FEE_BUMP_DEN + 1n;

interface TxActionParams {
  hash: string;
  networkId: string;
  fromAddress: string;
}

interface PendingTxInfo {
  provider: ethers.JsonRpcProvider;
  rpcUrl: string;
  tx: ethers.TransactionResponse;
  fees: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasPrice?: bigint;
  };
}

async function loadPendingTx({
  hash,
  networkId,
  fromAddress,
}: TxActionParams): Promise<PendingTxInfo> {
  const net = resolveNetwork(networkId);
  const rpcUrl = net?.rpcUrl ?? getEvmRpcUrlForNetwork(networkId);
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
    staticNetwork: true,
  });

  const tx = await provider.getTransaction(hash);
  if (!tx) {
    provider.destroy();
    throw new Error(
      "Transaction not found on the network — it may have been dropped. Check the explorer.",
    );
  }
  if (tx.blockNumber != null) {
    provider.destroy();
    throw new Error("Transaction is already confirmed — nothing to replace.");
  }
  if (tx.from.toLowerCase() !== fromAddress.toLowerCase()) {
    provider.destroy();
    throw new Error("Transaction was not sent from the active wallet.");
  }

  // Bump from the original fees; fall back to current network fees when the
  // node no longer returns them.
  const fees: PendingTxInfo["fees"] = {};
  if (tx.maxFeePerGas != null) {
    fees.maxFeePerGas = bump(tx.maxFeePerGas);
    fees.maxPriorityFeePerGas = bump(tx.maxPriorityFeePerGas ?? 1_000_000_000n);
  } else if (tx.gasPrice != null) {
    fees.gasPrice = bump(tx.gasPrice);
  } else {
    const feeData = await provider.getFeeData();
    if (feeData.maxFeePerGas != null) {
      fees.maxFeePerGas = bump(feeData.maxFeePerGas);
      fees.maxPriorityFeePerGas = bump(
        feeData.maxPriorityFeePerGas ?? 1_000_000_000n,
      );
    } else if (feeData.gasPrice != null) {
      fees.gasPrice = bump(feeData.gasPrice);
    } else {
      provider.destroy();
      throw new Error("Could not determine replacement gas fees.");
    }
  }

  return { provider, rpcUrl, tx, fees };
}

/** Re-broadcast the same transaction with higher fees. Returns the new hash. */
export async function speedUpEvmTx(params: TxActionParams): Promise<string> {
  const { provider, rpcUrl, tx, fees } = await loadPendingTx(params);
  try {
    const replacement: ethers.TransactionRequest = {
      from: params.fromAddress,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit,
      ...fees,
    };
    const res = await keyringService.signAndSendEvm(
      params.fromAddress,
      replacement,
      rpcUrl,
    );
    return res.hash;
  } finally {
    provider.destroy();
  }
}

/** Replace the pending nonce with a 0-value self-transfer. Returns new hash. */
export async function cancelEvmTx(params: TxActionParams): Promise<string> {
  const { provider, rpcUrl, tx, fees } = await loadPendingTx(params);
  try {
    const replacement: ethers.TransactionRequest = {
      from: params.fromAddress,
      to: params.fromAddress,
      value: 0n,
      nonce: tx.nonce,
      gasLimit: 21_000n,
      ...fees,
    };
    const res = await keyringService.signAndSendEvm(
      params.fromAddress,
      replacement,
      rpcUrl,
    );
    return res.hash;
  } finally {
    provider.destroy();
  }
}
