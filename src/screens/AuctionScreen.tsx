import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";

import { Button } from "../components/Button";
import { supabase } from "../lib/supabase";
import { theme, formatEur, formatRemaining } from "../lib/theme";
import { useAuth } from "../lib/auth";
import type { AuctionRow, BidRow, VehicleRow } from "../lib/types";

interface AuctionFull extends AuctionRow {
  vehicle: VehicleRow;
}

function bidIncrement(curr: number): number {
  if (curr < 5_000)   return 100;
  if (curr < 25_000)  return 250;
  if (curr < 75_000)  return 500;
  if (curr < 250_000) return 1_000;
  return 2_500;
}

export function AuctionScreen({
  route, navigation,
}: {
  route: { params: { id: string } };
  navigation: { navigate: (s: string, p?: object) => void };
}) {
  const { id } = route.params;
  const { user } = useAuth();
  const [auction, setAuction] = useState<AuctionFull | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [_tick, setTick] = useState(0);

  // 1s tick so countdown updates.
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const refresh = useCallback(async () => {
    const [{ data: aRow }, { data: bidRows }] = await Promise.all([
      supabase
        .from("auctions")
        .select(`*, vehicle:vehicles!vehicle_id(*)`)
        .eq("id", id)
        .single(),
      supabase
        .from("bids")
        .select("*")
        .eq("auction_id", id)
        .order("created_at", { ascending: false }),
    ]);
    setAuction((aRow as AuctionFull) ?? null);
    setBids((bidRows as BidRow[]) ?? []);
  }, [id]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // Realtime: update on new bids and auction status updates.
    const ch = supabase
      .channel(`auction-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bids", filter: `auction_id=eq.${id}` },
        (payload) => {
          // Outbid detection — fire BEFORE the refresh races.  If the new
          // bid is not ours AND we were the previous top bidder, alert.
          const newBid = payload.new as BidRow;
          if (
            user &&
            newBid.bidder_id !== user.id &&
            bids[0]?.bidder_id === user.id
          ) {
            Alert.alert(
              "You were outbid",
              `New top bid: ${formatEur(newBid.amount_eur)}`,
            );
          }
          refresh();
        },
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refresh, bids, user]);

  const currentBid = auction?.current_bid_eur ?? auction?.starting_price_eur ?? 0;
  const minNext = currentBid + bidIncrement(currentBid);

  useEffect(() => {
    if (amount < minNext) setAmount(minNext);
  }, [minNext, amount]);

  const ended = useMemo(() =>
    !auction || auction.status !== "active" || new Date(auction.end_time).getTime() <= Date.now(),
    [auction],
  );

  const isWinning = useMemo(
    () => user && bids[0]?.bidder_id === user.id,
    [bids, user],
  );

  const placeBid = async () => {
    if (!user) { Alert.alert("Sign in required", "Sign in to place a bid."); return; }
    if (amount < minNext) {
      Alert.alert("Bid too low", `Min next bid is ${formatEur(minNext)}.`);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("bids")
      .insert({ auction_id: id, bidder_id: user.id, amount_eur: amount });
    setSubmitting(false);
    if (error) {
      Alert.alert("Bid failed", error.message);
      return;
    }
    await refresh();
  };

  const buyNow = async () => {
    if (!user || !auction?.buy_now_price_eur) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("bids")
      .insert({ auction_id: id, bidder_id: user.id, amount_eur: auction.buy_now_price_eur });
    setSubmitting(false);
    setBuyOpen(false);
    if (error) {
      Alert.alert("Couldn't complete purchase", error.message);
      return;
    }
    Alert.alert("You won!", "Your purchase has been recorded. Our team will follow up.");
    await refresh();
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;
  if (!auction) return <View style={styles.center}><Text>Auction not found.</Text></View>;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Pressable onPress={() => navigation.navigate("VehicleDetail", { id: auction.vehicle_id })}>
        <Text style={styles.backLink}>← {auction.vehicle.year} {auction.vehicle.make} {auction.vehicle.model}</Text>
      </Pressable>

      {/* Status + countdown */}
      <View style={styles.statusRow}>
        {auction.status === "active" && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        <Text style={styles.countdown}>{formatRemaining(auction.end_time)}</Text>
        {!!isWinning && <View style={[styles.tag, { backgroundColor: theme.colors.successBg }]}><Text style={[styles.tagText, { color: theme.colors.success }]}>You are winning</Text></View>}
      </View>

      {/* Bid panel */}
      <View style={styles.card}>
        <Text style={styles.label}>Current bid</Text>
        <Text style={styles.bigPrice}>{formatEur(currentBid)}</Text>
        <Text style={styles.sub}>
          {auction.bid_count} bids · {auction.bidder_count} bidders
        </Text>

        <Text style={[styles.label, { marginTop: 18 }]}>Your bid</Text>
        <Text style={styles.minHint}>Min next bid: {formatEur(minNext)}</Text>
        <View style={styles.stepRow}>
          <Pressable
            onPress={() => setAmount((a) => Math.max(minNext, a - bidIncrement(a)))}
            style={styles.stepBtn}
            disabled={ended || submitting}
          >
            <Text style={styles.stepBtnText}>−</Text>
          </Pressable>
          <TextInput
            value={String(amount)}
            onChangeText={(v) => setAmount(Math.max(0, Number(v.replace(/[^0-9]/g, "") || 0)))}
            keyboardType="numeric"
            style={styles.bidInput}
            editable={!ended && !submitting}
          />
          <Pressable
            onPress={() => setAmount((a) => a + bidIncrement(a))}
            style={styles.stepBtn}
            disabled={ended || submitting}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>

        {ended ? (
          <Button label="Auction ended" disabled fullWidth style={{ marginTop: 14 }} />
        ) : (
          <Button label={submitting ? "Placing…" : "Place bid"} onPress={placeBid} loading={submitting} fullWidth style={{ marginTop: 14 }} />
        )}

        {!ended && auction.buy_now_price_eur != null && (
          <Button
            label={`Buy now · ${formatEur(auction.buy_now_price_eur)}`}
            variant="outline"
            onPress={() => setBuyOpen(true)}
            fullWidth
            style={{ marginTop: 8 }}
          />
        )}
      </View>

      {/* Bid history */}
      <View style={[styles.card, { marginTop: 16, paddingHorizontal: 0 }]}>
        <Text style={[styles.label, { paddingHorizontal: 16 }]}>Bid history</Text>
        {bids.length === 0 ? (
          <Text style={[styles.muted, { paddingHorizontal: 16, paddingVertical: 8 }]}>No bids yet.</Text>
        ) : (
          <View style={{ marginTop: 8 }}>
            {bids.slice(0, 30).map((b, i) => (
              <View key={b.id} style={[
                styles.bidRow,
                i === 0 && { backgroundColor: theme.colors.successBg },
              ]}>
                <Text style={styles.bidId}>{b.is_proxy ? "Proxy bidder" : "Bidder"} #{b.bidder_id.slice(0, 6)}</Text>
                <Text style={styles.bidAmount}>{formatEur(b.amount_eur)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Buy Now dialog */}
      <Modal visible={buyOpen} transparent animationType="fade" onRequestClose={() => setBuyOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Buy now?</Text>
            <Text style={styles.modalBody}>
              You&apos;ll purchase {auction.vehicle.year} {auction.vehicle.make} {auction.vehicle.model} for{" "}
              <Text style={{ fontWeight: "800" }}>{formatEur(auction.buy_now_price_eur)}</Text>.
              The auction closes immediately.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Button label="Cancel" variant="outline" onPress={() => setBuyOpen(false)} style={{ flex: 1 }} />
              <Button label="Yes, buy" onPress={buyNow} loading={submitting} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  backLink: { color: theme.colors.textLight, marginBottom: 12 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.colors.errorBg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.error },
  liveText: { color: theme.colors.error, fontSize: 11, fontWeight: "800" },
  countdown: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full },
  tagText: { fontSize: 11, fontWeight: "800" },
  card: { backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: 16 },
  label: { fontSize: 10, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  bigPrice: { fontSize: 34, fontWeight: "800", color: theme.colors.text },
  sub: { color: theme.colors.textLight, fontSize: 12, marginTop: 4 },
  minHint: { fontSize: 11, color: theme.colors.textLight, marginTop: 4 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  stepBtn: { width: 44, height: 44, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white },
  stepBtnText: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  bidInput: { flex: 1, height: 44, borderWidth: 1, borderColor: theme.colors.borderStrong, borderRadius: theme.radius.md, paddingHorizontal: 12, fontSize: 16, fontWeight: "700", color: theme.colors.text, backgroundColor: theme.colors.white },
  bidRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.border },
  bidId: { color: theme.colors.textMuted, fontSize: 12 },
  bidAmount: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  muted: { color: theme.colors.textLight, fontSize: 13 },
  modalScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: theme.colors.white, borderRadius: theme.radius.xl, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  modalBody: { color: theme.colors.textMuted, fontSize: 14, marginTop: 8, lineHeight: 20 },
});
