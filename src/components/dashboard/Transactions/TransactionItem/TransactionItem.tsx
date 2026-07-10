import { formatHistoryAmount, truncateAddress } from "../../../../utils/crypto";
import { formatDate } from "../../../../utils/date";
import {
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  ShieldIcon,
  UnshieldIcon,
  PrivateTransferIcon,
  ClaimIcon,
  SwapIcon,
} from "../../../../components/shared/Icons";
import "./TransactionItem.css";

import { Transaction } from "../../../../types";

interface TransactionItemProps {
  tx: Transaction;
  onClick?: () => void;
}

export function TransactionItem({ tx, onClick }: TransactionItemProps) {
  const isIncoming =
    tx.type === "in" || tx.type === "claim" || tx.type === "unshield";

  const displayAddress = truncateAddress(tx.address, 4, 4);
  // Swaps have no counterparty address — describe the route instead.
  const addressSubtitle =
    tx.type === "swap"
      ? tx.fromTokenSymbol && tx.toTokenSymbol
        ? `${tx.fromTokenSymbol} → ${tx.toTokenSymbol}`
        : "Swap"
      : isIncoming
        ? `From ${displayAddress}`
        : `To ${displayAddress}`;

  let Icon = isIncoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  let iconClass = isIncoming ? "incoming" : "outgoing";
  let title = isIncoming ? "Received" : "Sent";

  switch (tx.type) {
    case "shield":
      Icon = ShieldIcon;
      iconClass = "shield";
      title = "Shielded";
      break;
    case "unshield":
      Icon = UnshieldIcon;
      iconClass = "unshield";
      title = "Unshielded";
      break;
    case "private":
      Icon = PrivateTransferIcon;
      iconClass = "private";
      title = "Private Transfer";
      break;
    case "claim":
      Icon = ClaimIcon;
      iconClass = "claim";
      title = "Claimed";
      break;
    case "swap":
      Icon = SwapIcon;
      iconClass = "swap";
      title = "Swapped";
      break;
    case "in":
      title = "Received";
      break;
    case "out":
      title = "Sent";
      break;
  }

  const isPending = tx.status === "pending";

  return (
    <div className={`tx-item ${isPending ? "pending" : ""}`} onClick={onClick}>
      <div className="tx-item-main">
        <div className={`tx-item-icon ${iconClass}`}>
          <Icon size={16} />
        </div>
        <div className="tx-item-info">
          <div className="flex items-center gap-xs">
            <span className="tx-item-title">{title}</span>
            {isPending && <span className="tx-pending-badge">Pending</span>}
            {/* Finality Badge (from RPC update) */}
            {!isPending &&
              tx.finality &&
              tx.finality !== "confirmed" &&
              tx.finality !== "unknown" && (
                <span className={`tx-finality-badge ${tx.finality}`}>
                  {tx.finality}
                </span>
              )}
          </div>
          {/* Address subtitle: To/From address */}
          <span className="tx-item-subtitle">{addressSubtitle}</span>
        </div>
      </div>
      <div className="tx-item-side">
        <div className={`tx-item-amount ${iconClass}`}>
          {tx.type === "swap" && tx.fromTokenSymbol && tx.toTokenSymbol ? (
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              -{formatHistoryAmount(Number(tx.fromAmount || tx.amount))}{" "}
              {tx.fromTokenSymbol} → +{formatHistoryAmount(Number(tx.toAmount))}{" "}
              {tx.toTokenSymbol}
            </span>
          ) : (
            `${isIncoming ? "+" : "-"}${formatHistoryAmount(Number(tx.amount))} ${tx.token || "OCT"}`
          )}
        </div>
        <span className="tx-item-time">
          {formatDate(tx.timestamp, {
            hour: "2-digit",
            minute: "2-digit",
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>
    </div>
  );
}
