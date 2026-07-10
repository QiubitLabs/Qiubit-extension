/**
 * SwapInfoService — best-effort "You pay / You receive" summary for
 * swap/bridge transactions shown in the dApp approval popup.
 *
 * Only renders information it can decode reliably:
 *   1. Fully-decoded calldata (verified ABI) with recognizable arg names.
 *   2. Known LiFi-style signatures decoded positionally via ethers.
 * Anything else returns null and the popup falls back to the generic view.
 */

import { Contract, Interface, JsonRpcProvider, formatUnits } from "ethers";
import { getPrimaryRpc } from "../../config/rpcEndpoints";
import { resolveNetworkByChainId } from "./NetworkResolver";
import { getTokenPrice, getTokenPriceByContract } from "./PriceService";
import type { DecodedTx } from "./TxDecoder";

export interface SwapSummary {
  fromSymbol: string;
  fromAmount: string;
  fromUsd: number | null;
  /** Contract address of the token being sold (native placeholder for gas coin). */
  fromToken: string;
  toSymbol: string;
  /** Minimum amount the user is guaranteed to receive (slippage floor). */
  minReceived: string | null;
  toUsd: number | null;
  /** Contract address of the token being bought. */
  toToken: string;
  /** Source network name. */
  fromChainName: string | null;
  /** Destination network name (differs from source only for bridges). */
  toChainName: string | null;
  /** Destination chainId when the call is a bridge, else null. */
  toChainId: number | null;
  /** Whether fromToken / toToken are the chain's native coin. */
  fromIsNative: boolean;
  toIsNative: boolean;
  /** Address that receives the output, when it differs from the sender. */
  receiver: string | null;
}

const NATIVE_PLACEHOLDERS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

const ERC20_META_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

interface TokenMeta {
  symbol: string;
  decimals: number;
  isNative: boolean;
  address: string;
}

async function getTokenMeta(
  address: string,
  chainId: number,
): Promise<TokenMeta | null> {
  const net = resolveNetworkByChainId(chainId);
  if (NATIVE_PLACEHOLDERS.has(address.toLowerCase())) {
    return {
      symbol: net?.nativeToken?.symbol ?? "ETH",
      decimals: 18,
      isNative: true,
      address,
    };
  }
  try {
    const rpc = getPrimaryRpc(chainId);
    if (!rpc) return null;
    const provider = new JsonRpcProvider(rpc, chainId, { staticNetwork: true });
    const c = new Contract(address, ERC20_META_ABI, provider);
    const [symbol, decimals] = await Promise.all([
      c.symbol() as Promise<string>,
      c.decimals().catch(() => 18n) as Promise<bigint | number>,
    ]);
    return { symbol, decimals: Number(decimals), isNative: false, address };
  } catch {
    return null;
  }
}

async function getUsd(
  meta: TokenMeta,
  amount: string,
): Promise<number | null> {
  try {
    const price = meta.isNative
      ? await getTokenPrice(meta.symbol)
      : (await getTokenPrice(meta.symbol)) ??
        (await getTokenPriceByContract(meta.address));
    if (!price?.price) return null;
    return parseFloat(amount) * price.price;
  } catch {
    return null;
  }
}

interface RawSwapFields {
  sendingAssetId: string;
  receivingAssetId: string;
  fromAmountRaw: bigint;
  minReceivedRaw: bigint | null;
  destinationChainId: number | null;
  receiver: string | null;
}

/** LiFi GenericSwapFacetV3 single-swap entry points (Jumper same-chain swaps). */
const LIFI_SINGLE_V3 = /^swapTokensSingleV3(Native|ERC20)To(Native|ERC20)$/;

