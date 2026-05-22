import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { VehicleCard, type VehicleListItem } from "../components/VehicleCard";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useWatchlist } from "../lib/watchlist";
import { useTranslation } from "../lib/i18n";
import { theme } from "../lib/theme";
import type { VehicleRow, AuctionRow } from "../lib/types";

// Owns its own load (does NOT subscribe to the useWatchlist hook's id Set —
// other screens' instances had stale local state that never propagated here).
// On every focus we re-query both the watchlist table AND the vehicle rows
// so hearts toggled elsewhere always appear when the user opens this tab.
export function WatchlistScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toggle: toggleWatch, reload: reloadIds } = useWatchlist(user?.id ?? null);
  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFromDb = useCallback(async () => {
    if (!user) {
      console.log("[Watchlist] no user, skipping load");
      setItems([]);
      setLoading(false);
      return;
    }
    setError(null);
    console.log("[Watchlist] step 1: fetching watchlist rows for user", user.id);
    const { data: wlRows, error: wlErr } = await supabase
      .from("watchlist")
      .select("vehicle_id")
      .eq("user_id", user.id);
    if (wlErr) {
      console.warn("[Watchlist] watchlist query error:", wlErr.message);
      setError(wlErr.message);
      setItems([]);
      return;
    }
    const ids = ((wlRows ?? []) as { vehicle_id: string }[]).map((r) => r.vehicle_id);
    console.log(`[Watchlist] step 1: got ${ids.length} watchlist ids`, ids);
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    console.log("[Watchlist] step 2: fetching vehicles for ids");
    const { data: vehicles, error: vErr } = await supabase
      .from("vehicles")
      .select(`
        *,
        vehicle_photos (url, sort_order),
        auctions (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
      `)
      .in("id", ids);
    if (vErr) {
      console.warn("[Watchlist] vehicles query error:", vErr.message);
      setError(vErr.message);
      setItems([]);
      return;
    }
    console.log(`[Watchlist] step 2: got ${(vehicles ?? []).length} vehicles for ${ids.length} ids`);

    type Row = VehicleRow & {
      vehicle_photos?: { url: string; sort_order: number }[];
      auctions?: AuctionRow[] | AuctionRow | null;
    };
    const pickAuction = (a: Row["auctions"]): AuctionRow | null => {
      if (!a) return null;
      if (Array.isArray(a)) return a[0] ?? null;
      return a;
    };
    const list: VehicleListItem[] = ((vehicles ?? []) as Row[]).map((v) => {
      const photo = (v.vehicle_photos ?? []).sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
      const auction = pickAuction(v.auctions);
      const { vehicle_photos: _vp, auctions: _au, ...rest } = v;
      return { ...(rest as VehicleRow), photo_url: photo, auction };
    });
    console.log(`[Watchlist] built ${list.length} list items`);
    setItems(list);
  }, [user]);

  // Re-query Supabase every time this tab is focused so hearts toggled on
  // other tabs (Marketplace, vehicle detail) show up immediately.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([reloadIds(), loadFromDb()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadFromDb, reloadIds]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([reloadIds(), loadFromDb()]);
    setRefreshing(false);
  };

  const onToggle = async (vehicleId: string) => {
    const result = await toggleWatch(vehicleId);
    if (result === "error") { Alert.alert(t("watchlist.cantUpdate")); return; }
    // After unwatch, refresh to drop the card from the list.
    await loadFromDb();
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <EmptyState
          icon="lock-closed-outline"
          title={t("watchlist.signInTitle")}
          body={t("watchlist.signin")}
        />
      </View>
    );
  }
  if (loading) return <Spinner label={t("watchlist.loading")} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Text style={styles.header}>{t("watchlist.title")}</Text>
      {items.length > 0 && (
        <Text style={styles.count}>{t("watchlist.savedCount", { count: items.length })}</Text>
      )}
      {error && (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{t("watchlist.errLoad", { error })}</Text>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(v) => v.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
          />
        }
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            isWatching={true}
            onToggleWatch={() => onToggle(item.id)}
            onPress={() => navigation.navigate("VehicleDetail", { id: item.id })}
            onPrimaryAction={() => {
              if (item.auction?.status === "active") {
                navigation.navigate("Auction", { id: item.auction.id });
              } else {
                navigation.navigate("VehicleDetail", { id: item.id });
              }
            }}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title={t("watchlist.emptyTitle")}
            body={t("watchlist.emptyBody")}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 24, fontWeight: "800", color: theme.colors.text, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  count:  { fontSize: 12, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 16, paddingBottom: 8 },
  errBox: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 8, backgroundColor: theme.colors.errorBg, borderWidth: 1, borderColor: "#fda29b" },
  errText:{ color: theme.colors.error, fontSize: 12, fontWeight: "600" },
});
