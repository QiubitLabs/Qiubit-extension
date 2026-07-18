import { useState } from "react";
import { createPortal } from "react-dom";
import "./AddWalletModal.css";
import {
  CloseIcon,
  PlusIcon,
  ImportIcon,
  KeyIcon,
  CheckIcon,
} from "../../shared/Icons";
import { MnemonicInput } from "../../shared/MnemonicInput";
import { detectPrivateKey } from "../../../utils/crypto/keyDetect";

interface AddWalletData {
  type: "create" | "import" | "import_mnemonic";
  privateKey?: string;
  mnemonic?: string;
}

interface AddWalletModalProps {
  onClose: () => void;
  onAddWallet: (data: AddWalletData) => Promise<void>;
}

export function AddWalletModal({ onClose, onAddWallet }: AddWalletModalProps) {
  const [mode, setMode] = useState<
    null | "create" | "import" | "import_mnemonic"
  >(null);
  const [inputValue, setInputValue] = useState("");
  const [mnemonicComplete, setMnemonicComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setIsProcessing(true);
    setError("");
    try {
      await onAddWallet({ type: "create" });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create wallet");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async (type: "import" | "import_mnemonic") => {
    if (!inputValue.trim()) {
      setError(
        type === "import"
          ? "Please enter private key"
          : "Please enter recovery phrase",
      );
      return;
    }

    setIsProcessing(true);
    setError("");
    try {
      await onAddWallet({
        type,
        [type === "import" ? "privateKey" : "mnemonic"]: inputValue.trim(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to import wallet");
    } finally {
      setIsProcessing(false);
    }
  };

  const reset = () => {
    setMode(null);
    setInputValue("");
    setMnemonicComplete(false);
    setError("");
  };

  return createPortal(
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="add-wallet-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-handle" />
        <div className="drawer-header">
          <span className="drawer-title">
            {mode === null && "Add Wallet"}
            {mode === "create" && "Create New Wallet"}
            {mode === "import" && "Import Private Key"}
            {mode === "import_mnemonic" && "Import Recovery Phrase"}
          </span>
          <button className="drawer-close" onClick={onClose} type="button">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="drawer-body no-scrollbar" style={{ flex: 1, overflowY: "auto" }}>
          {/* Step 1: Choose mode */}
          {mode === null && (
            <div className="add-wallet-options">
              <button
                className="add-wallet-option"
                onClick={() => setMode("create")}
                type="button"
              >
                <div className="add-wallet-option-icon">
                  <PlusIcon size={18} />
                </div>
                <div className="add-wallet-option-info">
                  <span className="add-wallet-option-title">
                    Create New Wallet
                  </span>
                  <span className="add-wallet-option-desc">
                    Generate a new wallet automatically
                  </span>
                </div>
              </button>
              <button
                className="add-wallet-option"
                onClick={() => setMode("import_mnemonic")}
                type="button"
              >
                <div className="add-wallet-option-icon">
                  <ImportIcon size={18} />
                </div>
                <div className="add-wallet-option-info">
                  <span className="add-wallet-option-title">
                    Import Recovery Phrase
                  </span>
                  <span className="add-wallet-option-desc">
                    Use 12-word recovery phrase
                  </span>
                </div>
              </button>
              <button
                className="add-wallet-option"
                onClick={() => setMode("import")}
                type="button"
              >
                <div className="add-wallet-option-icon">
                  <KeyIcon size={18} />
                </div>
                <div className="add-wallet-option-info">
                  <span className="add-wallet-option-title">
                    Import Private Key
                  </span>
                  <span className="add-wallet-option-desc">
                    Use existing private key
                  </span>
                </div>
              </button>
            </div>
          )}

          {/* Create Mode */}
          {mode === "create" && (
            <div className="add-wallet-form">
              <p className="text-secondary text-sm mb-lg" style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
                A new wallet will be created automatically. Make sure to backup
                the seed phrase from Settings later.
              </p>
              {error && <p className="text-error text-sm mb-lg" style={{ color: "var(--color-danger)", marginBottom: "16px" }}>{error}</p>}
              <div className="flex gap-md" style={{ display: "flex", gap: "12px" }}>
                <button
                  className="btn btn-secondary flex-1"
                  onClick={reset}
                  disabled={isProcessing}
                  type="button"
                  style={{ flex: 1 }}
                >
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={handleCreate}
                  disabled={isProcessing}
                  type="button"
                  style={{ flex: 1 }}
                >
                  {isProcessing ? "Creating..." : "Create Wallet"}
                </button>
              </div>
            </div>
          )}

          {/* Import Modes */}
          {(mode === "import" || mode === "import_mnemonic") && (
            <div className="add-wallet-form">
              <div className="form-group" style={{ marginBottom: "20px" }}>
                <label className="form-label" style={{ display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-secondary)" }}>
                  {mode === "import"
                    ? "Private Key"
                    : "Recovery Phrase (12 words)"}
                </label>
                {mode === "import_mnemonic" ? (
                  <MnemonicInput
                    autoFocus
                    onChange={(phrase, isComplete) => {
                      setInputValue(phrase);
                      setMnemonicComplete(isComplete);
                      setError("");
                    }}
                  />
                ) : (
                  <>
                    <textarea
                      className="input input-mono"
                      value={inputValue}
                      onChange={(e) => {
                        // Keys never contain whitespace — strip it so pastes
                        // from notes/files come out clean automatically.
                        setInputValue(e.target.value.replace(/\s+/g, ""));
                        setError("");
                      }}
                      placeholder="Paste your private key..."
                      rows={4}
                      style={{
                        width: "100%",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "12px",
                        padding: "12px",
                        color: "var(--text-primary)",
                        fontSize: "13px",
                        resize: "none",
                        fontFamily: "var(--font-mono)",
                        outline: "none"
                      }}
                    />
                    {inputValue.trim() ? (
                      (() => {
                        const detected = detectPrivateKey(inputValue);
                        return detected ? (
                          <p
                            className="form-hint"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "5px",
                              fontSize: "11px",
                              color: "var(--color-success, #10b981)",
                              marginTop: "6px",
                            }}
                          >
                            <CheckIcon size={12} /> Detected: {detected.label}
                          </p>
                        ) : (
                          <p
                            className="form-hint"
                            style={{ fontSize: "11px", color: "var(--color-danger)", marginTop: "6px" }}
                          >
                            Format not recognized yet — keep typing or check the key
                          </p>
                        );
                      })()
                    ) : (
                      <p
                        className="form-hint"
                        style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px" }}
                      >
                        Supports Octra, EVM (0x…), Solana, Sui (suiprivkey1…) and Bitcoin (WIF) keys.
                      </p>
                    )}
                  </>
                )}
              </div>
              {error && <p className="text-error text-sm mb-lg" style={{ color: "var(--color-danger)", marginBottom: "16px" }}>{error}</p>}
              <div className="flex gap-md" style={{ display: "flex", gap: "12px" }}>
                <button
                  className="btn btn-secondary flex-1"
                  onClick={reset}
                  disabled={isProcessing}
                  type="button"
                  style={{ flex: 1 }}
                >
                  Back
                </button>
                <button
                  className="btn btn-primary flex-1"
                  onClick={() => handleImport(mode)}
                  disabled={
                    isProcessing ||
                    (mode === "import_mnemonic"
                      ? !mnemonicComplete
                      : !detectPrivateKey(inputValue))
                  }
                  type="button"
                  style={{ flex: 1 }}
                >
                  {isProcessing ? "Importing..." : "Import Wallet"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

export default AddWalletModal;