function extractFromLifiSignature(
  decoded: DecodedTx,
  calldata: string,
): RawSwapFields | null {
  if (!decoded.signature || !LIFI_SINGLE_V3.test(decoded.method)) return null;
  try {
    const iface = new Interface([`function ${decoded.signature}`]);
    const parsed = iface.parseTransaction({ data: calldata });
    if (!parsed) return null;
    // (bytes32 txId, string integrator, string referrer, address receiver,
    //  uint256 minAmountOut, (callTo, approveTo, sendingAssetId,
    //  receivingAssetId, fromAmount, callData, requiresDeposit))
    const receiver = String(parsed.args[3]);
    const minAmountOut = parsed.args[4] as bigint;
    const swapData = parsed.args[5];
    return {
      sendingAssetId: String(swapData[2]),
      receivingAssetId: String(swapData[3]),
      fromAmountRaw: BigInt(swapData[4]),
      minReceivedRaw: minAmountOut,
      destinationChainId: null,
      receiver,
    };
  } catch {
    return null;
  }
}

function pickArg(
  args: Record<string, string>,
  names: string[],
): string | null {
  for (const n of names) {
    if (args[n] !== undefined && args[n] !== "") return args[n];
  }
  return null;
}

function extractFromNamedArgs(decoded: DecodedTx): RawSwapFields | null {
  if (!decoded.fullyDecoded) return null;
  const args = decoded.args;
  const sending = pickArg(args, ["sendingAssetId", "fromToken", "tokenIn"]);
  const receiving = pickArg(args, ["receivingAssetId", "toToken", "tokenOut"]);
  const fromAmount = pickArg(args, ["fromAmount", "amountIn", "amount"]);
  if (!sending || !receiving || !fromAmount) return null;
  const minOut = pickArg(args, [
    "minAmountOut",
    "minAmount",
    "amountOutMin",
    "minReceived",
  ]);
  const destChain = pickArg(args, [
    "destinationChainId",
    "toChainId",
    "dstChainId",
  ]);
  const receiver = pickArg(args, ["receiver", "recipient", "to", "toAddress"]);
  try {
    return {
      sendingAssetId: sending,
      receivingAssetId: receiving,
      fromAmountRaw: BigInt(fromAmount),
      minReceivedRaw: minOut ? BigInt(minOut) : null,
      destinationChainId: destChain ? Number(destChain) : null,
      receiver: receiver || null,
    };
  } catch {
    return null;
  }
}

export async function buildSwapSummary(
  decoded: DecodedTx,
  calldata: string,
  chainId: number,
): Promise<SwapSummary | null> {
  if (!/swap|bridge/i.test(decoded.method)) return null;

  const raw =
    extractFromNamedArgs(decoded) ??
    extractFromLifiSignature(decoded, calldata);
  if (!raw) return null;

  const [fromMeta, toMeta] = await Promise.all([
    getTokenMeta(raw.sendingAssetId, chainId),
    getTokenMeta(raw.receivingAssetId, raw.destinationChainId ?? chainId),
  ]);
  if (!fromMeta || !toMeta) return null;

  const fromAmount = formatUnits(raw.fromAmountRaw, fromMeta.decimals);
  const minReceived =
    raw.minReceivedRaw !== null
      ? formatUnits(raw.minReceivedRaw, toMeta.decimals)
      : null;

  const [fromUsd, toUsd] = await Promise.all([
    getUsd(fromMeta, fromAmount),
    minReceived ? getUsd(toMeta, minReceived) : Promise.resolve(null),
  ]);

  const srcNet = resolveNetworkByChainId(chainId);
  const destNet =
    raw.destinationChainId !== null
      ? resolveNetworkByChainId(raw.destinationChainId)
      : null;

  return {
    fromSymbol: fromMeta.symbol,
    fromAmount,
    fromUsd,
    fromToken: fromMeta.address,
    toSymbol: toMeta.symbol,
    minReceived,
    toUsd,
    toToken: toMeta.address,
    fromChainName: srcNet?.displayName ?? null,
    toChainName: destNet?.displayName ?? null,
    toChainId: raw.destinationChainId,
    fromIsNative: fromMeta.isNative,
    toIsNative: toMeta.isNative,
    receiver: raw.receiver,
  };
}
