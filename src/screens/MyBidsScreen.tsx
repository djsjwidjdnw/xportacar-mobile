import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTranslation } from "../lib/i18n";
import { theme, formatEur } from "../lib/theme";

interface BidWithAuction {
  id: string;
  amount_eur: number;
  created_at: string;
  auction: {
    id: string;
    current_bid_eur: number | null;
    status: string;
    winner_id: string | null;
    vehicle: { id: string; year: number; make: string; model: string } | null;
  } | null;
}

// Full bid history surfaced from the Profile tab's "See All" link.
export function MyBidsScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<BidWithAuction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("bids")
      .select(`
        id, amount_eur, created_at,
        auction:auctions!auction_id (
          id, current_bid_eur, status, winner_id,
          vehicle:vehicles!vehicle_id (id, year, make, model)
        )
      `)
      .eq("bidder_id", user.id)
      .order("created_at", { ascending: false });
    setRows((data as unknown as BidWithAuction[]) ?? []);
  }, [user]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  // Reduce to the user's top bid per auction so "Winning/Outbid/Won" is
  // computed against the actual current standing, not every prior bid.
  const byAuction = new Map<string, BidWithAuction>();
  for (const r of rows) {
    if (!r.auction) continue;
    const cur = byAuction.get(r.auction.id);
    if (!cur || r.amount_eur > cur.amount_eur) byAuction.set(r.auction.id, r);
  }
  const list = Array.from(byAuction.values());

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <EmptyState icon="lock-closed-outline" title="Sign in to track your bids" body="Create an account or log in to see auctions you're bidding on." />
      </View>
    );
  }
  if (loading) return <Spinner label="Loading your bids…" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
          />
        }
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        renderItem={({ item }) => {
          const a = item.auction!;
          const winning = item.amount_eur >= (a.current_bid_eur ?? 0);
          const won = a.status === "sold" && a.winner_id === user.id;
          const ended = a.status !== "active";
          const tag = won
            ? { l: t("bids.won"),     bg: theme.colors.successBg, fg: theme.colors.success, icon: "trophy" as const }
            : ended
            ? { l: t("bids.ended"),   bg: theme.colors.bgAlt,     fg: theme.colors.textMuted, icon: "time-outline" as const }
            : winning
            ? { l: t("bids.winning"), bg: theme.colors.successBg, fg: theme.colors.success, icon: "checkmark-circle" as const }
            : { l: t("bids.outbid"),  bg: theme.colors.warningBg, fg: theme.colors.warning, icon: "alert-circle" as const };
          return (
            <Pressable
              onPress={() => navigation.navigate("Auction", { id: a.id })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {a.vehicle ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}` : "—"}
                </Text>
                <Text style={styles.sub}>
                  {t("bids.topAndCurr", { top: formatEur(item.amount_eur), current: formatEur(a.current_bid_eur ?? 0) })}
                </Text>
              </View>
              <View style={[styles.tag, { backgroundColor: tag.bg }]}>
                <Ionicons name={tag.icon} size={12} color={tag.fg} />
                <Text style={[styles.tagText, { color: tag.fg }]}>{tag.l}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="flash-outline"
            title="No bids yet"
            body="You haven't placed any bids yet. Explore live auctions to get started."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl, padding: 16,
    marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  title: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  sub:   { fontSize: 12, color: theme.colors.textLight, marginTop: 4 },
  tag:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full },
  tagText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
});
