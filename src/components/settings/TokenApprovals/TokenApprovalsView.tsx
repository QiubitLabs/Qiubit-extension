import { useState, useEffect, useCallback } from "react";
import { ChevronLeftIcon, AlertIcon, ShieldIcon } from "../../shared/Icons";
import { useWallet } from "../../../context/WalletContext";
import { keyringService } from "../../../services/core/KeyringService";
import {
  discoverApprovals,
  revokeApproval,
  formatAllowance,
  type TokenApproval,
} from "../../../services/network/AllowanceService";
import { getEvmRpcUrlForChain } from "../../../utils/evmProvider";
import {
  NETWORK_REGISTRY,
  type NetworkConfig,
} from "../../../constants/networks/registry";
import "./TokenApprovalsView.css";

const EVM_NETWORKS: NetworkConfig[] = Object.values(NETWORK_REGISTRY).filter(
  (n) => n.isEVM && n.chainId != null,
);

interface TokenApprovalsViewProps {
  onBack: () => void;
}

function truncate(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function TokenApprovalsView({ onBack }: TokenApprovalsViewProps) {
  const { wallet } = useWallet();
  const [chainId, setChainId] = useState<number>(EVM_NETWORKS[0]?.chainId ?? 1);
  const [approvals, setApprovals] = useState<TokenApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  const owner = wallet?.evmAddress;

  const scan = useCallback(async () => {
    if (!owner) {
      setError("No EVM address on this wallet.");
      return;
    }
    setLoading(true);
    setError("");
    setApprovals([]);
    try {
      setApprovals(await discoverApprovals(owner, chainId));
    } catch (e: any) {
      setError(e.message || "Failed to scan approvals.");
    } finally {
      setLoading(false);
    }
  }, [owner, chainId]);

  useEffect(() => {
    scan();
  }, [scan]);

  const handleRevoke = async (a: TokenApproval) => {
    if (!owner) return;
    if (!keyringService.isUnlocked()) {
      setError("Wallet is locked. Please unlock and try again.");
      return;
    }
    const key = `${a.token}:${a.spender}`;
    setRevoking(key);
    setError("");
    try {
      await revokeApproval({
        owner,
        token: a.token,
        spender: a.spender,
        chainId,
        rpcUrl: getEvmRpcUrlForChain(chainId),
      });
      setApprovals((prev) =>
        prev.filter((p) => `${p.token}:${p.spender}` !== key),
      );
    } catch (e: any) {
      setError(e.message || "Revoke failed.");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <>
      <header className="wallet-header">
        <div className="flex items-center gap-md">
          <button className="header-icon-btn" onClick={onBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-lg font-semibold">Token Approvals</span>
        </div>
      </header>

      <div className="wallet-content animate-fade-in">
        <div className="ta-chain-tabs">
          {EVM_NETWORKS.map((n) => (
            <button
              key={n.chainId}
              className={`ta-chain-tab ${chainId === n.chainId ? "active" : ""}`}
              onClick={() => setChainId(n.chainId as number)}
            >
              {n.shortName}
            </button>
          ))}
        </div>

        {loading && (
          <div className="ta-status">Scanning approvals on-chain…</div>
        )}

        {error && (
          <div className="ta-error">
            <AlertIcon size={14} /> {error}
          </div>
        )}

        {!loading && !error && approvals.length === 0 && (
          <div className="ta-empty">
            <ShieldIcon size={28} />
            <span>No active token approvals on this network.</span>
          </div>
        )}

        <div className="ta-list">
          {approvals.map((a) => {
            const key = `${a.token}:${a.spender}`;
            return (
              <div className="ta-item" key={key}>
                <div className="ta-item-main">
                  <div className="ta-item-token">
                    {a.tokenSymbol}
                    {a.isUnlimited && (
                      <span className="ta-unlimited">Unlimited</span>
                    )}
                  </div>
                  <div className="ta-item-meta mono">
                    Spender {truncate(a.spender)}
                  </div>
                  <div className="ta-item-amount">
                    Allowance: {formatAllowance(a)}
                  </div>
                </div>
                <button
                  className="ta-revoke-btn"
                  disabled={revoking === key}
                  onClick={() => handleRevoke(a)}
                >
                  {revoking === key ? "Revoking…" : "Revoke"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
