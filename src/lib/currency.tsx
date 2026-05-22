// Lightweight currency conversion + display formatting.
// Hard-coded rates are loaded into the provider on first mount; if we ever
// hook up a live FX feed it lands here without touching the screens.

import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";

export type Currency = "EUR" | "USD" | "AED" | "GBP";
export const CURRENCIES: Currency[] = ["EUR", "USD", "AED", "GBP"];

const SYMBOL: Record<Currency, string> = {
  EUR: "€",
  USD: "$",
  AED: "AED ",
  GBP: "£",
};

// Reference rates relative to 1 EUR.  These are intentionally hard-coded
// for now — real FX comes later.
const RATE_FROM_EUR: Record<Currency, number> = {
  EUR: 1,
  USD: 1.08,
  AED: 3.97,
  GBP: 0.86,
};

interface CurrencyValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  format: (amountEur: number | null | undefined) => string;
  convert: (amountEur: number) => number;
  symbol: string;
}

const CurrencyContext = createContext<CurrencyValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("EUR");

  const value = useMemo<CurrencyValue>(() => {
    const rate = RATE_FROM_EUR[currency];
    return {
      currency,
      setCurrency,
      symbol: SYMBOL[currency],
      convert: (amt) => amt * rate,
      format: (amt) => {
        if (amt == null) return "—";
        const converted = amt * rate;
        // AED uses a "AED " prefix and no decimals.  EUR/USD/GBP use the
        // glyph and group with thin space separators that look clean in RN.
        const num = Math.round(converted).toLocaleString("en-US");
        return currency === "AED" ? `${SYMBOL.AED}${num}` : `${SYMBOL[currency]}${num}`;
      },
    };
  }, [currency]);

  return createElement(CurrencyContext.Provider, { value }, children);
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used inside <CurrencyProvider>");
  return ctx;
}
