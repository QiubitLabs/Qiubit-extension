/**
 * WalletSwitchMigrationModal
 *
 * Bottom-sheet shown after the user switches the active wallet while the site
 * they're viewing is connected — but to a wallet that is NOT yet authorized
 * for that origin (EIP-2255 per-site permission model, as OKX/MetaMask do it).
 * It asks to grant/connect the new wallet to that site. Confirming authorizes
 * it and emits `accountsChanged` for that origin (background `migrateConnections`
 * action); declining leaves the site on its current account. When the new
 * wallet is already authorized the switch happens silently with no prompt.
 */

import { useState } from "react";
import { GlobeIcon, WalletIcon, ChevronRightIcon } from "../../../shared/Icons";
import "./WalletSwitchMigrationModal.css";

export interface MigrationConnection {
  origin: string;
  title?: string;
  favicon?: string;
}

interface WalletSwitchMigrationModalProps {
  isOpen: boolean;
  targetWalletName: string;
  connections: MigrationConnection[];
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

function originHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin.replace(/^https?:\/\//, "");
  }
}

export function WalletSwitchMigrationModal({
  isOpen,
  targetWalletName,
  connections,
  onConfirm,
  onCancel,
}: WalletSwitchMigrationModalProps) {
  const [isMigrating, setIsMigrating] = useState(false);

  if (!isOpen || connections.length === 0) return null;

  const handleConfirm = async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    try {
      await onConfirm();
    } finally {
      setIsMigrating(false);
    }
  };

  const count = connections.length;

  return (
    <div className="wsm-overlay" onClick={isMigrating ? undefined : onCancel}>
      <div className="wsm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="wsm-grabber" />

        <div className="wsm-icon-row">
          <div className="wsm-badge">
            <GlobeIcon size={22} />
          </div>
          <ChevronRightIcon size={18} className="wsm-arrow" />
          <div className="wsm-badge">
            <WalletIcon size={22} />
          </div>
        </div>

        <h3 className="wsm-title">Connect this wallet?</h3>
        <p className="wsm-subtitle">
          {count === 1 ? "This site isn't" : `These ${count} sites aren't`}{" "}
          connected to{" "}
          <span className="wsm-target">{targetWalletName}</span> yet. Connect{" "}
          {count === 1 ? "it" : "them"} so the site uses this wallet?
        </p>

        <div className="wsm-list">
          {connections.map((c) => (
            <div className="wsm-item" key={c.origin}>
              {c.favicon ? (
                <img
                  className="wsm-favicon"
                  src={c.favicon}
                  alt=""
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="wsm-favicon-fallback">
                  <GlobeIcon size={16} />
                </div>
              )}
              <div className="wsm-item-info">
                <span className="wsm-item-title">
                  {c.title || originHost(c.origin)}
                </span>
                <span className="wsm-item-origin">{originHost(c.origin)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="wsm-footer">
          <button
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={isMigrating}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={isMigrating}
          >
            {isMigrating ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default WalletSwitchMigrationModal;
