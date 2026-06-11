// Live shipping rates from the admin-editable shipping_rates table, with a
// 1-hour cache and a seeded fallback (used until the migration is applied or
// if the query fails) so the UI always renders.

import { supabase } from "./supabase";

export interface ShippingRate {
  id: string;
  route_key: string;
  origin_port: string | null;
  destination_port: string | null;
  method: string;
  base_price_eur: number;
  rate_pct: number | null;
  transit_days_min: number | null;
  transit_days_max: number | null;
  active: boolean;
  notes: string | null;
  sort_order: number;
}

function r(route_key: string, dest: string, method: string, price: number, dmin: number, dmax: number, sort: number): ShippingRate {
  return { id: route_key, route_key, origin_port: "Dubai (Jebel Ali)", destination_port: dest, method, base_price_eur: price, rate_pct: null, transit_days_min: dmin, transit_days_max: dmax, active: true, notes: method === "roro" ? "Roll-on/Roll-off" : "20ft shared container", sort_order: sort };
}
function svc(route_key: string, method: string, price: number, notes: string, sort: number, dmin: number | null = null, dmax: number | null = null): ShippingRate {
  return { id: route_key, route_key, origin_port: null, destination_port: null, method, base_price_eur: price, rate_pct: null, transit_days_min: dmin, transit_days_max: dmax, active: true, notes, sort_order: sort };
}

export const FALLBACK_RATES: ShippingRate[] = [
  r("roro_hamburg", "Hamburg", "roro", 1450, 28, 35, 10),
  r("roro_rotterdam", "Rotterdam", "roro", 1350, 25, 30, 11),
  r("roro_bremerhaven", "Bremerhaven", "roro", 1450, 28, 35, 12),
  r("roro_antwerp", "Antwerp", "roro", 1400, 25, 32, 13),
  r("roro_genoa", "Genoa", "roro", 1550, 20, 25, 14),
  r("roro_barcelona", "Barcelona", "roro", 1650, 22, 28, 15),
  r("container_hamburg", "Hamburg", "container", 2100, 28, 35, 20),
  r("container_rotterdam", "Rotterdam", "container", 1950, 25, 30, 21),
  r("container_bremerhaven", "Bremerhaven", "container", 2100, 28, 35, 22),
  r("container_genoa", "Genoa", "container", 2300, 20, 25, 23),
  svc("warehouse_dubai", "warehouse", 0, "Warehouse pickup — available immediately", 1),
  svc("door_to_door_eu", "door_to_door", 950, "Door-to-door delivery in the EU", 30, 30, 45),
  svc("service_tuv", "service", 3500, "German Registration (TÜV)", 40),
  { ...svc("service_marine_insurance", "service", 150, "Marine insurance: 1.5% of declared value (min €150)", 41), rate_pct: 1.5 },
  svc("service_customs_export_uae", "service", 250, "UAE export customs clearance", 42),
  svc("service_customs_import_eu", "service", 400, "EU import customs + VAT processing", 43),
];

let cache: { at: number; rates: ShippingRate[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getShippingRates(): Promise<ShippingRate[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rates;
  try {
    const { data, error } = await supabase
      .from("shipping_rates").select("*").eq("active", true).order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) throw new Error("no rates");
    cache = { at: Date.now(), rates: data as ShippingRate[] };
    return cache.rates;
  } catch {
    cache = { at: Date.now(), rates: FALLBACK_RATES };
    return FALLBACK_RATES;
  }
}

export const portRoutes = (rates: ShippingRate[], method: "roro" | "container") =>
  rates.filter((x) => x.method === method && x.active).sort((a, b) => a.sort_order - b.sort_order);
export const serviceRate = (rates: ShippingRate[], key: string) =>
  rates.find((x) => x.route_key === key) ?? null;

// Standard port (RoRo) shipping is a single FLAT rate to any EU destination.
// The per-port routes table stays intact (transit days, port selection) but the
// buyer-facing price is this flat value regardless of which port.
export const PORT_FLAT_EUR = 4500;

// Delivery method is a single choice; German Registration (TÜV) is an additive
// add-on (+€3500) combinable with any method, so it lives as a separate boolean.
export type ShippingMethod =
  | { kind: "warehouse" }
  | { kind: "port"; port: string }
  | { kind: "door" };

export interface ShippingChoice {
  method: ShippingMethod;
  tuv: boolean;
}

export function tuvPriceEur(rates: ShippingRate[] = FALLBACK_RATES): number {
  return serviceRate(rates, "service_tuv")?.base_price_eur ?? 3500;
}

export function getMethodPriceEur(method: ShippingMethod, _rates: ShippingRate[] = FALLBACK_RATES): number {
  switch (method.kind) {
    case "warehouse": return serviceRate(_rates, "warehouse_dubai")?.base_price_eur ?? 0;
    case "door":      return serviceRate(_rates, "door_to_door_eu")?.base_price_eur ?? 800;
    // Standard port (RoRo) shipping is a flat rate to any destination.
    case "port":      return PORT_FLAT_EUR;
  }
}

export function getShippingPriceEur(choice: ShippingChoice, rates: ShippingRate[] = FALLBACK_RATES): number {
  return getMethodPriceEur(choice.method, rates) + (choice.tuv ? tuvPriceEur(rates) : 0);
}

export function describeMethod(method: ShippingMethod): string {
  switch (method.kind) {
    case "warehouse": return "Warehouse Pickup (Dubai)";
    case "port":      return `Nearest Port — ${method.port}`;
    case "door":      return "Door-to-Door Delivery";
  }
}

export function describeShipping(choice: ShippingChoice): string {
  const base = describeMethod(choice.method);
  return choice.tuv ? `${base} + German Registration (TÜV)` : base;
}
