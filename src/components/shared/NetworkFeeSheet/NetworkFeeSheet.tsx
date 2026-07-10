import "./NetworkFeeSheet.css";
import { CloseIcon, CheckIcon } from "../../shared/Icons";
import { formatAmount } from "../../../utils/crypto";
import { gweiToWei } from "../../../utils/evmProvider";

export type FeeSpeed = "slow" | "normal" | "fast" | "custom";

export interface EvmGasOpts {
  gasLimit: bigint;
  slow: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  normal: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
  fast: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };
}

export interface FeeEstimates {
  low: number;
  medium: number;
  high: number;
}

interface NetworkFeeSheetProps {
  show: boolean;
  onClose: () => void;
  feeSpeed: FeeSpeed;
  setFeeSpeed: (speed: FeeSpeed) => void;
  feeEstimates: FeeEstimates;
  evmGasOpts?: EvmGasOpts | null;
  customFeeGwei: string;
  setCustomFeeGwei: (v: string) => void;
  gasSymbol: string;
  ethPriceUsd?: number | null;
}

const SPEED_META = [
  {
    key: "slow" as const,
    label: "Slow",
    desc: "Lower priority",
    amount: (e: FeeEstimates) => e.low,
  },
  {
    key: "normal" as const,
    label: "Normal",
    desc: "Recommended",
    amount: (e: FeeEstimates) => e.medium,
  },
  {
    key: "fast" as const,
    label: "Fast",
    desc: "Higher priority",
    amount: (e: FeeEstimates) => e.high,
  },
];

export function NetworkFeeSheet({
  show,
  onClose,
  feeSpeed,
  setFeeSpeed,
  feeEstimates,
  evmGasOpts,
  customFeeGwei,
  setCustomFeeGwei,
  gasSymbol,
  ethPriceUsd,
}: NetworkFeeSheetProps) {
  if (!show) return null;

  const isEvm = !!evmGasOpts;

  const customWei = isEvm ? gweiToWei(customFeeGwei || "0") : 0n;
  const customNative =
    isEvm && evmGasOpts ? Number(customWei * evmGasOpts.gasLimit) / 1e18 : 0;
  const customUsd =
    customNative && ethPriceUsd ? customNative * ethPriceUsd : 0;

  return (
    <div
      className="nfs-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Header */}
      <div className="nfs-header">
        <span className="nfs-title">Network Fee</span>
        <button className="nfs-close" onClick={onClose} aria-label="Close">
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="nfs-body">
        {SPEED_META.map(({ key, label, desc, amount }) => {
          const fee = amount(feeEstimates);
          const usd = ethPriceUsd ? fee * ethPriceUsd : null;
          const gweiStr =
            isEvm && evmGasOpts
              ? `${(Number(evmGasOpts[key].maxFeePerGas) / 1e9).toFixed(2)} Gwei`
              : "";

          return (
            <button
              key={key}
              className={`nfs-option ${feeSpeed === key ? "active" : ""}`}
              onClick={() => {
                setFeeSpeed(key);
                onClose();
              }}
            >
              <div className="nfs-meta">
                <span className="nfs-name">{label}</span>
                <span className="nfs-desc">{desc}</span>
              </div>
              <div className="nfs-pricing">
                <span className="nfs-price-primary">
                  {formatAmount(fee, 6)} {gasSymbol}
                </span>
                {(usd !== null || gweiStr) && (
                  <span className="nfs-price-secondary">
                    {gweiStr}
                    {gweiStr && usd !== null ? " · " : ""}
                    {usd !== null ? `≈ $${usd.toFixed(2)}` : ""}
                  </span>
                )}
              </div>
              <div className="nfs-check">
                {feeSpeed === key && <CheckIcon size={11} />}
              </div>
            </button>
          );
        })}

        {/* Custom — only for EVM */}
        {isEvm && (
          <button
            className={`nfs-option ${feeSpeed === "custom" ? "active" : ""}`}
            onClick={() => setFeeSpeed("custom")}
          >
            <div className="nfs-meta">
              <span className="nfs-name">Custom</span>
              <span className="nfs-desc">Set your own gas price</span>
            </div>
            <div className="nfs-check">
              {feeSpeed === "custom" && <CheckIcon size={11} />}
            </div>
          </button>
        )}

        {isEvm && feeSpeed === "custom" && (
          <div className="nfs-custom-wrap">
            <div className="nfs-custom-row">
              <input
                type="number"
                className="nfs-custom-input"
                value={customFeeGwei}
                onChange={(e) => setCustomFeeGwei(e.target.value)}
                placeholder="Gas price"
                autoFocus
              />
              <span className="nfs-custom-suffix">Gwei</span>
            </div>
            {customNative > 0 && (
              <div className="nfs-custom-preview">
                {customNative.toFixed(6)} {gasSymbol}
                {customUsd > 0 ? ` · ≈ $${customUsd.toFixed(2)}` : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
