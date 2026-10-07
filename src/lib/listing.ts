// Fixed-price listing state (mirrors the web app's src/lib/listing.ts).
//
// A listing is the vehicle's single `auctions` row: status 'active',
// start_time = publish, end_time = publish + 7 days, and the fixed price in
// buy_now_price_eur (bought through the buy_now() RPC). Time is the source of
// truth for expiry, so a listing whose 7 days are up is "expired" even before
// the server sweep flips its status.

export type ListingState = "live" | "expired" | "sold" | "none";

interface ListingTimes {
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export function listingState(a: ListingTimes | null | undefined, now: number = Date.now()): ListingState {
  if (!a) return "none";
  if (a.status === "sold") return "sold";
  if (a.status === "ended" || a.status === "cancelled") return "expired";
  const end = a.end_time ? new Date(a.end_time).getTime() : NaN;
  if (Number.isFinite(end) && end <= now) return "expired";
  const start = a.start_time ? new Date(a.start_time).getTime() : NaN;
  if (a.status === "active" && (!Number.isFinite(start) || start <= now)) return "live";
  return "none";
}

export function listingDaysLeft(endIso: string | null | undefined, now: number = Date.now()): number {
  if (!endIso) return 0;
  const ms = new Date(endIso).getTime() - now;
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "6 days left" / "Last day" in the active language. */
export function daysLeftLabel(t: Translate, endIso: string | null | undefined): string {
  const d = listingDaysLeft(endIso);
  return d <= 1 ? t("listing.lastDay") : t("listing.daysLeft", { count: d });
}

export function listingPrice(
  a: { buy_now_price_eur?: number | null } | null | undefined,
  v: { listed_price_eur?: number | null; buy_now_price_eur?: number | null },
): number | null {
  return a?.buy_now_price_eur ?? v.buy_now_price_eur ?? v.listed_price_eur ?? null;
}
