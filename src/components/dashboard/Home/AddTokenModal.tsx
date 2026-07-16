import { useState } from "react";
import {
  fetchTokenMetadata,
  addCustomToken,
  CustomToken,
} from "../../../services/features/CustomTokenService";
import {
  ocs01Manager,
  OCS01UserToken,
} from "../../../services/features/OCS01TokenService";
import { NETWORK_REGISTRY } from "../../../constants/networks/registry";
import { getAllNetworks } from "../../../services/network/NetworkResolver";
import { isValidAddress } from "../../../utils/validation";
import { TokenIcon } from "../../shared/TokenIcon";
import { CloseIcon } from "../../shared/Icons";
import { ethers } from "ethers";
import { suiRpc } from "../../../services/network/SuiRpcService";
import { solanaRpc } from "../../../services/network/SolanaRpcService";

interface AddTokenModalProps {
  walletAddress: string;
  initialChainId?: number;
  initialNetworkId?: string;
  onAdded: () => void;
  onClose: () => void;
}

type NetworkOption = { chainId: number; name: string; isOctra?: boolean };

/**
 * EVM networks for auto-detect + display. Computed fresh (not a module const)
 * so user-added custom networks are always included — a const would capture
 * only the built-in registry at import time and miss networks added later.
 */
function getEvmNetworkOptions(): NetworkOption[] {
  return Object.values(getAllNetworks())
    .filter((n) => n.isEVM && n.chainId != null)
    .map((n) => ({ chainId: n.chainId as number, name: n.displayName }));
}

type NetworkType = "auto" | "octra" | "evm" | "solana" | "sui";

