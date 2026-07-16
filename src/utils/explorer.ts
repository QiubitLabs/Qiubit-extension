/**
 * Block-explorer URL builders that understand every supported address type.
 *
 * Explorer bases in NETWORK_REGISTRY are not uniform: Solscan encodes the
 * cluster as a query string ("https://solscan.io/?cluster=devnet"), Suiscan
 * encodes the network as a path segment ("https://suiscan.xyz/testnet"), and
 * EVM/Bitcoin explorers are plain origins. Naively appending "/tx/<hash>"
 * breaks the first two, so all explorer links must go through these helpers.
 */

import type { NetworkConfig } from "../constants/networks/registry";

/** The minimal slice of a network config the URL builders need. */
export type ExplorerNetwork = Pick<
  NetworkConfig,
  "addressType" | "blockExplorerUrl"
>;

const OCTRA_SCAN_MAINNET = "https://octrascan.io";
const OCTRA_SCAN_TESTNET = "https://testnet.octrascan.io";
const EVM_FALLBACK_EXPLORER = "https://etherscan.io";

function octraScanBase(octraNetwork: string): string {
  return octraNetwork === "testnet" ? OCTRA_SCAN_TESTNET : OCTRA_SCAN_MAINNET;
}

/** Split "https://solscan.io/?cluster=devnet" into a clean path + query. */
function splitBase(base: string): { path: string; query: string } {
  const queryStart = base.indexOf("?");
  if (queryStart === -1) return { path: base.replace(/\/+$/, ""), query: "" };
  return {
    path: base.slice(0, queryStart).replace(/\/+$/, ""),
    query: base.slice(queryStart),
  };
}

/** Suiscan needs an explicit network segment: /mainnet, /testnet or /devnet. */
function suiBaseWithSegment(path: string): string {
  return /\/(mainnet|testnet|devnet)$/.test(path) ? path : `${path}/mainnet`;
}

export function getExplorerTxUrl(
  cfg: ExplorerNetwork | null,
  hash: string,
  octraNetwork: string = "mainnet",
): string {
  if (!cfg || cfg.addressType === "octra")
    return `${octraScanBase(octraNetwork)}/tx.html?hash=${hash}`;

  const { path, query } = splitBase(
    cfg.blockExplorerUrl ?? EVM_FALLBACK_EXPLORER,
  );
  switch (cfg.addressType) {
    case "solana":
      return `${path}/tx/${hash}${query}`;
    case "sui":
      return `${suiBaseWithSegment(path)}/tx/${hash}`;
    default:
      // evm + bitcoin explorers share the /tx/<hash> convention
      return `${path || EVM_FALLBACK_EXPLORER}/tx/${hash}`;
  }
}

export function getExplorerAddressUrl(
  cfg: ExplorerNetwork | null,
  address: string,
  octraNetwork: string = "mainnet",
): string {
  if (!cfg || cfg.addressType === "octra")
    return `${octraScanBase(octraNetwork)}/address.html?addr=${address}`;

  const { path, query } = splitBase(
    cfg.blockExplorerUrl ?? EVM_FALLBACK_EXPLORER,
  );
  switch (cfg.addressType) {
    case "solana":
      return `${path}/account/${address}${query}`;
    case "sui":
      return `${suiBaseWithSegment(path)}/account/${address}`;
    default:
      return `${path || EVM_FALLBACK_EXPLORER}/address/${address}`;
  }
}
