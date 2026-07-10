import { useState, useEffect, useCallback } from "react";
import {
  getDisplayCurrency,
  getUsdRate,
  formatFiat,
  getCurrencyOption,
} from "../services/network/CurrencyService";

/**
 * Resolves the user's chosen display currency and its USD rate once, then
 * exposes a `format(usd)` helper. Re-reads when a `currency-changed` event
 * fires so all mounted views update together after a settings change.
 */
export function useDisplayCurrency() {
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState(1);

  const load = useCallback(async () => {
    const code = await getDisplayCurrency();
    setCurrency(code);
    setRate(await getUsdRate(code));
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("qiubit:currency-changed", handler);
    return () => window.removeEventListener("qiubit:currency-changed", handler);
  }, [load]);

  const format = useCallback(
    (usd: number | null | undefined) => formatFiat(usd, currency, rate),
    [currency, rate],
  );

  return { currency, rate, format, symbol: getCurrencyOption(currency).symbol };
}
