// Door-to-door shipping distance from Hamburg port to major EU cities, and the
// pricing helpers shared by the Buy-Now / win flow. Mirrors the web app's
// src/lib/distance.ts — keep the two in sync.
//
//   Standard port shipping ......... €4500 flat (any destination)
//   Door-to-door ................... €4500 + €3.50 / km from Hamburg

export const PORT_FLAT_EUR = 4500;
export const DOOR_PER_KM_EUR = 3.5;
export const OTHER_DEFAULT_KM = 800;

const DISTANCE_KM: Record<string, { _default: number; cities: Record<string, number> }> = {
  germany: {
    _default: 400,
    cities: {
      berlin: 290, munich: 770, hamburg: 0, frankfurt: 490, cologne: 430,
      stuttgart: 670, "düsseldorf": 410, dusseldorf: 410, hannover: 150,
      hanover: 150, leipzig: 380, dresden: 470,
    },
  },
  netherlands: { _default: 460, cities: { amsterdam: 460, rotterdam: 460, "the hague": 480, "den haag": 480 } },
  belgium: { _default: 580, cities: { brussels: 600, antwerp: 560, antwerpen: 560 } },
  austria: { _default: 880, cities: { vienna: 900, wien: 900, salzburg: 850, innsbruck: 870 } },
  france: { _default: 850, cities: { paris: 800, lyon: 1100, strasbourg: 700 } },
  switzerland: { _default: 950, cities: { zurich: 850, "zürich": 850, geneva: 1050, "genève": 1050 } },
  "czech republic": { _default: 600, cities: { prague: 600, praha: 600 } },
  czechia: { _default: 600, cities: { prague: 600, praha: 600 } },
  poland: { _default: 780, cities: { warsaw: 720, warszawa: 720, krakow: 850, "kraków": 850 } },
};

export function distanceFromHamburgKm(country: string | null | undefined, city: string | null | undefined): number {
  const co = (country ?? "").trim().toLowerCase();
  const ci = (city ?? "").trim().toLowerCase();
  const entry = DISTANCE_KM[co];
  if (!entry) return OTHER_DEFAULT_KM;
  if (ci && entry.cities[ci] != null) return entry.cities[ci];
  return entry._default;
}

// Hamburg port (Hamburger Hafen) — origin for door-to-door distance when the
// buyer's address is geocoded (Nominatim lat/lon).
export const HAMBURG_PORT = { lat: 53.5375, lon: 9.9778 };

/** Road-distance estimate (km) from Hamburg port to a lat/lon via Haversine.
 *  Straight-line × 1.3 detour factor to approximate road km (matching the
 *  pre-computed table values which are road km). */
export function distanceFromHamburgCoords(lat: number, lon: number): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - HAMBURG_PORT.lat);
  const dLon = toRad(lon - HAMBURG_PORT.lon);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(HAMBURG_PORT.lat)) * Math.cos(toRad(lat)) * Math.sin(dLon / 2) ** 2;
  const straight = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.max(0, Math.round(straight * 1.3));
}

export type ShippingKind = "standard" | "door_to_door";

export function shippingCostEur(kind: ShippingKind, distanceKm = 0): number {
  if (kind === "standard") return PORT_FLAT_EUR;
  return PORT_FLAT_EUR + Math.round(distanceKm * DOOR_PER_KM_EUR);
}

export function knownCountries(): string[] {
  return Object.keys(DISTANCE_KM)
    .map((c) => c.replace(/\b\w/g, (m) => m.toUpperCase()))
    .sort();
}

export const TUV_EUR = 3570;

export interface ExtraItem { name: string; price_eur: number }

export const AVAILABLE_EXTRAS: ExtraItem[] = [
  { name: "German Registration (TÜV)", price_eur: TUV_EUR },
];
