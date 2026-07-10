import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeftIcon,
  CopyIcon,
  AlertIcon,
  CloseIcon,
} from "../../shared/Icons";
import {
  addressBookService,
  type AddressEntry,
} from "../../../services/core/AddressBookService";
import {
  detectAddressNetwork,
  type AddressNetwork,
} from "../../../utils/validation";
import "./AddressBookView.css";

const NETWORK_LABELS: Record<AddressNetwork, string> = {
  octra: "Octra",
  evm: "EVM",
  solana: "Solana",
  sui: "Sui",
  bitcoin: "Bitcoin",
};

interface AddressBookViewProps {
  onBack: () => void;
}

export function AddressBookView({ onBack }: AddressBookViewProps) {
  const [entries, setEntries] = useState<AddressEntry[]>([]);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    setEntries(await addressBookService.getAll());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    setError("");
    const trimmedLabel = label.trim();
    const trimmedAddr = address.trim();
    if (!trimmedLabel) return setError("Please enter a name.");
    const network = detectAddressNetwork(trimmedAddr);
    if (!network)
      return setError(
        "Enter a valid Octra, EVM, Solana, Sui, or Bitcoin address.",
      );
    await addressBookService.add({
      label: trimmedLabel,
      address: trimmedAddr,
      network,
    });
    setLabel("");
    setAddress("");
    setAdding(false);
    refresh();
  };

  const handleRemove = async (addr: string) => {
    await addressBookService.remove(addr);
    refresh();
  };

  return (
    <>
      <header className="wallet-header">
        <div className="flex items-center gap-md">
          <button className="header-icon-btn" onClick={onBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-lg font-semibold">Address Book</span>
        </div>
      </header>

      <div className="wallet-content animate-fade-in">
        {!adding ? (
          <button className="ab-add-btn" onClick={() => setAdding(true)}>
            + Add new address
          </button>
        ) : (
          <div className="ab-form">
            <input
              className="ab-input"
              placeholder="Name (e.g. My Binance)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              className="ab-input mono"
              placeholder="Address (Octra, EVM, Solana, Sui, BTC)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            {error && (
              <div className="ab-error">
                <AlertIcon size={13} /> {error}
              </div>
            )}
            <div className="ab-form-actions">
              <button
                className="ab-cancel"
                onClick={() => {
                  setAdding(false);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button className="ab-save" onClick={handleAdd}>
                Save
              </button>
            </div>
          </div>
        )}

        {entries.length === 0 && !adding && (
          <div className="ab-empty">No saved addresses yet.</div>
        )}

        <div className="ab-list">
          {entries.map((e) => (
            <div className="ab-item" key={e.address}>
              <div className="ab-item-info">
                <div className="ab-item-label">
                  {e.label}
                  <span className={`ab-net-badge ${e.network}`}>
                    {NETWORK_LABELS[e.network] ?? e.network}
                  </span>
                </div>
                <div className="ab-item-addr mono">{e.address}</div>
              </div>
              <div className="ab-item-actions">
                <button
                  className="ab-icon-btn"
                  title="Copy"
                  onClick={() => navigator.clipboard.writeText(e.address)}
                >
                  <CopyIcon size={15} />
                </button>
                <button
                  className="ab-icon-btn danger"
                  title="Remove"
                  onClick={() => handleRemove(e.address)}
                ><CloseIcon size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
