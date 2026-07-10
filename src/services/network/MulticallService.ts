/**
 * MulticallService — batch many ERC-20 balanceOf reads (plus native balance)
 * into a single eth_call via Multicall3, instead of one RPC call per token.
 *
 * Multicall3 is deployed at the same address on every major EVM chain:
 *   0xcA11bde05977b3631167028862bE2a173976CA11
 */

import { ethers } from "ethers";

export const MULTICALL3_ADDRESS =
  "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256)",
];

const ERC20_BALANCE_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

export interface TokenRef {
  contractAddress: string;
  decimals: number;
}

export interface MulticallBalances {
  /** Native balance as a human string (e.g. "1.23"), or null on failure. */
  native: string | null;
  /** contractAddress (lowercase) → human balance string. */
  tokens: Record<string, string>;
}

/**
 * One eth_call returns the native balance + every token's balanceOf.
 * Falls back gracefully: any per-token failure yields "0" for that token.
 */
export async function fetchBalancesMulticall(
  provider: ethers.JsonRpcProvider,
  owner: string,
  tokens: TokenRef[],
): Promise<MulticallBalances> {
  const multicall = new ethers.Contract(
    MULTICALL3_ADDRESS,
    MULTICALL3_ABI,
    provider,
  );
  const erc20 = new ethers.Interface(ERC20_BALANCE_ABI);

  // Call 0 = native balance; calls 1..N = each token's balanceOf(owner)
  const calls = [
    {
      target: MULTICALL3_ADDRESS,
      allowFailure: true,
      callData: multicall.interface.encodeFunctionData("getEthBalance", [
        owner,
      ]),
    },
    ...tokens.map((t) => ({
      target: t.contractAddress,
      allowFailure: true,
      callData: erc20.encodeFunctionData("balanceOf", [owner]),
    })),
  ];

  const results: Array<{ success: boolean; returnData: string }> =
    await multicall.aggregate3.staticCall(calls);

  const out: MulticallBalances = { native: null, tokens: {} };

  const nativeRes = results[0];
  if (nativeRes?.success) {
    try {
      const wei = multicall.interface.decodeFunctionResult(
        "getEthBalance",
        nativeRes.returnData,
      )[0] as bigint;
      out.native = ethers.formatEther(wei);
    } catch {
      /* leave null */
    }
  }

  tokens.forEach((t, i) => {
    const res = results[i + 1];
    const key = t.contractAddress.toLowerCase();
    if (res?.success && res.returnData && res.returnData !== "0x") {
      try {
        const raw = erc20.decodeFunctionResult(
          "balanceOf",
          res.returnData,
        )[0] as bigint;
        out.tokens[key] = ethers.formatUnits(raw, t.decimals);
      } catch {
        out.tokens[key] = "0";
      }
    } else {
      out.tokens[key] = "0";
    }
  });

  return out;
}
