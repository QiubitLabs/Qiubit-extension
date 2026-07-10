/**
 * CurrencyService — converts USD-denominated values to the user's chosen
 * display currency. Prices across the app are fetched in USD; this layer
 * multiplies by a cached FX rate so the UI can show IDR, EUR, etc.
 *
 * Rates come from the free exchangerate.host endpoint, cached for 6 hours
 * (FX moves slowly enough that a wallet does not need live rates).
 */

const CURRENCY_KEY = "qiubit_display_currency";
const RATE_CACHE_KEY = "qiubit_fx_rates";
const RATE_TTL = 6 * 60 * 60 * 1000; // 6h

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "IDR", symbol: "Rp", label: "Indonesian Rupiah" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "BRL", symbol: "R$", label: "Brazilian Real" },
];

interface RateCache {
  rates: Record<string, number>;
  timestamp: number;
}

let memoryCurrency: string | null = null;

// Synchronously-readable active state so formatUsd/formatFiatSync work during
// render without awaiting. Kept fresh by initCurrency() and setDisplayCurrency().
let activeCurrency = "USD";
let activeRate = 1;

export async function getDisplayCurrency(): Promise<string> {
  if (memoryCurrency) return memoryCurrency;
  try {
    const data = await chrome.storage?.local?.get(CURRENCY_KEY);
    memoryCurrency = (data?.[CURRENCY_KEY] as string) || "USD";
  } catch {
    memoryCurrency = "USD";
  }
  return memoryCurrency;
}

export async function setDisplayCurrency(code: string): Promise<void> {
  memoryCurrency = code;
  activeCurrency = code;
  try {
    await chrome.storage?.local?.set({ [CURRENCY_KEY]: code });
  } catch {
    /* ignore */
  }
  activeRate = await getUsdRate(code);
}

/**
 * Loads the saved currency and its rate into the synchronous globals.
 * Call once at app startup so formatUsd shows the right currency on first paint.
 */
export async function initCurrency(): Promise<void> {
  const code = await getDisplayCurrency();
  activeCurrency = code;
  activeRate = await getUsdRate(code);
}

/** Synchronous USD→display-currency formatter using the cached active rate. */
export function formatFiatSync(usd: number | null | undefined): string {
  return formatFiat(usd, activeCurrency, activeRate);
}

/**
 * Currency-aware token price formatter (adaptive decimals). Converts a USD
 * price to the active currency and picks decimals based on the converted
 * magnitude so tiny prices stay readable (e.g. Rp1.280 vs $0.08).
 */
export function formatFiatPrice(usdPrice: number | null | undefined): string {
  if (!usdPrice || usdPrice === 0) return "--";
  const opt = getCurrencyOption(activeCurrency);
  const v = usdPrice * activeRate;
  let str: string;
  if (v < 0.01) str = v.toFixed(6);
  else if (v < 1) str = v.toFixed(4);
  else if (v < 1000) str = v.toFixed(2);
  else str = v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${opt.symbol}${str}`;
}

export function getActiveCurrency(): string {
  return activeCurrency;
}

export function getCurrencyOption(code: string): CurrencyOption {
  return (
    SUPPORTED_CURRENCIES.find((c) => c.code === code) ??
    SUPPORTED_CURRENCIES[0]
  );
}

async function readRateCache(): Promise<RateCache | null> {
  try {
    const data = await chrome.storage?.local?.get(RATE_CACHE_KEY);
    return (data?.[RATE_CACHE_KEY] as RateCache) ?? null;
  } catch {
    return null;
  }
}

// Free, key-less FX endpoints (tried in order). Each returns USD→others.
const FX_ENDPOINTS: Array<{
  url: string;
  extract: (json: any) => Record<string, number> | null;
}> = [
  {
    // open.er-api.com — no key, includes IDR/JPY/etc.
    url: "https://open.er-api.com/v6/latest/USD",
    extract: (j) => (j?.result === "success" ? j.rates : null),
  },
  {
    // jsDelivr community currency API — no key, daily rates
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    extract: (j) => {
      const r = j?.usd;
      if (!r) return null;
      // keys are lowercase (idr, eur…) → upper-case them
      const out: Record<string, number> = {};
      for (const k of Object.keys(r)) out[k.toUpperCase()] = r[k];
      return out;
    },
  },
];

function validRate(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : null;
}

/** USD→currency multiplier. Returns 1 for USD or when rates are unavailable. */
export async function getUsdRate(currency: string): Promise<number> {
  if (currency === "USD") return 1;

  const cached = await readRateCache();
  if (cached && Date.now() - cached.timestamp < RATE_TTL) {
    const r = validRate(cached.rates[currency]);
    if (r) return r;
  }

  for (const ep of FX_ENDPOINTS) {
    try {
      const resp = await fetch(ep.url);
      if (!resp.ok) continue;
      const rates = ep.extract(await resp.json());
      if (rates && typeof rates === "object") {
        await chrome.storage?.local?.set({
          [RATE_CACHE_KEY]: { rates, timestamp: Date.now() },
        });
        const r = validRate(rates[currency]);
        if (r) return r;
      }
    } catch {
      /* try next endpoint */
    }
  }
  // Last resort: stale cache, else 1 (show USD value rather than 0)
  return validRate(cached?.rates?.[currency]) ?? 1;
}

/**
 * Full USD→currency rate table (cached; one network round-trip if stale).
 * Used by the currency picker to show a live "1 USD = …" line per option
 * without a fetch per currency.
 */
export async function getAllUsdRates(): Promise<Record<string, number>> {
  const cached = await readRateCache();
  if (cached && Date.now() - cached.timestamp < RATE_TTL) return cached.rates;
  // getUsdRate populates the shared cache with the whole table
  await getUsdRate("EUR");
  const fresh = await readRateCache();
  return fresh?.rates ?? cached?.rates ?? {};
}

/** Format a USD amount into the given currency with its symbol. */
export function formatFiat(
  usdValue: number | null | undefined,
  currency: string,
  rate: number,
): string {
  const opt = getCurrencyOption(currency);
  const noDec = currency === "IDR" || currency === "JPY";
  if (usdValue == null || isNaN(usdValue) || usdValue === 0) {
    return `${opt.symbol}${noDec ? "0" : "0.00"}`;
  }
  const converted = usdValue * rate;
  const formatted = converted.toLocaleString("en-US", {
    minimumFractionDigits: noDec ? 0 : 2,
    maximumFractionDigits: noDec ? 0 : 2,
  });
  return `${opt.symbol}${formatted}`;
}
