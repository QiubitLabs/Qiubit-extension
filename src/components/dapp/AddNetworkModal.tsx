/**
 * AddNetworkModal — displayed when a dApp calls wallet_addEthereumChain.
 * Shows the network details for user review before adding to the wallet.
 */

import type { EIP3085Network } from "../../services/network/UserNetworkService";
import { getChainlistEntry } from "../../services/network/ChainlistService";

interface AddNetworkModalProps {
  network: EIP3085Network;
  origin: string;
  onAdd: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function AddNetworkModal({
  network,
  origin,
  onAdd,
  onCancel,
  isLoading,
}: AddNetworkModalProps) {
  const chainIdDecimal = parseInt(network.chainId, 16);
  const explorerUrl = network.blockExplorerUrls?.[0];
  const known = getChainlistEntry(chainIdDecimal);
  const symbolMismatch =
    known &&
    known.nativeCurrency.symbol.toUpperCase() !==
      network.nativeCurrency.symbol.trim().toUpperCase();

  return (
    <div className="add-network-modal">
      <div className="add-network-header">
        <div className="add-network-site-icon">
          {network.iconUrls?.[0] ? (
            <img
              src={network.iconUrls[0]}
              alt={network.chainName}
              width={40}
              height={40}
            />
          ) : (
            <div className="add-network-placeholder-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <ellipse
                  cx="12"
                  cy="12"
                  rx="4.5"
                  ry="9.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <line
                  x1="2.5"
                  y1="12"
                  x2="21.5"
                  y2="12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          )}
        </div>
        <h2 className="add-network-title">Add Network</h2>
        <p className="add-network-origin">{origin} wants to add a network</p>
      </div>

      <div className="add-network-body">
        <div className="add-network-field">
          <span className="add-network-label">Network Name</span>
          <span className="add-network-value">{network.chainName}</span>
        </div>
        <div className="add-network-field">
          <span className="add-network-label">Chain ID</span>
          <span className="add-network-value">
            {chainIdDecimal} ({network.chainId})
          </span>
        </div>
        <div className="add-network-field">
          <span className="add-network-label">Currency</span>
          <span className="add-network-value">
            {network.nativeCurrency.symbol} · {network.nativeCurrency.name}
          </span>
        </div>
        <div className="add-network-field">
          <span className="add-network-label">RPC URL</span>
          <span className="add-network-value add-network-mono">
            {network.rpcUrls[0]}
          </span>
        </div>
        {explorerUrl && (
          <div className="add-network-field">
            <span className="add-network-label">Explorer</span>
            <span className="add-network-value add-network-mono">
              {explorerUrl}
            </span>
          </div>
        )}

        {known && !symbolMismatch && (
          <div className="add-network-field">
            <span className="add-network-label">Chainlist</span>
            <span className="add-network-value">
              ✓ Matches public chainlist ({known.name})
            </span>
          </div>
        )}

        {symbolMismatch && (
          <div className="add-network-warning">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              Public chainlist lists chain {chainIdDecimal} as {known!.name}{" "}
              with currency {known!.nativeCurrency.symbol}, but this site
              claims {network.nativeCurrency.symbol}. Double-check before
              adding.
            </span>
          </div>
        )}

        <div className="add-network-warning">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            Only add networks from sources you trust. A malicious network can
            monitor and manipulate your transactions.
          </span>
        </div>
      </div>

      <div className="add-network-footer">
        <button
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={isLoading}
        >
          Reject
        </button>
        <button
          className="btn btn-primary"
          onClick={onAdd}
          disabled={isLoading}
        >
          {isLoading ? <span className="loading-spinner" /> : "Add Network"}
        </button>
      </div>
    </div>
  );
}
