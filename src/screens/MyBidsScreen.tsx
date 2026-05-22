import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState } from "../components/EmptyState";
import { Spinner } from "../components/Spinner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTranslation } from "../lib/i18n";
import { theme, formatEur, isAuctionLive, isAuctionEnded } from "../lib/theme";

interface BidWithAuction {
  id: string;
  amount_eur: number;
  created_at: string;
  auction: {
    id: string;
    current_bid_eur: number | null;
    status: string;
    end_time: string;
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
          id, current_bid_eur, status, end_time, winner_id,
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
        <EmptyState icon="lock-closed-outline" title={t("bids.signInTitle")} body={t("bids.signInBody")} />
      </View>
    );
  }
  if (loading) return <Spinner label={t("bids.loading")} />;

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
          // Derive accurate state from end_time + winner — don't trust
          // status alone since the DB row may not be flipped yet.
          const ended = isAuctionEnded(a);
          const live = isAuctionLive(a);
          const isWinner = ended && a.winner_id === user.id;
          const winning = !ended && item.amount_eur >= (a.current_bid_eur ?? 0);

          const tag = isWinner
            ? { l: t("bids.won"),     bg: theme.colors.successBg, fg: theme.colors.success, icon: "trophy" as const }
            : ended
            ? { l: t("bids.ended"),   bg: theme.colors.errorBg,   fg: theme.colors.error,   icon: "lock-closed" as const }
            : live && winning
            ? { l: t("bids.winning"), bg: theme.colors.successBg, fg: theme.colors.success, icon: "checkmark-circle" as const }
            : live
            ? { l: t("bids.outbid"),  bg: theme.colors.warningBg, fg: theme.colors.warning, icon: "alert-circle" as const }
            : { l: t("bids.outbid"),  bg: theme.colors.warningBg, fg: theme.colors.warning, icon: "alert-circle" as const };

          return (
            <Pressable
              onPress={() => navigation.navigate("Auction", { id: a.id })}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] }]}
            >
              <View style={styles.topRow}>
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
              </View>

              {/* When the user won this auction, surface an invoice CTA
                  right inline — they should be able to find the payment
                  screen from anywhere in the app. */}
              {isWinner && (
                <Pressable
                  onPress={(e) => { e.stopPropagation(); navigation.navigate("AuctionWon", { id: a.id }); }}
                  style={({ pressed }) => [styles.invoiceShadow, pressed && { opacity: 0.92 }]}
                >
                  <LinearGradient
                    colors={[theme.colors.success, "#027A48"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.invoiceBtn}
                  >
                    <Ionicons name="receipt-outline" size={16} color={theme.colors.white} />
                    <Text style={styles.invoiceText}>{t("bids.viewInvoice")}</Text>
                    <Ionicons name="arrow-forward" size={14} color={theme.colors.white} />
                  </LinearGradient>
                </Pressable>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="flash-outline"
            title={t("bids.emptyTitle")}
            body={t("bids.emptyBody")}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.xl, padding: 16,
    marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  sub:   { fontSize: 12, color: theme.colors.textLight, marginTop: 4 },
  tag:   { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full },
  tagText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },

  invoiceShadow: {
    marginTop: 12, borderRadius: 12,
    shadowColor: theme.colors.success, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  invoiceBtn: {
    height: 44, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  invoiceText: { color: theme.colors.white, fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
});
