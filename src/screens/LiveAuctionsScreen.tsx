import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { LiveAuctionCard } from "../components/LiveAuctionCard";
import type { VehicleListItem } from "../components/VehicleCard";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { useWatchlist } from "../lib/watchlist";
import { useTranslation } from "../lib/i18n";
import type { AuctionRow, VehicleRow } from "../lib/types";

// Pulls vehicles where the joined auction is currently active. Sorted by
// soonest-ending first so urgency is at the top.
export function LiveAuctionsScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { ids: watchIds, toggle: toggleWatch } = useWatchlist(user?.id ?? null);
  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLive = useCallback(async () => {
    // Inner-join so we only get vehicles whose auction exists, then filter
    // server-side on auction status.
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        *,
        vehicle_photos (url, sort_order),
        auctions!inner (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
      `)
      .eq("auctions.status", "active");
    if (error) { console.warn("[LiveAuctions] query error:", error.message); setItems([]); return; }
    // PostgREST returns an embedded resource as a SINGLE OBJECT (not array)
    // when the FK has a UNIQUE constraint — auctions.vehicle_id is unique,
    // so `v.auctions` is `{ ... }` here, not `[{ ... }]`. Handle both.
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
    // Drop anything that's actually past end_time even though the DB still
    // marks status=active (the cron that ends auctions runs periodically;
    // a stale row would otherwise render as a permanent "00:00:00" card).
    const fresh = list.filter((v) =>
      v.auction && new Date(v.auction.end_time).getTime() > Date.now(),
    );
    // Soonest ending first.
    fresh.sort((a, b) => {
      const ae = a.auction?.end_time;
      const be = b.auction?.end_time;
      if (ae && be) return new Date(ae).getTime() - new Date(be).getTime();
      return 0;
    });
    console.log(`[LiveAuctions] DB returned ${list.length} vehicles; ${fresh.length} still in-window`);
    setItems(fresh);
  }, []);

  useEffect(() => { fetchLive().finally(() => setLoading(false)); }, [fetchLive]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLive();
    setRefreshing(false);
  };

  const onToggle = async (vehicleId: string) => {
    if (!user) { Alert.alert("Sign in required", t("watchlist.signin")); return; }
    const result = await toggleWatch(vehicleId);
    if (result === "error") Alert.alert("Couldn't update watchlist");
  };

  if (loading) return <Spinner label="Loading live auctions…" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
        ListHeaderComponent={
          <View>
            <LinearGradient
              colors={["#039855", "#027a48"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.livePill}>
                  <View style={styles.livePillDot} />
                  <Text style={styles.livePillText}>LIVE NOW</Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>Live Auctions</Text>
              <Text style={styles.heroSubtitle}>Bid right now on vehicles ending soonest.</Text>
              <View style={styles.heroStats}>
                <View>
                  <Text style={styles.heroStatNum}>{items.length}</Text>
                  <Text style={styles.heroStatLabel}>active</Text>
                </View>
                <View style={styles.heroDivider} />
                <View>
                  <Text style={styles.heroStatNum}>
                    {items.reduce((acc, v) => acc + (v.auction?.bid_count ?? 0), 0)}
                  </Text>
                  <Text style={styles.heroStatLabel}>bids today</Text>
                </View>
              </View>
            </LinearGradient>

            {items.length > 0 && (
              <View style={styles.sortRow}>
                <Ionicons name="time-outline" size={14} color={theme.colors.textLight} />
                <Text style={styles.sortText}>Ending soonest first</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <LiveAuctionCard
            vehicle={item}
            isWatching={watchIds.has(item.id)}
            onToggleWatch={user ? () => onToggle(item.id) : undefined}
            onPress={() => navigation.navigate("VehicleDetail", { id: item.id })}
            onBidPress={() => item.auction && navigation.navigate("Auction", { id: item.auction.id })}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="flash-outline"
            title="No live auctions"
            body="No live auctions at the moment. Check back soon — new vehicles go live every week."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 16, padding: 24, borderRadius: 20, marginBottom: 16,
    shadowColor: theme.colors.success, shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  heroTopRow: { flexDirection: "row", marginBottom: 12 },
  livePill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
  },
  livePillDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.white },
  livePillText: { color: theme.colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 1 },

  heroTitle:    { color: theme.colors.white, fontSize: 26, fontWeight: "800" },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4, lineHeight: 18 },
  heroStats:    { flexDirection: "row", alignItems: "center", marginTop: 18 },
  heroStatNum:  { color: theme.colors.white, fontSize: 22, fontWeight: "800" },
  heroStatLabel:{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  heroDivider:  { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 20 },

  sortRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  sortText: { fontSize: 11, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
});
