import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

import { VehicleCard, type VehicleListItem } from "../components/VehicleCard";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { useWatchlist } from "../lib/watchlist";
import { useTranslation } from "../lib/i18n";
import type { AuctionRow, VehicleRow } from "../lib/types";

export function MarketplaceScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t, isRtl } = useTranslation();
  const { ids: watchIds, toggle: toggleWatch } = useWatchlist(user?.id ?? null);
  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const fetchVehicles = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        *,
        vehicle_photos (url, sort_order),
        auctions (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
      `)
      .in("status", ["listed", "in_auction"])
      .order("updated_at", { ascending: false });
    if (error) { setItems([]); return; }
    // deno-lint-ignore no-explicit-any
    const list: VehicleListItem[] = (data as any[]).map((row) => {
      const photos = (row.vehicle_photos ?? []) as { url: string; sort_order: number }[];
      const photo = photos.sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
      const auctions = (row.auctions ?? []) as AuctionRow[];
      const auction = auctions[0] ?? null;
      const { vehicle_photos: _v, auctions: _a, ...rest } = row;
      return { ...(rest as VehicleRow), photo_url: photo, auction };
    });
    list.sort((a, b) => {
      const ae = a.auction?.end_time;
      const be = b.auction?.end_time;
      if (ae && be) return new Date(ae).getTime() - new Date(be).getTime();
      if (ae) return -1;
      if (be) return 1;
      return 0;
    });
    setItems(list);
  }, []);

  useEffect(() => {
    fetchVehicles().finally(() => setLoading(false));
  }, [fetchVehicles]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVehicles();
    setRefreshing(false);
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((v) =>
        `${v.year} ${v.make} ${v.model} ${v.vin} ${v.exterior_color ?? ""}`.toLowerCase().includes(q),
      )
    : items;

  const onToggle = async (vehicleId: string) => {
    if (!user) {
      Alert.alert("Sign in required", t("watchlist.signin"));
      return;
    }
    const result = await toggleWatch(vehicleId);
    if (result === "error") Alert.alert("Couldn't update watchlist");
  };

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1, backgroundColor: theme.colors.bg }]}>
        <ActivityIndicator color={theme.colors.brand} size="large" />
        <Text style={styles.loadingMsg}>{t("marketplace.title")}…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, direction: isRtl ? "rtl" : "ltr" }}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("marketplace.title")}</Text>
        <Text style={styles.subtitle}>
          {t("marketplace.results", { count: filtered.length, total: items.length })}
        </Text>
      </View>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("marketplace.search")}
          placeholderTextColor={theme.colors.textLight}
          style={styles.search}
          autoCapitalize="none"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <VehicleCard
            vehicle={item}
            isWatching={watchIds.has(item.id)}
            onToggleWatch={user ? () => onToggle(item.id) : undefined}
            onPress={() => navigation.navigate("VehicleDetail", { id: item.id })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}><Text style={styles.emptyText}>{t("marketplace.empty")}</Text></View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  loadingMsg: { marginTop: 12, color: theme.colors.textLight, fontSize: 13 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textLight, marginTop: 4 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  search: {
    height: 44, borderRadius: theme.radius.md, borderWidth: 1,
    borderColor: theme.colors.borderStrong, paddingHorizontal: 14, fontSize: 14,
    backgroundColor: theme.colors.white, color: theme.colors.text,
  },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { color: theme.colors.textLight, fontSize: 13 },
});
