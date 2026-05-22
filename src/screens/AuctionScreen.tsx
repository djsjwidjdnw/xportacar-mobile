import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Animated, Easing, Modal, Pressable, ScrollView,
  StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "../components/Button";
import { Spinner } from "../components/Spinner";
import { CurrencyPills } from "../components/CurrencyPills";
import { supabase } from "../lib/supabase";
import { theme, formatRemaining, formatEur } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { useTranslation } from "../lib/i18n";
import { useCurrency } from "../lib/currency";
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

function initials(id: string): string {
  return id.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}

export function AuctionScreen({
  route, navigation,
}: {
  route: { params: { id: string; buyNow?: boolean } };
  navigation: { navigate: (s: string, p?: object) => void };
}) {
  const { id, buyNow: autoBuyNow } = route.params;
  const { user } = useAuth();
  const { t } = useTranslation();
  const { format } = useCurrency();
  const [auction, setAuction] = useState<AuctionFull | null>(null);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [_tick, setTick] = useState(0);

  // Proxy / "up to" bidding state. proxyMax stays in EUR (the schema column
  // is proxy_max_eur), but the UI shows it through the currency formatter.
  const [proxyOn, setProxyOn] = useState(false);
  const [proxyMax, setProxyMax] = useState<number>(0);

  useEffect(() => {
    if (autoBuyNow && auction?.buy_now_price_eur && auction.status === "active") {
      setBuyOpen(true);
    }
  }, [autoBuyNow, auction]);

  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const refresh = useCallback(async () => {
    const [{ data: aRow }, { data: bidRows }] = await Promise.all([
      supabase.from("auctions").select(`*, vehicle:vehicles!vehicle_id(*)`).eq("id", id).single(),
      supabase.from("bids").select("*").eq("auction_id", id).order("created_at", { ascending: false }),
    ]);
    setAuction((aRow as AuctionFull) ?? null);
    setBids((bidRows as BidRow[]) ?? []);
  }, [id]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    const ch = supabase
      .channel(`auction-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bids", filter: `auction_id=eq.${id}` },
        (payload) => {
          const newBid = payload.new as BidRow;
          if (user && newBid.bidder_id !== user.id && bids[0]?.bidder_id === user.id) {
            Alert.alert(t("auction.outbid"), t("auction.outbidBody", { price: formatEur(newBid.amount_eur) }));
          }
          refresh();
        },
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${id}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refresh, bids, user, t]);

  const currentBid = auction?.current_bid_eur ?? auction?.starting_price_eur ?? 0;
  const minNext = currentBid + bidIncrement(currentBid);

  useEffect(() => {
    if (amount < minNext) setAmount(minNext);
    if (proxyMax < minNext + 5_000) setProxyMax(minNext + 5_000);
  }, [minNext, amount, proxyMax]);

  const ended = useMemo(() =>
    !auction || auction.status !== "active" || new Date(auction.end_time).getTime() <= Date.now(),
    [auction],
  );
  const msRemaining = auction ? new Date(auction.end_time).getTime() - Date.now() : 0;
  const urgentCountdown = msRemaining > 0 && msRemaining < 3600_000;
  const isWinning = useMemo(() => !!user && bids[0]?.bidder_id === user.id, [bids, user]);
  const userHasBid = useMemo(() => !!user && bids.some((b) => b.bidder_id === user.id), [bids, user]);

  // If the auction has ended and the current user is the winner, send them
  // to the Won screen so they see the invoice + payment instructions.
  const userIsWinner = !!user && auction && auction.winner_id === user.id;
  useEffect(() => {
    if (ended && userIsWinner && auction?.id) {
      navigation.navigate("AuctionWon", { id: auction.id });
    }
  }, [ended, userIsWinner, auction?.id, navigation]);

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!urgentCountdown) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [urgentCountdown, pulse]);

  const placeBid = async () => {
    if (!user) { Alert.alert("Sign in required", "Sign in to place a bid."); return; }
    if (amount < minNext) { Alert.alert("Bid too low", `Min next bid is ${format(minNext)}.`); return; }
    if (proxyOn && proxyMax < amount) {
      Alert.alert("Proxy too low", "Maximum bid must be at least your current bid amount.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("bids").insert({
      auction_id: id,
      bidder_id: user.id,
      amount_eur: amount,
      is_proxy: proxyOn,
      proxy_max_eur: proxyOn ? proxyMax : null,
    });
    setSubmitting(false);
    if (error) { Alert.alert("Bid failed", error.message); return; }
    if (proxyOn) {
      Alert.alert(
        "Proxy bid placed",
        `We'll auto-bid on your behalf in €500 increments up to ${format(proxyMax)}.`,
      );
    }
    await refresh();
  };

  const buyNow = async () => {
    if (!user || !auction?.buy_now_price_eur) return;
    setSubmitting(true);
    const { error } = await supabase.from("bids").insert({
      auction_id: id, bidder_id: user.id, amount_eur: auction.buy_now_price_eur,
    });
    setSubmitting(false);
    setBuyOpen(false);
    if (error) { Alert.alert("Couldn't complete purchase", error.message); return; }
    navigation.navigate("AuctionWon", { id });
  };

  if (loading) return <Spinner label="Loading auction…" />;
  if (!auction) return <View style={styles.center}><Text>Auction not found.</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Status banner */}
        {userHasBid && (
          <View style={[styles.statusBanner, isWinning ? styles.statusWinning : styles.statusOutbid]}>
            <Ionicons
              name={isWinning ? "trophy" : "alert-circle"}
              size={18}
              color={isWinning ? theme.colors.success : theme.colors.error}
            />
            <Text style={[styles.statusText, { color: isWinning ? theme.colors.success : theme.colors.error }]}>
              {isWinning ? "You're winning!" : "You've been outbid"}
            </Text>
          </View>
        )}

        <Pressable onPress={() => navigation.navigate("VehicleDetail", { id: auction.vehicle_id })}>
          <Text style={styles.vehicleLink}>{auction.vehicle.year} {auction.vehicle.make} {auction.vehicle.model} ›</Text>
        </Pressable>

        {/* Currency switcher */}
        <View style={{ marginBottom: 12, marginTop: 4 }}>
          <CurrencyPills />
        </View>

        {/* Current bid */}
        <View style={styles.bigPriceCard}>
          <Text style={styles.priceLabel}>{t("auction.currentBid")}</Text>
          <Text style={styles.bigPrice}>{format(currentBid)}</Text>
          <Text style={styles.priceSub}>
            {t("auction.bidsBidders", { bids: auction.bid_count, bidders: auction.bidder_count })}
          </Text>
        </View>

        {/* Countdown */}
        <Animated.View style={[
          styles.countdownCard,
          urgentCountdown && { transform: [{ scale: pulse }], borderColor: theme.colors.error, backgroundColor: theme.colors.errorBg },
          { borderWidth: 2 },
        ]}>
          <Ionicons name="time-outline" size={18} color={urgentCountdown ? theme.colors.error : theme.colors.textMuted} />
          <Text style={[styles.countdownText, urgentCountdown && { color: theme.colors.error }]}>
            {ended ? t("auction.ended") : formatRemaining(auction.end_time)}
          </Text>
        </Animated.View>

        {/* Bid input + actions */}
        <View style={styles.bidPanel}>
          <Text style={styles.label}>{t("auction.yourBid")}</Text>
          <Text style={styles.minHint}>{t("auction.minBid", { price: format(minNext) })}</Text>
          <View style={styles.stepRow}>
            <Pressable
              onPress={() => setAmount((a) => Math.max(minNext, a - bidIncrement(a)))}
              style={styles.stepBtn} disabled={ended || submitting}
            >
              <Ionicons name="remove" size={22} color={theme.colors.text} />
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
              style={styles.stepBtn} disabled={ended || submitting}
            >
              <Ionicons name="add" size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          {/* Proxy / maximum bidding ---------- */}
          {!ended && (
            <View style={styles.proxyCard}>
              <View style={styles.proxyHeader}>
                <View style={styles.proxyHeaderLeft}>
                  <Ionicons name="trending-up" size={16} color={theme.colors.brand} />
                  <Text style={styles.proxyTitle}>Set maximum bid</Text>
                </View>
                <Switch
                  value={proxyOn}
                  onValueChange={setProxyOn}
                  trackColor={{ false: theme.colors.border, true: theme.colors.brand }}
                  thumbColor={theme.colors.white}
                  disabled={ended || submitting}
                />
              </View>
              {proxyOn && (
                <>
                  <View style={styles.proxyInputRow}>
                    <Pressable
                      onPress={() => setProxyMax((p) => Math.max(amount, p - 500))}
                      style={styles.proxyStep}
                      disabled={submitting}
                    >
                      <Ionicons name="remove" size={18} color={theme.colors.text} />
                    </Pressable>
                    <TextInput
                      value={String(proxyMax)}
                      onChangeText={(v) => setProxyMax(Math.max(0, Number(v.replace(/[^0-9]/g, "") || 0)))}
                      keyboardType="numeric"
                      style={styles.proxyInput}
                      editable={!submitting}
                    />
                    <Pressable
                      onPress={() => setProxyMax((p) => p + 500)}
                      style={styles.proxyStep}
                      disabled={submitting}
                    >
                      <Ionicons name="add" size={18} color={theme.colors.text} />
                    </Pressable>
                  </View>
                  <Text style={styles.proxyHint}>
                    We&apos;ll bid on your behalf in €500 increments up to{" "}
                    <Text style={styles.proxyHintStrong}>{format(proxyMax)}</Text>. Other bidders won&apos;t see your limit.
                  </Text>
                </>
              )}
            </View>
          )}

          {ended ? (
            <Button label={t("auction.ended")} disabled fullWidth style={{ marginTop: 14 }} />
          ) : (
            <Pressable onPress={placeBid} disabled={submitting}>
              <LinearGradient
                colors={[theme.colors.brand, theme.colors.brandDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[styles.placeBidBtn, submitting && { opacity: 0.7 }]}
              >
                <Ionicons name="hammer-outline" size={16} color={theme.colors.white} />
                <Text style={styles.placeBidText}>{submitting ? t("auction.placing") : t("auction.placeBid")}</Text>
              </LinearGradient>
            </Pressable>
          )}

          {!ended && auction.buy_now_price_eur != null && (
            <Button
              label={t("auction.buyNow", { price: format(auction.buy_now_price_eur) })}
              variant="outline" onPress={() => setBuyOpen(true)} fullWidth style={{ marginTop: 8 }}
            />
          )}
        </View>

        {/* Bid history */}
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <Ionicons name="time-outline" size={16} color={theme.colors.brand} />
            <Text style={styles.historyTitle}>{t("auction.history")}</Text>
          </View>
          {bids.length === 0 ? (
            <Text style={styles.muted}>{t("auction.noBids")}</Text>
          ) : (
            bids.slice(0, 30).map((b, i) => (
              <View key={b.id} style={[styles.bidRow, i === 0 && styles.bidRowTop]}>
                <View style={styles.bidLeft}>
                  <View style={[styles.avatar, b.bidder_id === user?.id && { backgroundColor: theme.colors.brand }]}>
                    <Text style={[styles.avatarText, b.bidder_id === user?.id && { color: theme.colors.white }]}>
                      {initials(b.bidder_id)}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.bidName}>
                      {b.bidder_id === user?.id ? "You" : `Bidder #${b.bidder_id.slice(0, 6)}`}
                      {b.is_proxy && <Text style={styles.proxyTag}>  · proxy</Text>}
                    </Text>
                    {i === 0 && <Text style={styles.topTag}>Top bid</Text>}
                  </View>
                </View>
                <Text style={styles.bidAmount}>{format(b.amount_eur)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Buy Now modal */}
      <Modal visible={buyOpen} transparent animationType="fade" onRequestClose={() => setBuyOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("auction.buyNowQ")}</Text>
            <Text style={styles.modalBody}>
              You&apos;ll purchase {auction.vehicle.year} {auction.vehicle.make} {auction.vehicle.model} for{" "}
              <Text style={{ fontWeight: "800" }}>{format(auction.buy_now_price_eur)}</Text>.
              The auction closes immediately.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Button label="Cancel" variant="outline" onPress={() => setBuyOpen(false)} style={{ flex: 1 }} />
              <Button label={t("auction.buyNowConfirm")} onPress={buyNow} loading={submitting} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  statusBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, marginBottom: 12 },
  statusWinning: { backgroundColor: "#ecfdf3", borderWidth: 1, borderColor: "#a6f4c5" },
  statusOutbid:  { backgroundColor: theme.colors.errorBg,   borderWidth: 1, borderColor: "#fda29b" },
  statusText:    { fontSize: 13, fontWeight: "800" },

  vehicleLink: { color: theme.colors.textMuted, fontSize: 13, marginBottom: 4, fontWeight: "600" },

  bigPriceCard: {
    backgroundColor: theme.colors.white, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: theme.colors.border,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  priceLabel: { fontSize: 11, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  bigPrice:   { fontSize: 44, fontWeight: "800", color: theme.colors.brand, marginTop: 4 },
  priceSub:   { color: theme.colors.textLight, fontSize: 12, marginTop: 4, fontWeight: "600" },

  countdownCard: {
    backgroundColor: theme.colors.white, marginTop: 12, padding: 14, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderColor: theme.colors.border,
  },
  countdownText: { fontSize: 16, fontWeight: "800", color: theme.colors.text },

  bidPanel: {
    backgroundColor: theme.colors.white, marginTop: 12, padding: 18, borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  label:    { fontSize: 11, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  minHint:  { fontSize: 11, color: theme.colors.textLight, marginTop: 4 },
  stepRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  stepBtn:  { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bgAlt },
  bidInput: { flex: 1, height: 48, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 18, fontWeight: "800", color: theme.colors.text, backgroundColor: theme.colors.white, textAlign: "center" },

  // Proxy block
  proxyCard: {
    marginTop: 14, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgAlt, padding: 12,
  },
  proxyHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  proxyHeaderLeft:  { flexDirection: "row", alignItems: "center", gap: 8 },
  proxyTitle:       { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  proxyInputRow:    { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  proxyStep:        { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
  proxyInput:       { flex: 1, height: 36, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, fontWeight: "800", color: theme.colors.text, backgroundColor: theme.colors.white, textAlign: "center" },
  proxyHint:        { fontSize: 11, color: theme.colors.textLight, marginTop: 8, lineHeight: 16 },
  proxyHintStrong:  { color: theme.colors.text, fontWeight: "800" },

  placeBidBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 52, borderRadius: 12, marginTop: 14,
    shadowColor: theme.colors.brand, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  placeBidText: { color: theme.colors.white, fontSize: 16, fontWeight: "800" },

  historyCard: {
    backgroundColor: theme.colors.white, marginTop: 12, borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border, padding: 16,
  },
  historyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  historyTitle:  { fontSize: 14, fontWeight: "800", color: theme.colors.text },

  bidRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  bidRowTop: { borderTopWidth: 0 },
  bidLeft:   { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar:    { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.bgAlt, alignItems: "center", justifyContent: "center" },
  avatarText:{ fontSize: 11, fontWeight: "800", color: theme.colors.textMuted },
  bidName:   { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  proxyTag:  { fontSize: 10, fontWeight: "700", color: theme.colors.brand },
  topTag:    { fontSize: 10, fontWeight: "800", color: theme.colors.success, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
  bidAmount: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  muted:     { color: theme.colors.textLight, fontSize: 13 },

  modalScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard:  { backgroundColor: theme.colors.white, borderRadius: 18, padding: 22, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  modalBody:  { color: theme.colors.textMuted, fontSize: 14, marginTop: 8, lineHeight: 20 },
});
