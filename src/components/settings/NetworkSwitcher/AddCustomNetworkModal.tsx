/**
 * AddCustomNetworkModal — manually add a custom network of any VM
 * (EVM / Solana-VM / Sui-VM). EVM needs a chainId; SVM/Sui get a synthetic id.
 * Persists via addCustomNetwork; the new network then appears in the switcher
 * with its native token shown on Home and balances fetched from its RPC.
 */

import { useState } from "react";
import { CloseIcon } from "../../shared/Icons";
import {
  addCustomNetwork,
  type NetworkVm,
} from "../../../services/network/UserNetworkService";
import {
  getChainlistEntry,
  getCleanRpcUrls,
  getPrimaryExplorer,
} from "../../../services/network/ChainlistService";

interface AddCustomNetworkModalProps {
  onClose: () => void;
  onAdded: () => void;
}

const VM_OPTIONS: { value: NetworkVm; label: string; defaultDecimals: number }[] =
  [
    { value: "evm", label: "EVM", defaultDecimals: 18 },
    { value: "svm", label: "Solana VM", defaultDecimals: 9 },
    { value: "suivm", label: "Sui VM", defaultDecimals: 9 },
  ];

export function AddCustomNetworkModal({
  onClose,
  onAdded,
}: AddCustomNetworkModalProps) {
  const [vm, setVm] = useState<NetworkVm>("evm");
  const [name, setName] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [chainId, setChainId] = useState("");
  const [nativeSymbol, setNativeSymbol] = useState("");
  const [nativeDecimals, setNativeDecimals] = useState("18");
  const [explorerUrl, setExplorerUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [autofilledFrom, setAutofilledFrom] = useState("");

  const pickVm = (next: NetworkVm) => {
    setVm(next);
    const dec = VM_OPTIONS.find((o) => o.value === next)?.defaultDecimals ?? 18;
    setNativeDecimals(String(dec));
  };

  const handleChainIdChange = (value: string) => {
    setChainId(value);
    if (vm !== "evm") return;
    const cid = parseInt(value.trim(), 10);
    const known = Number.isFinite(cid) ? getChainlistEntry(cid) : null;
    if (!known) {
      setAutofilledFrom("");
      return;
    }
    if (!name.trim()) setName(known.name);
    if (!nativeSymbol.trim()) setNativeSymbol(known.nativeCurrency.symbol);
    setNativeDecimals(String(known.nativeCurrency.decimals));
    const rpc = getCleanRpcUrls(known)[0];
    const explorer = getPrimaryExplorer(known);
    if (!rpcUrl.trim() && rpc) setRpcUrl(rpc);
    if (!explorerUrl.trim() && explorer) setExplorerUrl(explorer);
    setAutofilledFrom(known.name);
  };

  const handleSave = async () => {
    setError("");
    if (!name.trim()) return setError("Enter a network name.");
    if (!/^https?:\/\//i.test(rpcUrl.trim()))
      return setError("Enter a valid RPC URL (https://…).");
    if (!nativeSymbol.trim()) return setError("Enter the native token symbol.");
    const dec = parseInt(nativeDecimals, 10);
    if (!Number.isFinite(dec) || dec < 0 || dec > 36)
      return setError("Native decimals must be 0–36.");
    let cid: number | undefined;
    if (vm === "evm") {
      cid = parseInt(chainId.trim(), 10);
      if (!Number.isFinite(cid) || cid <= 0)
        return setError("EVM network requires a numeric chainId.");
    }

    setSaving(true);
    try {
      await addCustomNetwork({
        vm,
        name,
        rpcUrl,
        chainId: cid,
        nativeSymbol,
        nativeDecimals: dec,
        explorerUrl: explorerUrl.trim() || undefined,
      });
      onAdded();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to add network.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="acn-overlay" onClick={saving ? undefined : onClose}>
      <div className="acn-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="acn-header">
          <span className="acn-title">Add Network</span>
          <button className="acn-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="acn-body">
          <label className="acn-label">Virtual machine</label>
          <div className="acn-vm-row">
            {VM_OPTIONS.map((o) => (
              <button
                key={o.value}
                className={`acn-vm-chip ${vm === o.value ? "active" : ""}`}
                onClick={() => pickVm(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <label className="acn-label">Network name</label>
          <input
            className="acn-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              vm === "svm"
                ? "Eclipse"
                : vm === "suivm"
                  ? "Sui Custom"
                  : "My EVM Chain"
            }
          />

          <label className="acn-label">RPC URL</label>
          <input
            className="acn-input"
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            placeholder="https://rpc.example.com"
          />

          {vm === "evm" && (
            <>
              <label className="acn-label">Chain ID</label>
              <input
                className="acn-input"
                value={chainId}
                onChange={(e) => handleChainIdChange(e.target.value)}
                placeholder="4441"
                inputMode="numeric"
              />
              {autofilledFrom && (
                <div className="acn-label" style={{ opacity: 0.75 }}>
                  ✓ Autofilled from public chainlist: {autofilledFrom}
                </div>
              )}
            </>
          )}

          <div className="acn-grid2">
            <div>
              <label className="acn-label">Native symbol</label>
              <input
                className="acn-input"
                value={nativeSymbol}
                onChange={(e) => setNativeSymbol(e.target.value)}
                placeholder={vm === "svm" ? "SOL" : vm === "suivm" ? "SUI" : "ETH"}
              />
            </div>
            <div>
              <label className="acn-label">Decimals</label>
              <input
                className="acn-input"
                value={nativeDecimals}
                onChange={(e) => setNativeDecimals(e.target.value)}
                inputMode="numeric"
              />
            </div>
          </div>

          <label className="acn-label">Block explorer (optional)</label>
          <input
            className="acn-input"
            value={explorerUrl}
            onChange={(e) => setExplorerUrl(e.target.value)}
            placeholder="https://explorer.example.com"
          />

          {error && <div className="acn-error">{error}</div>}
        </div>

        <div className="acn-footer">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Adding…" : "Add Network"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddCustomNetworkModal;
