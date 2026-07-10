/**
 * SuiSendService — real SUI and Sui-coin transfers without the Mysten SDK.
 *
 * The fullnode's transaction-builder RPCs (unsafe_paySui / unsafe_pay)
 * assemble the TransactionData server-side and return BCS txBytes. We sign
 * those bytes locally: blake2b-256 over the signing intent ([0,0,0] ‖ txBytes)
 * with the wallet's ed25519 key, then submit via sui_executeTransactionBlock.
 */

import nacl from "tweetnacl";
import { blake2b } from "@noble/hashes/blake2b";
import type { Token } from "../../types";

const SUI_RPC_URLS = [
  "https://fullnode.mainnet.sui.io",
  "https://sui-rpc.publicnode.com",
];

const SUI_COIN_TYPE = "0x2::sui::SUI";
/** Max gas in MIST the transaction may consume (actual usage is charged). */
const GAS_BUDGET = 20_000_000n; // 0.02 SUI

function toRawAmount(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (
    BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0")
  );
}

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown;
  for (const url of SUI_RPC_URLS) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!resp.ok) throw new Error(`Sui RPC HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error)
        throw new Error(data.error.message || "Sui RPC error");
      return data.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No Sui RPC endpoint reachable");
}

interface SuiCoin {
  coinObjectId: string;
  balance: string;
}

async function getCoins(owner: string, coinType: string): Promise<SuiCoin[]> {
  const result = await rpcCall("suix_getCoins", [owner, coinType, null, 100]);
  return (result?.data ?? []) as SuiCoin[];
}

/** Largest-first coin selection until the target amount is covered. */
function selectCoins(coins: SuiCoin[], target: bigint): string[] {
  const sorted = [...coins].sort((a, b) =>
    BigInt(b.balance) > BigInt(a.balance) ? 1 : -1,
  );
  const picked: string[] = [];
  let sum = 0n;
  for (const c of sorted) {
    picked.push(c.coinObjectId);
    sum += BigInt(c.balance);
    if (sum >= target) return picked;
  }
  throw new Error("Insufficient balance to cover the amount plus gas.");
}

function signTxBytes(txBytesB64: string, privateKeyHex: string): string {
  const seed = new Uint8Array(
    Buffer.from(privateKeyHex.replace(/^0x/i, ""), "hex"),
  );
  const keypair = nacl.sign.keyPair.fromSeed(seed);
  const txBytes = new Uint8Array(Buffer.from(txBytesB64, "base64"));

  // Signing intent for TransactionData: scope=0, version=0, app=0
  const intentMessage = new Uint8Array(3 + txBytes.length);
  intentMessage.set([0, 0, 0], 0);
  intentMessage.set(txBytes, 3);
  const digest = blake2b(intentMessage, { dkLen: 32 });
  const signature = nacl.sign.detached(digest, keypair.secretKey);

  // Serialized signature: flag(0x00 = ed25519) ‖ sig(64) ‖ pubkey(32)
  const serialized = new Uint8Array(1 + 64 + 32);
  serialized[0] = 0x00;
  serialized.set(signature, 1);
  serialized.set(keypair.publicKey, 65);
  return Buffer.from(serialized).toString("base64");
}

export async function sendSuiTransaction(params: {
  privateKeyHex: string;
  sender: string;
  recipient: string;
  amount: string;
  token: Token;
}): Promise<string> {
  const { privateKeyHex, sender, recipient, amount, token } = params;

  const isNativeSui =
    token.isNative === true ||
    !token.contractAddress ||
    token.contractAddress === "sui" ||
    token.contractAddress === SUI_COIN_TYPE;
  const coinType = isNativeSui ? SUI_COIN_TYPE : token.contractAddress!;
  const decimals = isNativeSui ? 9 : (token.decimals ?? 9);
  const rawAmount = toRawAmount(amount, decimals);

  const coins = await getCoins(sender, coinType);
  if (coins.length === 0)
    throw new Error(`No ${token.symbol} coins found for this address.`);

  let txBytes: string;
  if (isNativeSui) {
    // Selected coins must also fund gas, which unsafe_paySui draws from them
    const inputCoins = selectCoins(coins, rawAmount + GAS_BUDGET);
    const result = await rpcCall("unsafe_paySui", [
      sender,
      inputCoins,
      [recipient],
      [rawAmount.toString()],
      GAS_BUDGET.toString(),
    ]);
    txBytes = result.txBytes;
  } else {
    const inputCoins = selectCoins(coins, rawAmount);
    // Gas coin left null so the node picks a SUI coin owned by the sender
    const result = await rpcCall("unsafe_pay", [
      sender,
      inputCoins,
      [recipient],
      [rawAmount.toString()],
      null,
      GAS_BUDGET.toString(),
    ]);
    txBytes = result.txBytes;
  }

  const signature = signTxBytes(txBytes, privateKeyHex);
  const execResult = await rpcCall("sui_executeTransactionBlock", [
    txBytes,
    [signature],
    { showEffects: true },
    "WaitForLocalExecution",
  ]);

  const status = execResult?.effects?.status;
  if (status && status.status !== "success") {
    throw new Error(status.error || "Sui transaction failed on-chain.");
  }
  if (!execResult?.digest)
    throw new Error("Sui node did not return a transaction digest.");
  return execResult.digest;
}
