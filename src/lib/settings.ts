// The buyer app's one reader of app_settings.bidding_enabled.
//
// XportACar is a fixed-price marketplace: bidding, auctions and counter-offers
// stay in the code but render only when this flag is true, so flipping the DB
// row brings them back without an app update. Defaults to false (fixed price)
// until the row is read, and re-reads at most every 5 minutes.

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const TTL_MS = 5 * 60_000;
let cached: boolean | null = null;
let cachedAt = 0;
let inflight: Promise<boolean> | null = null;

export function fetchBiddingEnabled(): Promise<boolean> {
  if (cached !== null && Date.now() - cachedAt < TTL_MS) return Promise.resolve(cached);
  if (!inflight) {
    inflight = (async () => {
      try {
        const { data, error } = await supabase
          .from("app_settings").select("value").eq("key", "bidding_enabled").maybeSingle();
        if (error) return cached ?? false;
        cached = (data as { value?: unknown } | null)?.value === true;
        cachedAt = Date.now();
        return cached;
      } catch {
        return cached ?? false;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** The flag plus whether it has been read yet (for redirects that must not fire on the default). */
export function useBiddingFlag(): { enabled: boolean; ready: boolean } {
  const [state, setState] = useState(() => ({ enabled: cached ?? false, ready: cached !== null }));
  useEffect(() => {
    let alive = true;
    fetchBiddingEnabled().then((v) => { if (alive) setState({ enabled: v, ready: true }); });
    return () => { alive = false; };
  }, []);
  return state;
}

export function useBiddingEnabled(): boolean {
  return useBiddingFlag().enabled;
}