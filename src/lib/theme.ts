// Shared design tokens — matches the web app's blue brand identity.

export const theme = {
  colors: {
    brand:        "#1570EF",
    brandDark:    "#175CD3",
    brandLight:   "#EFF8FF",
    success:      "#039855",
    successBg:    "#ecfdf3",
    warning:      "#DC6803",
    warningBg:    "#fff8eb",
    error:        "#D92D20",
    errorBg:      "#fef3f2",
    white:        "#ffffff",
    black:        "#101828",
    text:         "#101828",
    textMuted:    "#475467",
    textLight:    "#667085",
    border:       "#eaecf0",
    borderStrong: "#d0d5dd",
    bg:           "#fcfcfd",
    bgAlt:        "#f9fafb",
    surface:      "#ffffff",
  },
  radius:  { sm: 6, md: 8, lg: 12, xl: 16, full: 999 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  fontWeight: {
    regular: "400" as const,
    medium:  "500" as const,
    semibold: "600" as const,
    bold:    "700" as const,
    extra:   "800" as const,
  },
};

export const formatEur = (n: number | null | undefined): string => {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `€${Math.round(n).toLocaleString("en-GB")}`;
  }
};

export const formatKm = (n: number | null | undefined): string =>
  n == null ? "—" : `${n.toLocaleString("en-GB")} km`;

// Small thumbnail variant for list/grid cards so we don't pull full-size
// photos over cellular at 100k-vehicle scale. Supabase Storage URLs → image
// render endpoint; Unsplash → w/q params; everything else unchanged.
export const thumb = (url: string | null | undefined, width = 600): string => {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.pathname.includes("/storage/v1/object/public/")) {
      u.pathname = u.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
      u.searchParams.set("width", String(width));
      // 4:3 height + resize=cover → Supabase center-crops the source server-side
      // so tall portrait phone photos fill the card instead of letterboxing.
      u.searchParams.set("height", String(Math.round((width * 3) / 4)));
      u.searchParams.set("quality", "70");
      u.searchParams.set("resize", "cover");
      return u.toString();
    }
    if (u.hostname.includes("images.unsplash.com")) {
      u.searchParams.set("w", String(width));
      u.searchParams.set("q", "70");
      u.searchParams.set("auto", "format");
      u.searchParams.set("fit", "crop");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
};

// Pick the single best photo to represent a vehicle in a thumbnail. The
// Front-right 3/4 exterior shot is the most flattering, recognisable framing,
// so we prefer it. Falls back gracefully when captions/categories are missing.
//
// Priority:
//   1. caption matches the front 3/4 / front-right framing,
//   2. caption mentions "front",
//   3. lowest sort_order exterior photo,
//   4. lowest sort_order photo overall.
export interface ThumbCandidate {
  url: string;
  sort_order?: number | null;
  caption?: string | null;
  category?: string | null;
}

const FRONT_THREE_QUARTER_RE = /front.*(three[- ]?quarter|3\/4|right)/i;
const FRONT_RE = /front/i;

export function pickThumbnailPhoto<T extends ThumbCandidate>(
  photos: readonly T[] | null | undefined,
): T | undefined {
  if (!photos || photos.length === 0) return undefined;
  const byOrder = [...photos].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  return (
    byOrder.find((p) => p.caption && FRONT_THREE_QUARTER_RE.test(p.caption)) ??
    byOrder.find((p) => p.caption && FRONT_RE.test(p.caption)) ??
    byOrder.find((p) => p.category === "exterior") ??
    byOrder[0]
  );
}

export const formatRemaining = (endIso: string): string => {
  const ms = new Date(endIso).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

// Compact countdown adapted to the time remaining:
//   - over 24h  → "2d 14h"
//   - 1h..24h   → "14h 32m"
//   - under 1h  → "MM:SS" (intended to be paired with a red pulse)
//   - 0        → "Ended"
export const formatCountdown = (endIso: string): string => {
  const ms = new Date(endIso).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${pad(m)}:${pad(s)}`;
};

export const msRemaining = (endIso: string): number =>
  Math.max(0, new Date(endIso).getTime() - Date.now());

// Truth-checking helpers for auction state. The DB row's `status` lags
// behind reality: an auction with status="active" but end_time < now is
// actually ended. Use these helpers everywhere we display LIVE/ENDED
// badges so the UI stays consistent.
export interface AuctionStateShape {
  status?: string | null;
  end_time?: string | null;
  winner_id?: string | null;
}

export const isAuctionLive = (a: AuctionStateShape | null | undefined): boolean => {
  if (!a) return false;
  if (a.status !== "active") return false;
  if (!a.end_time) return false;
  return new Date(a.end_time).getTime() > Date.now();
};

export const isAuctionEnded = (a: AuctionStateShape | null | undefined): boolean => {
  if (!a) return false;
  if (a.status === "ended" || a.status === "sold") return true;
  if (a.end_time && new Date(a.end_time).getTime() <= Date.now()) return true;
  return false;
};

export const isAuctionScheduled = (a: AuctionStateShape | null | undefined): boolean => {
  if (!a) return false;
  return a.status === "scheduled";
};

// Absolute calendar time, e.g. "May 18 · 3:00 PM" — used on cards for
// scheduled auctions so buyers can plan when to come back to bid.
export const formatScheduledStart = (startIso: string): string => {
  const d = new Date(startIso);
  return d.toLocaleString("en-GB", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).replace(",", " ·");
};

// Long format for the auction detail / detail screen banner.
export const formatScheduledStartLong = (startIso: string): string => {
  const d = new Date(startIso);
  return d.toLocaleString("en-GB", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
};

// Member-since helper for the profile screen.
export const formatMonthYear = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};
