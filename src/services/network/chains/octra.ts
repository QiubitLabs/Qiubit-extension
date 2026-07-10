import { OCTRA_CHAIN_ID } from "../../../utils/octra/rpc";
import { WOCT_ADDR } from "../../../utils/octra/bridge";

export { OCTRA_CHAIN_ID };

export function buildOctraToken(ownerAddress: string, balance = "0") {
  return {
    symbol: "OCT",
    name: "Octra",
    balance,
    vm: "octra" as const,
    isNative: true,
    chainId: OCTRA_CHAIN_ID,
    decimals: 6,
    ownerAddress,
  };
}

export function buildWoctToken(ownerAddress: string, balance = "0") {
  return {
    symbol: "wOCT",
    name: "Wrapped Octra",
    balance,
    vm: "evm" as const,
    isNative: false,
    isEVM: true,
    chainId: 1,
    logoUrl: "/qiubit-icon.svg",
    decimals: 6,
    contractAddress: WOCT_ADDR,
    ownerAddress,
  };
}
