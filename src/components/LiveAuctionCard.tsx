import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import {
  theme, formatEur, formatCountdown, msRemaining,
  isAuctionLive, isAuctionEnded, thumb,
} from "../lib/theme";
import { useTranslation } from "../lib/i18n";
import type { VehicleListItem } from "./VehicleCard";

// Tick once per second so HH:MM:SS counts down in real-time. Each card
// has its own ticker — 6-12 timers is fine; cleanup runs on unmount.
function useSecondTick() {
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
}

export function LiveAuctionCard({
  vehicle,
  onPress,
  onBidPress,
  isWatching,
  onToggleWatch,
}: {
  vehicle: VehicleListItem;
  onPress: () => void;
  onBidPress: () => void;
  isWatching?: boolean;
  onToggleWatch?: () => void;
}) {
  useSecondTick();
  const { t } = useTranslation();
  const auction = vehicle.auction;
  if (!auction) return null;

  const ms = msRemaining(auction.end_time);
  const urgent = ms > 0 && ms < 3600_000; // last hour
  const ended  = isAuctionEnded(auction);
  const live   = isAuctionLive(auction);
  const countdown = formatCountdown(auction.end_time);
  const currentBid = auction.current_bid_eur ?? auction.starting_price_eur;

  // Pulse the countdown banner when urgent.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!urgent) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.03, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [urgent, pulse]);

  // Heart tap → quick scale bounce (1.0 → 1.3 → 1.0 over 200ms) for tactile feedback.
  const heartScale = useRef(new Animated.Value(1)).current;
  const bounceHeart = () => {
    heartScale.stopAnimation();
    heartScale.setValue(1);
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1.0, duration: 100, useNativeDriver: true }),
    ]).start();
    onToggleWatch?.();
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.96, transform: [{ scale: 0.99 }] }]}
    >
      {/* Photo */}
      <View style={styles.imageWrap}>
        <Image
          source={vehicle.photo_url ? { uri: thumb(vehicle.photo_url, 800) } : require("../../assets/icon.png")}
          style={styles.image}
          // contain (not cover) so the car is centred with whitespace on the
          // neutral bg, never zoomed/cropped.
          contentFit="contain"
          transition={150}
        />
        {ended ? (
          <View style={[styles.statusBadge, styles.endedBadge]}>
            <Ionicons name="lock-closed" size={11} color={theme.colors.white} />
            <Text style={styles.statusText}>{t("card.ended")}</Text>
          </View>
        ) : live ? (
          <View style={[styles.statusBadge, styles.liveBadge]}>
            <View style={styles.liveDot} />
            <Text style={styles.statusText}>{t("card.live")}</Text>
          </View>
        ) : null}
        {onToggleWatch && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); bounceHeart(); }}
            hitSlop={8}
            style={({ pressed }) => [styles.heartBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel={isWatching ? t("card.removeFromWatchlist") : t("card.addToWatchlist")}
          >
            <Animated.View style={{ transform: [{ scale: heartScale }] }}>
              <Ionicons
                name={isWatching ? "heart" : "heart-outline"}
                size={20}
                color={isWatching ? theme.colors.error : theme.colors.textMuted}
              />
            </Animated.View>
          </Pressable>
        )}
      </View>

      {/* HUGE countdown banner — the most prominent thing on the card */}
      <Animated.View
        style={[
          styles.countdownBanner,
          urgent && styles.countdownUrgent,
          ended && styles.countdownEnded,
          { transform: [{ scale: urgent ? pulse : 1 }] },
        ]}
      >
        <Ionicons
          name={ended ? "lock-closed" : "time"}
          size={18}
          color={urgent || ended ? theme.colors.white : theme.colors.text}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.countdownLabel, (urgent || ended) && styles.countdownLabelInverse]}>
            {ended ? t("card.auctionEnded") : urgent ? t("card.endingSoon") : t("card.timeLeft")}
          </Text>
          <Text style={[styles.countdownValue, (urgent || ended) && styles.countdownValueInverse]}>
            {ended ? t("card.closed") : countdown}
          </Text>
        </View>
      </Animated.View>

      {/* Title + price row */}
      <View style={styles.infoRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {`${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? " " + vehicle.trim : ""}`}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {vehicle.exterior_color ?? "—"} · {vehicle.location_city}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.bidLabel}>{ended ? t("card.finalBid") : t("auction.currentBid")}</Text>
          <Text style={styles.bidValue}>{formatEur(currentBid)}</Text>
          <Text style={styles.bidsCount}>
            {auction.bid_count} bid{auction.bid_count === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      {/* Bid Now CTA */}
      <Pressable
        onPress={(e) => { e.stopPropagation(); onBidPress(); }}
        disabled={ended}
        style={({ pressed }) => [pressed && { opacity: 0.92 }]}
      >
        <LinearGradient
          colors={ended ? [theme.colors.bgAlt, theme.colors.bgAlt] : [theme.colors.brand, theme.colors.brandDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bidBtn}
        >
          <Ionicons
            name={ended ? "lock-closed-outline" : "hammer-outline"}
            size={16}
            color={ended ? theme.colors.textMuted : theme.colors.white}
          />
          <Text style={[styles.bidBtnText, ended && { color: theme.colors.textMuted }]}>
            {ended ? t("auction.ended") : t("vehicle.bidNow")}
          </Text>
          {!ended && <Ionicons name="arrow-forward" size={16} color={theme.colors.white} />}
        </LinearGradient>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 16,
    padding: 0,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  imageWrap: { height: 160, backgroundColor: theme.colors.bgAlt, position: "relative" },
  image:     { width: "100%", height: "100%" },

  statusBadge: {
    position: "absolute", top: 12, left: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  liveBadge:  { backgroundColor: theme.colors.success },
  endedBadge: { backgroundColor: theme.colors.error },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.white },
  statusText: { color: theme.colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  heartBtn: {
    position: "absolute", top: 12, right: 12,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // Big timer banner — full-width strip directly under the photo
  countdownBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: theme.colors.bgAlt,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  countdownUrgent: {
    backgroundColor: theme.colors.error,
    borderTopColor: theme.colors.error,
    borderBottomColor: theme.colors.error,
  },
  countdownEnded: {
    backgroundColor: theme.colors.textMuted,
    borderTopColor: theme.colors.textMuted,
    borderBottomColor: theme.colors.textMuted,
  },
  countdownLabel: {
    fontSize: 10, fontWeight: "800", letterSpacing: 1,
    color: theme.colors.textLight, textTransform: "uppercase",
  },
  countdownLabelInverse: { color: "rgba(255,255,255,0.9)" },
  countdownValue: {
    fontSize: 28, fontWeight: "800", color: theme.colors.text,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  countdownValueInverse: { color: theme.colors.white },

  // Info row
  infoRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
  },
  title:    { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textLight, marginTop: 3 },
  bidLabel: { fontSize: 10, fontWeight: "700", color: theme.colors.textLight, textTransform: "uppercase", letterSpacing: 0.4 },
  bidValue: { fontSize: 18, fontWeight: "800", color: theme.colors.brand, marginTop: 2 },
  bidsCount: { fontSize: 11, color: theme.colors.textLight, fontWeight: "600", marginTop: 2 },

  // CTA
  bidBtn: {
    margin: 12, marginTop: 0,
    height: 48, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: theme.colors.brand, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  bidBtnText: { color: theme.colors.white, fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
});
