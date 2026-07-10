import {
  ShieldIcon,
  UnshieldIcon,
  PrivateTransferIcon,
  ClaimIcon,
} from "../../../shared/Icons";
import { formatUsd } from "../../../../services/network/PriceService";
import "./PrivacyDashboard.css";

interface PrivacyDashboardProps {
  totalEncryptedUsd: number;
  shieldedPercent: number;
  isRefreshing: boolean;
  isLoading: boolean;
  activeTransfersCount: number;
  onAction: (action: string) => void;
}

export function PrivacyDashboard({
  totalEncryptedUsd,
  shieldedPercent,
  isRefreshing,
  isLoading,
  activeTransfersCount,
  onAction,
}: PrivacyDashboardProps) {
  return (
    <div className="privacy-dashboard animate-slide-in">
      <div className={`privacy-main-card ${isRefreshing ? "updating" : ""}`}>
        <div className="main-card-header">
          <ShieldIcon size={20} className="main-card-icon" />
          <span className="main-card-title">Total Protected Value</span>
        </div>
        <div className="main-card-balance">
          <div className="main-balance-usd">{formatUsd(totalEncryptedUsd)}</div>
        </div>
        {shieldedPercent > 0 && (
          <div
            className="shield-progress"
            title={`${shieldedPercent}% of your funds are protected`}
          >
            <div className="shield-progress-bar">
              <div
                className="shield-progress-fill"
                style={{ width: `${shieldedPercent}%` }}
              />
            </div>
            <span className="shield-progress-text">
              {shieldedPercent}% Protected
            </span>
          </div>
        )}
      </div>

      <div className="privacy-action-grid">
        <button
          className="privacy-grid-btn"
          onClick={() => onAction("shield_list")}
          disabled={isLoading}
        >
          <div className="grid-btn-icon shield">
            <ShieldIcon size={38} />
          </div>
          <span className="grid-btn-label">Shield</span>
        </button>

        <button
          className="privacy-grid-btn"
          onClick={() => onAction("unshield_list")}
          disabled={isLoading}
        >
          <div className="grid-btn-icon unshield">
            <UnshieldIcon size={38} />
          </div>
          <span className="grid-btn-label">Unshield</span>
        </button>

        <button
          className="privacy-grid-btn"
          onClick={() => onAction("transfer_list")}
          disabled={isLoading}
        >
          <div className="grid-btn-icon transfer">
            <PrivateTransferIcon size={32} />
          </div>
          <span className="grid-btn-label">Transfer</span>
        </button>

        <button
          className="privacy-grid-btn"
          onClick={() => onAction("claim_list")}
        >
          <div className="grid-btn-icon claim">
            <ClaimIcon size={32} />
            {activeTransfersCount > 0 && (
              <span className="grid-btn-badge">{activeTransfersCount}</span>
            )}
          </div>
          <span className="grid-btn-label">Claim</span>
        </button>
      </div>
    </div>
  );
}
