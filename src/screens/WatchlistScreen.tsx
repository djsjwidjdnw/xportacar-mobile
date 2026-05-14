import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { VehicleCard, type VehicleListItem } from "../components/VehicleCard";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { theme } from "../lib/theme";
import type { VehicleRow, AuctionRow } from "../lib/types";

export function WatchlistScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
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

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return <View style={styles.empty}><Text style={styles.muted}>Sign in to use your watchlist.</Text></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Text style={styles.header}>Watchlist</Text>
      <FlatList
        data={items}
        keyExtractor={(v) => v.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.colors.brand} />}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <VehicleCard vehicle={item} onPress={() => navigation.navigate("VehicleDetail", { id: item.id })} />
        )}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.muted}>No vehicles on your watchlist yet.</Text></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 24, fontWeight: "800", color: theme.colors.text, padding: 16, paddingBottom: 4 },
  empty: { padding: 40, alignItems: "center" },
  muted: { color: theme.colors.textLight, textAlign: "center" },
});
