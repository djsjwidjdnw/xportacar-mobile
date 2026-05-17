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

export function WatchlistScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { ids: watchIds, toggle: toggleWatch, reload } = useWatchlist(user?.id ?? null);
  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("watchlist")
      .select(`
        vehicle:vehicles!vehicle_id (
          *,
          vehicle_photos (url, sort_order),
          auctions (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
        )
      `)
      .eq("user_id", user.id);
    // deno-lint-ignore no-explicit-any
    const list: VehicleListItem[] = ((data as any[]) ?? [])
      .map((row) => row.vehicle).filter(Boolean)
      .map((v: VehicleRow & { vehicle_photos?: { url: string; sort_order: number }[]; auctions?: AuctionRow[] }) => {
        const photo = (v.vehicle_photos ?? []).sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
        const auction = v.auctions?.[0] ?? null;
        const { vehicle_photos: _vp, auctions: _au, ...rest } = v;
        return { ...(rest as VehicleRow), photo_url: photo, auction };
      });
    setItems(list);
  }, [user]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // When the watchlist set updates from anywhere (heart toggle), re-pull.
  useEffect(() => {
    // Keep `items` in sync with `watchIds` by filtering out removed entries
    // immediately so the UI feels instant.
    setItems((prev) => prev.filter((v) => watchIds.has(v.id)));
  }, [watchIds]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([reload(), load()]);
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
  header: { fontSize: 24, fontWeight: "800", color: theme.colors.text, padding: 16, paddingBottom: 4 },
});
