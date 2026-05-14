// Mobile-side watchlist helpers — wraps the same `watchlist` table as the
// web app.  Exposes a hook that loads the current user's watch set once
// (and exposes a toggle that updates Supabase + local state).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useWatchlist(userId: string | null) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setIds(new Set()); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("watchlist")
      .select("vehicle_id")
      .eq("user_id", userId);
    setIds(new Set(((data ?? []) as { vehicle_id: string }[]).map((r) => r.vehicle_id)));
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (vehicleId: string): Promise<"added" | "removed" | "error"> => {
    if (!userId) return "error";
    const was = ids.has(vehicleId);
    // Optimistic.
    setIds((s) => {
      const next = new Set(s);
      if (was) next.delete(vehicleId); else next.add(vehicleId);
      return next;
    });
    if (was) {
      const { error } = await supabase
        .from("watchlist").delete()
        .eq("user_id", userId).eq("vehicle_id", vehicleId);
      if (error) { setIds((s) => new Set([...s, vehicleId])); return "error"; }
      return "removed";
    }
    const { error } = await supabase
      .from("watchlist").insert({ user_id: userId, vehicle_id: vehicleId });
    if (error) {
      setIds((s) => { const n = new Set(s); n.delete(vehicleId); return n; });
      return "error";
    }
    return "added";
  }, [ids, userId]);

  return { ids, loading, toggle, reload: load };
}
