import { suiRpc } from "../SuiRpcService";

export const SUI_CHAIN_ID = 9270000000000000;

export async function fetchSuiBalance(address: string): Promise<string> {
  return suiRpc.getBalance(address);
}

export function buildSuiToken(address: string, balance = "0") {
  return {
    symbol: "SUI",
    name: "Sui",
    balance,
    vm: "sui" as const,
    isNative: false,
    isSui: true,
    chainId: SUI_CHAIN_ID,
    logoUrl: "/chains/sui/sui.png",
    decimals: 9,
    contractAddress: "sui",
    ownerAddress: address,
  };
}
