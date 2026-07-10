import { useState, useEffect } from "react";
import "./SwapView.css";
import { ChevronLeftIcon, RefreshIcon } from "../../shared/Icons";
import { Token, Wallet } from "../../../types";
import { SwapTab } from "./SwapTab";
import { OctraBridgeView } from "./OctraBridge/OctraBridgeView";

interface SwapViewProps {
  onBack: () => void;
  tokens: Token[];
  balance: number;
  address: string;
  wallet: Wallet;
  onRefresh: (
    mode?: "public" | "private" | "both",
    opts?: { force?: boolean },
  ) => void;
  isRefreshing?: boolean;
  settings?: any;
}

type NativeBridgeKey = "octra";
interface NativeBridgeDef {
  label: string;
  networks: string[]; // settings.network values that unlock this bridge
}
const NATIVE_BRIDGES: Record<NativeBridgeKey, NativeBridgeDef> = {
  octra: {
    label: "OCT ↔ ETH Bridge",
    networks: ["all", "octra", "ethereum"],
  },
};

export function SwapView({
  onBack,
  tokens: allTokens,
  balance,
  address,
  wallet,
  onRefresh,
  settings,
}: SwapViewProps) {
  const [nativeBridge, setNativeBridge] = useState<NativeBridgeKey | null>(
    null,
  );
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const currentNetwork = settings?.network || "all";
  const bridgeAllowed =
    NATIVE_BRIDGES.octra.networks.includes(currentNetwork) &&
    !!wallet.evmAddress;

  useEffect(() => {
    if (!bridgeAllowed) setNativeBridge(null);
  }, [bridgeAllowed]);

  if (nativeBridge === "octra") {
    return (
      <div className="swap-view-container animate-fade-in">
        <header className="view-header-minimal">
          <button
            className="header-icon-btn"
            onClick={() => setNativeBridge(null)}
          >
            <ChevronLeftIcon size={20} />
          </button>
          <h2 className="view-title">{NATIVE_BRIDGES.octra.label}</h2>
          <button
            className="header-icon-btn"
            onClick={() => {
              onRefresh("public");
              setRefreshTrigger((prev) => prev + 1);
            }}
          >
            <RefreshIcon size={18} />
          </button>
        </header>
        <OctraBridgeView
          wallet={wallet}
          address={address}
          balance={balance}
          onRefresh={onRefresh}
          tokens={allTokens}
          refreshTrigger={refreshTrigger}
        />
      </div>
    );
  }

  return (
    <div className="swap-view-container animate-fade-in">
      <header className="view-header-minimal">
        <button className="header-icon-btn" onClick={onBack}>
          <ChevronLeftIcon size={20} />
        </button>
        <h2 className="view-title">Swap & Bridge</h2>
        <button className="header-icon-btn" onClick={() => onRefresh("public")}>
          <RefreshIcon size={18} />
        </button>
      </header>
      <SwapTab
        wallet={wallet}
        allTokens={allTokens}
        address={address}
        octBalance={balance}
        onRefresh={() => onRefresh("public")}
        onBridgeTabOpen={
          bridgeAllowed ? () => setNativeBridge("octra") : undefined
        }
      />
    </div>
  );
}
