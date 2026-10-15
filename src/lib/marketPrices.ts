// UAE vs EU market prices on the vehicle screen.
//
// Reads the stored vehicle_market_prices row (web migration 034). The lookup
// itself runs once per listing on the server when an admin publishes or
// relists a car; this app never triggers one. The display rules are a copy of
// the web card's (xportacar src/lib/market-prices-view.ts):
//   - each side shows only when it has data (status ok); neither -> no card;
//   - UAE side failed (error or not enough listings) while the EU side has
//     data -> the seller's asking price (vehicles.price_aed) takes the UAE
//     slot, labelled as the asking price;
//   - the difference is EU minus UAE (market median, or the asking price).
// Pure JS (supabase + react only), so it ships by OTA to every runtime.

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export const MIN_UAE_LISTINGS = 3;

export interface MarketPricesRow {
  uae_median_aed: number | string | null;
  uae_median_eur: number | string | null;
  uae_count: number | null;
  uae_status: string | null;
  uae_fetched_at: string | null;
  eu_median_eur: number | string | null;
  eu_count: number | null;
  eu_status: string | null;
  eu_fetched_at: string | null;
  fx_rate: number | string | null;
  fx_date: string | null;
}

export type UaeSlot =
  | { kind: "market"; aed: number; eur: number | null; count: number }
  | { kind: "asking"; aed: number; eur: number | null };

export interface MarketPricesView {
  uae: UaeSlot | null;
  eu: { eur: number; count: number } | null;
  /** EU minus UAE, in EUR; pct is relative to the UAE figure. */
  difference: { eur: number; pct: number; basis: "market" | "asking" } | null;
  updatedAt: string | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function marketPricesView(
  row: MarketPricesRow | null | undefined,
  askingPriceAed: number | string | null | undefined,
): MarketPricesView | null {
  if (!row) return null;

  const euEur = num(row.eu_median_eur);
  const eu = row.eu_status === "ok" && euEur != null && euEur > 0
    ? { eur: euEur, count: num(row.eu_count) ?? 0 }
    : null;

  const uaeAed = num(row.uae_median_aed);
  const uaeCount = num(row.uae_count) ?? 0;
  const uaeMarket: UaeSlot | null = row.uae_status === "ok" && uaeAed != null && uaeAed > 0 && uaeCount >= MIN_UAE_LISTINGS
    ? { kind: "market", aed: uaeAed, eur: num(row.uae_median_eur), count: uaeCount }
    : null;

  if (!eu && !uaeMarket) return null;

  const rate = num(row.fx_rate);
  const asking = num(askingPriceAed);
  const uaeFailed = row.uae_status === "error" || row.uae_status === "insufficient_data";
  const uae: UaeSlot | null = uaeMarket ?? (eu && uaeFailed && asking != null && asking > 0
    ? { kind: "asking", aed: asking, eur: rate != null && rate > 0 ? Math.round(asking * rate * 100) / 100 : null }
    : null);

  const uaeEur = uae?.eur ?? null;
  const difference = eu && uae && uaeEur != null && uaeEur > 0
    ? { eur: Math.round(eu.eur - uaeEur), pct: (eu.eur - uaeEur) / uaeEur, basis: uae.kind }
    : null;

  const dates = [eu ? row.eu_fetched_at : null, uaeMarket ? row.uae_fetched_at : null]
    .filter((d): d is string => !!d)
    .sort();
  return { uae, eu, difference, updatedAt: dates.length ? dates[dates.length - 1] : null };
}

/** The GCC-vs-EU-spec note is shown unless the car itself is European spec. */
export function showSpecNote(marketSpec: string | null | undefined): boolean {
  return !/europe|\beu\b/i.test(marketSpec ?? "");
}

const COLUMNS =
  "uae_median_aed, uae_median_eur, uae_count, uae_status, uae_fetched_at, " +
  "eu_median_eur, eu_count, eu_status, eu_fetched_at, fx_rate, fx_date";

/** The card's view for a car, or null (no data, or the read failed). */
export function useMarketPrices(vehicleId: string | null | undefined): { view: MarketPricesView | null; marketSpec: string | null } {
  const [state, setState] = useState<{ view: MarketPricesView | null; marketSpec: string | null }>({ view: null, marketSpec: null });
  useEffect(() => {
    if (!vehicleId) { setState({ view: null, marketSpec: null }); return; }
    let on = true;
    (async () => {
      try {
        const [{ data: row }, { data: v }] = await Promise.all([
          supabase.from("vehicle_market_prices").select(COLUMNS).eq("vehicle_id", vehicleId).maybeSingle(),
          supabase.from("vehicles").select("price_aed, market_spec").eq("id", vehicleId).maybeSingle(),
        ]);
        if (!on) return;
        const car = v as { price_aed?: number | null; market_spec?: string | null } | null;
        setState({ view: marketPricesView(row as MarketPricesRow | null, car?.price_aed ?? null), marketSpec: car?.market_spec ?? null });
      } catch {
        if (on) setState({ view: null, marketSpec: null });
      }
    })();
    return () => { on = false; };
  }, [vehicleId]);
  return state;
}
