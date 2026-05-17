import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { VehicleCard, type VehicleListItem } from "../components/VehicleCard";
import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useWatchlist } from "../lib/watchlist";
import { useTranslation } from "../lib/i18n";
import { theme } from "../lib/theme";
import type { VehicleRow, AuctionRow } from "../lib/types";

// Two-step load to avoid PostgREST embed ambiguity:
//   1. fetch the user's watch IDs
//   2. fetch those vehicles with photos + auctions in a single query
// The previous one-step embed (`vehicle:vehicles!vehicle_id(...)`) silently
// returned empty rows in some environments, so we do this defensively.
export function WatchlistScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { ids: watchIds, toggle: toggleWatch, reload } = useWatchlist(user?.id ?? null);
  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (vehicleIds: string[]) => {
    setError(null);
    if (!user) { setLoading(false); return; }
    if (vehicleIds.length === 0) { setItems([]); return; }

    const { data, error: err } = await supabase
      .from("vehicles")
      .select(`
        *,
        vehicle_photos (url, sort_order),
        auctions (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
      `)
      .in("id", vehicleIds);

    if (err) { console.warn("[Watchlist] vehicles error:", err.message); setError(err.message); setItems([]); return; }
    console.log(`[Watchlist] step 2 returned ${(data ?? []).length} vehicles for ${vehicleIds.length} ids`);

    type Row = VehicleRow & {
      vehicle_photos?: { url: string; sort_order: number }[];
      auctions?: AuctionRow[] | AuctionRow | null;
    };
    const pickAuction = (a: Row["auctions"]): AuctionRow | null => {
      if (!a) return null;
      if (Array.isArray(a)) return a[0] ?? null;
      return a;
    };
    const list: VehicleListItem[] = ((data ?? []) as Row[]).map((v) => {
      const photo = (v.vehicle_photos ?? []).sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
      const auction = pickAuction(v.auctions);
      const { vehicle_photos: _vp, auctions: _au, ...rest } = v;
      return { ...(rest as VehicleRow), photo_url: photo, auction };
    });
    setItems(list);
  }, [user]);

  // When watchIds change (initial load, hook toggle), re-fetch the vehicles.
  useEffect(() => {
    load(Array.from(watchIds)).finally(() => setLoading(false));
  }, [watchIds, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reload();
    // reload triggers watchIds change → effect re-fetches.
    setRefreshing(false);
  };

  const onToggle = async (vehicleId: string) => {
    const result = await toggleWatch(vehicleId);
    if (result === "error") Alert.alert("Couldn't update watchlist");
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <EmptyState
          icon="lock-closed-outline"
          title="Sign in to save vehicles"
          body={t("watchlist.signin")}
        />
      </View>
    );
  }
  if (loading) return <Spinner label="Loading watchlist…" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Text style={styles.header}>{t("watchlist.title")}</Text>
      {items.length > 0 && (
        <Text style={styles.count}>{items.length} saved</Text>
      )}
      {error && (
        <View style={styles.errBox}>
          <Text style={styles.errText}>Couldn&apos;t load watchlist: {error}</Text>
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
            isWatching={watchIds.has(item.id)}
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
            title="Your watchlist is empty"
            body="No vehicles saved yet. Browse the marketplace to find your next purchase."
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