export function AddTokenModal({
  walletAddress,
  initialChainId,
  initialNetworkId,
  onAdded,
  onClose,
}: AddTokenModalProps) {
  const getInitialNetworkType = (): NetworkType => {
    if (!initialNetworkId) return "auto";
    if (initialNetworkId === "octra") return "octra";
    if (initialNetworkId === "solana") return "solana";
    if (initialNetworkId === "sui") return "sui";
    if (initialNetworkId === "all") return "auto";
    const netMeta = NETWORK_REGISTRY[initialNetworkId];
    if (netMeta?.isEVM) return "evm";
    return "auto";
  };

  const [contractInput, setContractInput] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>(
    getInitialNetworkType(),
  );
  const [resolvedChainId, setResolvedChainId] = useState<number | null>(null);
  const [isOctra, setIsOctra] = useState(false);

  const [evmPreview, setEvmPreview] = useState<Omit<
    CustomToken,
    "addedAt"
  > | null>(null);
  const [octraPreview, setOctraPreview] = useState<OCS01UserToken | null>(null);
  const [suiPreview, setSuiPreview] = useState<Omit<
    CustomToken,
    "addedAt"
  > | null>(null);
  const [solanaPreview, setSolanaPreview] = useState<Omit<
    CustomToken,
    "addedAt"
  > | null>(null);

  const [showManualFields, setShowManualFields] = useState(false);
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualDecimals, setManualDecimals] = useState("");

  const [isLooking, setIsLooking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setEvmPreview(null);
    setOctraPreview(null);
    setSuiPreview(null);
    setSolanaPreview(null);
    setResolvedChainId(null);
    setIsOctra(false);
    setError("");
    setShowManualFields(false);
    setManualSymbol("");
    setManualName("");
    setManualDecimals("");
  };

  const handleLookup = async () => {
    const addr = contractInput.trim();
    if (!addr) return;
    setError("");
    setEvmPreview(null);
    setOctraPreview(null);
    setSuiPreview(null);
    setSolanaPreview(null);
    setResolvedChainId(null);
    setIsOctra(false);
    setIsLooking(true);
    setShowManualFields(false);

    try {
      let targetNetwork = selectedNetwork;
      if (targetNetwork === "auto") {
        if (addr.toLowerCase().startsWith("oct")) {
          targetNetwork = "octra";
        } else if (addr.startsWith("0x") && addr.includes("::")) {
          targetNetwork = "sui";
        } else if (ethers.isAddress(addr)) {
          targetNetwork = "evm";
        } else {
          if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
            targetNetwork = "solana";
          } else {
            throw new Error(
              "Could not auto-detect network. Please select network manually.",
            );
          }
        }
      }

      if (targetNetwork === "octra") {
        if (!isValidAddress(addr)) {
          throw new Error("Invalid Octra address (must start with oct…)");
        }
        const meta = await ocs01Manager.lookupToken(addr, walletAddress);
        if (!meta) {
          throw new Error(
            "Token not found or contract does not implement OCS-01 standard",
          );
        }
        setOctraPreview(meta);
        setIsOctra(true);
      } else if (targetNetwork === "sui") {
        if (!/^0x[a-fA-F0-9]{1,64}::[a-zA-Z0-9_]+::[a-zA-Z0-9_]+$/.test(addr)) {
          throw new Error("Invalid Sui CoinType format (e.g. 0x2::sui::SUI)");
        }
        const meta = await suiRpc.getCoinMetadata(addr);
        if (!meta) {
          throw new Error(
            "Sui Coin metadata lookup failed. Please enter details manually.",
          );
        }
        setSuiPreview({
          contractAddress: addr,
          symbol: meta.symbol,
          name: meta.name,
          decimals: meta.decimals,
          logoUrl: meta.logoUrl,
          chainId: 9270000000000000,
        });
      } else if (targetNetwork === "solana") {
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
          throw new Error("Invalid Solana mint address format");
        }
        const decimals = await solanaRpc.getMintDecimals(addr);
        if (decimals === null) {
          throw new Error(
            "Could not resolve Solana mint decimals. Please enter details manually.",
          );
        }
        setSolanaPreview({
          contractAddress: addr,
          symbol: "",
          name: "",
          decimals: decimals,
          logoUrl: "",
          chainId: 1151111081099710,
        });
        setManualDecimals(String(decimals));
        setShowManualFields(true);
      } else {
        if (!ethers.isAddress(addr)) {
          throw new Error("Invalid contract address format");
        }

        const promises = getEvmNetworkOptions().map(async (net) => {
          try {
            const meta = await fetchTokenMetadata(addr, net.chainId);
            if (meta && meta.symbol && meta.decimals) {
              return { meta, net };
            }
          } catch {
            return null;
          }
          return null;
        });

        const results = await Promise.all(promises);
        const match = results.find((r) => r !== null);

        if (!match) {
          throw new Error(
            "Token contract could not be found on any supported EVM networks",
          );
        }

        setEvmPreview(match.meta);
        setResolvedChainId(match.net.chainId);
        setIsOctra(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not fetch token info");
      const guessNet =
        selectedNetwork === "auto"
          ? addr.toLowerCase().startsWith("oct")
            ? "octra"
            : ethers.isAddress(addr)
              ? "evm"
              : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)
                ? "solana"
                : "evm"
          : selectedNetwork;
      if (guessNet !== "octra") {
        setShowManualFields(true);
      }
    } finally {
      setIsLooking(false);
    }
  };

  const handleAdd = async () => {
    setIsSaving(true);
    try {
      if (isOctra && octraPreview) {
        await ocs01Manager.addUserContract(walletAddress, octraPreview);
      } else if (suiPreview || selectedNetwork === "sui") {
        const finalToken: CustomToken = {
          contractAddress: contractInput.trim(),
          symbol: showManualFields
            ? manualSymbol.trim()
            : suiPreview?.symbol || "UNK",
          name: showManualFields
            ? manualName.trim()
            : suiPreview?.name || "Unknown Sui Token",
          decimals: showManualFields
            ? Number(manualDecimals)
            : suiPreview?.decimals || 9,
          logoUrl: suiPreview?.logoUrl || "",
          chainId: 9270000000000000,
          addedAt: Date.now(),
        };
        if (
          !finalToken.contractAddress ||
          !finalToken.symbol ||
          isNaN(finalToken.decimals)
        ) {
          throw new Error("Please fill in all token details correctly");
        }
        await addCustomToken(walletAddress, finalToken);
      } else if (solanaPreview || selectedNetwork === "solana") {
        const finalToken: CustomToken = {
          contractAddress: contractInput.trim(),
          symbol: showManualFields
            ? manualSymbol.trim()
            : solanaPreview?.symbol || "UNK",
          name: showManualFields
            ? manualName.trim()
            : solanaPreview?.name || "Unknown Solana Token",
          decimals: showManualFields
            ? Number(manualDecimals)
            : solanaPreview?.decimals || 9,
          logoUrl: solanaPreview?.logoUrl || "",
          chainId: 1151111081099710,
          addedAt: Date.now(),
        };
        if (
          !finalToken.contractAddress ||
          !finalToken.symbol ||
          isNaN(finalToken.decimals)
        ) {
          throw new Error("Please fill in all token details correctly");
        }
        await addCustomToken(walletAddress, finalToken);
      } else {
        const finalToken: CustomToken = {
          contractAddress: contractInput.trim(),
          symbol: showManualFields
            ? manualSymbol.trim()
            : evmPreview?.symbol || "UNK",
          name: showManualFields
            ? manualName.trim()
            : evmPreview?.name || "Unknown EVM Token",
          decimals: showManualFields
            ? Number(manualDecimals)
            : evmPreview?.decimals || 18,
          logoUrl: evmPreview?.logoUrl || "",
          chainId: resolvedChainId || (initialChainId ?? 1),
          addedAt: Date.now(),
        };
        if (!ethers.isAddress(finalToken.contractAddress)) {
          throw new Error("Invalid contract address format");
        }
        if (!finalToken.symbol || isNaN(finalToken.decimals)) {
          throw new Error("Please fill in all token details correctly");
        }
        await addCustomToken(walletAddress, finalToken);
      }
      onAdded();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save token");
    } finally {
      setIsSaving(false);
    }
  };

  const isFormValid = (() => {
    if (isOctra) return !!octraPreview;
    if (showManualFields) {
      return (
        contractInput.trim() &&
        manualSymbol.trim() &&
        manualName.trim() &&
        manualDecimals.trim() &&
        !isNaN(Number(manualDecimals))
      );
    }
    return !!(suiPreview || solanaPreview || evmPreview);
  })();

  const preview = isOctra
    ? octraPreview
    : evmPreview || suiPreview || solanaPreview;

  return (
    <div className="atm-overlay" onClick={onClose}>
      <div className="atm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="atm-header">
          <span>Add Token</span>
          <button className="atm-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>

        <div className="atm-body">
          <label className="atm-label">Network</label>
          <div className="atm-net-row">
            <button
              type="button"
              className={`atm-net-btn ${selectedNetwork === "auto" ? "active" : ""}`}
              onClick={() => {
                setSelectedNetwork("auto");
                resetForm();
              }}
            >
              Auto-detect
            </button>
            <button
              type="button"
              className={`atm-net-btn ${selectedNetwork === "octra" ? "active" : ""}`}
              onClick={() => {
                setSelectedNetwork("octra");
                resetForm();
              }}
            >
              Octra
            </button>
            <button
              type="button"
              className={`atm-net-btn ${selectedNetwork === "evm" ? "active" : ""}`}
              onClick={() => {
                setSelectedNetwork("evm");
                resetForm();
              }}
            >
              EVM Network
            </button>
            <button
              type="button"
              className={`atm-net-btn ${selectedNetwork === "solana" ? "active" : ""}`}
              onClick={() => {
                setSelectedNetwork("solana");
                resetForm();
              }}
            >
              Solana
            </button>
            <button
              type="button"
              className={`atm-net-btn ${selectedNetwork === "sui" ? "active" : ""}`}
              onClick={() => {
                setSelectedNetwork("sui");
                resetForm();
              }}
            >
              Sui
            </button>
          </div>

          <label className="atm-label">Contract Address / Mint</label>
          <div className="atm-input-row">
            <input
              className="atm-input"
              placeholder="Enter token address or mint"
              value={contractInput}
              onChange={(e) => {
                setContractInput(e.target.value);
                setEvmPreview(null);
                setOctraPreview(null);
                setSuiPreview(null);
                setSolanaPreview(null);
                setResolvedChainId(null);
                setIsOctra(false);
                setError("");
                setShowManualFields(false);
              }}
              spellCheck={false}
            />
            <button
              className="atm-lookup-btn"
              onClick={handleLookup}
              disabled={isLooking || !contractInput.trim()}
            >
              {isLooking ? <span className="atm-spin" /> : "Lookup"}
            </button>
          </div>

          {error && <div className="atm-error">{error}</div>}

          {showManualFields && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginTop: 10,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="atm-label">Token Symbol</label>
                <input
                  className="atm-input"
                  placeholder="e.g. USDC"
                  value={manualSymbol}
                  onChange={(e) =>
                    setManualSymbol(e.target.value.toUpperCase())
                  }
                  spellCheck={false}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="atm-label">Token Name</label>
                <input
                  className="atm-input"
                  placeholder="e.g. USD Coin"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  spellCheck={false}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label className="atm-label">Decimals</label>
                <input
                  className="atm-input"
                  type="number"
                  placeholder="e.g. 6"
                  value={manualDecimals}
                  onChange={(e) => setManualDecimals(e.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          {preview && !showManualFields && (
            <div className="atm-preview">
              <TokenIcon
                symbol={preview.symbol}
                size={36}
                contractAddress={
                  (preview as any).contractAddress || (preview as any).address
                }
                logoUrl={(preview as any).logoUrl}
              />
              <div className="atm-preview-info">
                <span className="atm-preview-symbol">
                  {preview.symbol}
                  <span
                    className="atm-preview-badge"
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.08)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {isOctra
                      ? "Octra Network"
                      : suiPreview
                        ? "Sui Network"
                        : solanaPreview
                          ? "Solana Network"
                          : getEvmNetworkOptions().find(
                              (n) => n.chainId === resolvedChainId,
                            )?.name || "EVM Network"}
                  </span>
                </span>
                <span className="atm-preview-name">{preview.name}</span>
                <span className="atm-preview-dec">
                  {preview.decimals} decimals
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="atm-footer">
          <button className="atm-btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="atm-btn-add"
            onClick={handleAdd}
            disabled={!isFormValid || isSaving}
          >
            {isSaving ? <span className="atm-spin" /> : "Add Token"}
          </button>
        </div>
      </div>
    </div>
  );
}
