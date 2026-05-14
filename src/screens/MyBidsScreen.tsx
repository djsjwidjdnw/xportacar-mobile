import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
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

export function MyBidsScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<BidWithAuction[]>([]);
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

  useEffect(() => { load(); }, [load]);

  // Reduce to the user's top bid per auction.
  const byAuction = new Map<string, BidWithAuction>();
  for (const r of rows) {
    if (!r.auction) continue;
    const cur = byAuction.get(r.auction.id);
    if (!cur || r.amount_eur > cur.amount_eur) byAuction.set(r.auction.id, r);
  }
  const list = Array.from(byAuction.values());

  if (!user) {
    return <View style={styles.empty}><Text style={styles.muted}>Sign in to track your bids.</Text></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Text style={styles.header}>My bids</Text>
      <FlatList
        data={list}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.colors.brand} />}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const a = item.auction!;
          const winning = item.amount_eur >= (a.current_bid_eur ?? 0);
          const won = a.status === "sold" && a.winner_id === user.id;
          const ended = a.status !== "active";
          const tag = won ? { l: "Won",     bg: theme.colors.successBg, fg: theme.colors.success }
                     : ended ? { l: "Ended", bg: theme.colors.bgAlt, fg: theme.colors.textMuted }
                     : winning ? { l: "Winning", bg: theme.colors.successBg, fg: theme.colors.success }
                     : { l: "Outbid", bg: theme.colors.warningBg, fg: theme.colors.warning };
          return (
            <Pressable onPress={() => navigation.navigate("Auction", { id: a.id })} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {a.vehicle ? `${a.vehicle.year} ${a.vehicle.make} ${a.vehicle.model}` : "—"}
                </Text>
                <Text style={styles.sub}>
                  Your top {formatEur(item.amount_eur)} · Current {formatEur(a.current_bid_eur ?? 0)}
                </Text>
              </View>
              <View style={[styles.tag, { backgroundColor: tag.bg }]}>
                <Text style={[styles.tagText, { color: tag.fg }]}>{tag.l}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.muted}>No bids yet — browse the marketplace.</Text></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 24, fontWeight: "800", color: theme.colors.text, padding: 16, paddingBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: 14, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  sub:   { fontSize: 11, color: theme.colors.textLight, marginTop: 3 },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  tagText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  empty: { padding: 40, alignItems: "center" },
  muted: { color: theme.colors.textLight, textAlign: "center" },
});
