/**
 * LOGIC: Defines configuration constants for the Octra network including chain ID, Mainnet/Testnet RPC node endpoints, and explorer URLs.
 * Also provides an explorer URL helper for linking transactions and addresses.
 * EXPORTS:
 *   - OCTRA_CHAIN_ID (const number)
 *   - OCTRA_RPC (const object detailing Mainnet and Testnet metadata)
 *   - getOctraExplorerUrl (function)
 * FUNCTIONS:
 *   - getOctraExplorerUrl(type, value, network): Generates the scan explorer URL for the transaction or address on the selected network tier.
 */

export const OCTRA_CHAIN_ID = 9048201;

export const OCTRA_RPC = {
  MAINNET: {
    id: "mainnet" as const,
    name: "Octra Mainnet",
    rpcUrl: import.meta.env.VITE_RPC_URL || "https://octra.network",
    explorer: "https://octrascan.io",
    chainId: OCTRA_CHAIN_ID,
  },
  TESTNET: {
    id: "testnet" as const,
    name: "Octra Testnet",
    rpcUrl: import.meta.env.VITE_TESTNET_RPC_URL || "",
    explorer: "https://testnet.octrascan.io",
    chainId: OCTRA_CHAIN_ID,
  },
};

export function getOctraExplorerUrl(
  type: "tx" | "address",
  value: string,
  network: "mainnet" | "testnet" = "mainnet",
): string {
  const base =
    network === "mainnet"
      ? OCTRA_RPC.MAINNET.explorer
      : OCTRA_RPC.TESTNET.explorer;
  if (type === "tx") return `${base}/tx.html?hash=${value}`;
  return `${base}/address.html?addr=${value}`;
}
