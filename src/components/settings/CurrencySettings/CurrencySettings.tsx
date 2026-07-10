import { useState, useEffect } from "react";
import { ChevronLeftIcon, CheckIcon } from "../../shared/Icons";
import {
  SUPPORTED_CURRENCIES,
  getDisplayCurrency,
  setDisplayCurrency,
  getAllUsdRates,
} from "../../../services/network/CurrencyService";
import "./CurrencySettings.css";

interface CurrencySettingsProps {
  onBack: () => void;
}

/** Compact rate string, e.g. 16250.4 → "16,250". Small values keep decimals. */
function formatRate(rate: number): string {
  const maximumFractionDigits = rate >= 100 ? 0 : rate >= 1 ? 2 : 4;
  return rate.toLocaleString("en-US", { maximumFractionDigits });
}

export function CurrencySettings({ onBack }: CurrencySettingsProps) {
  const [selected, setSelected] = useState("USD");
  const [rates, setRates] = useState<Record<string, number>>({});

  useEffect(() => {
    getDisplayCurrency().then(setSelected);
    getAllUsdRates()
      .then(setRates)
      .catch(() => setRates({}));
  }, []);

  const handleSelect = async (code: string) => {
    setSelected(code);
    await setDisplayCurrency(code);
    window.dispatchEvent(new CustomEvent("qiubit:currency-changed"));
    onBack();
  };

  return (
    <>
      <header className="wallet-header">
        <div className="flex items-center gap-md">
          <button className="header-icon-btn" onClick={onBack}>
            <ChevronLeftIcon size={20} />
          </button>
          <span className="text-lg font-semibold">Display Currency</span>
        </div>
      </header>

      <div className="wallet-content cur-screen animate-fade-in">
        <div className="cur-list">
          {SUPPORTED_CURRENCIES.map((c) => {
            const rate = rates[c.code];
            const isActive = selected === c.code;
            return (
              <button
                key={c.code}
                className={`cur-option ${isActive ? "active" : ""}`}
                onClick={() => handleSelect(c.code)}
              >
                <span className="cur-symbol">{c.symbol}</span>
                <div className="cur-info">
                  <span className="cur-code">{c.code}</span>
                  <span className="cur-label">{c.label}</span>
                </div>
                <div className="cur-right">
                  {c.code === "USD" ? (
                    <span className="cur-rate-base">Base</span>
                  ) : rate ? (
                    <span className="cur-rate">
                      {c.symbol} {formatRate(rate)}
                    </span>
                  ) : null}
                  <span
                    className={`cur-check ${isActive ? "on" : ""}`}
                    aria-hidden={!isActive}
                  >
                    {isActive && <CheckIcon size={14} />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="cur-note">
          Token prices are quoted in USD on-chain. This setting only changes how
          fiat values are displayed across the wallet.
        </div>
      </div>
    </>
  );
}
