import { useEffect, useRef } from "react";
import { Image } from "expo-image";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, formatEur, formatKm, formatRemaining, formatScheduledStart } from "../lib/theme";
import type { AuctionRow, VehicleRow } from "../lib/types";

export interface VehicleListItem extends VehicleRow {
  photo_url: string | null;
  auction: AuctionRow | null;
}

export function VehicleCard({
  vehicle,
  onPress,
  isWatching,
  onToggleWatch,
}: {
  vehicle: VehicleListItem;
  onPress: () => void;
  isWatching?: boolean;
  onToggleWatch?: () => void;
}) {
  const live = vehicle.auction?.status === "active";
  const scheduled = vehicle.auction?.status === "scheduled";
  const price = live ? (vehicle.auction?.current_bid_eur ?? vehicle.auction?.starting_price_eur) : vehicle.listed_price_eur;

  // Pulsing green dot on live cards.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, pulse]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] }]}>
      <View style={styles.imageWrap}>
        <Image
          source={vehicle.photo_url ? { uri: vehicle.photo_url } : require("../../assets/icon.png")}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
        {live && (
          <View style={styles.liveBadge}>
            <Animated.View style={[styles.liveDot, { transform: [{ scale: pulse }] }]} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {scheduled && vehicle.auction && (
          <View style={styles.scheduledBadge}>
            <Ionicons name="calendar-outline" size={11} color={theme.colors.white} />
            <Text style={styles.scheduledText}>SCHEDULED</Text>
          </View>
        )}
        {live && vehicle.auction && (
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={12} color={theme.colors.white} />
            <Text style={styles.timerText}>{formatRemaining(vehicle.auction.end_time)}</Text>
          </View>
        )}
        {scheduled && vehicle.auction && (
          <View style={styles.timerBadge}>
            <Ionicons name="calendar-outline" size={12} color={theme.colors.white} />
            <Text style={styles.timerText}>Starts {formatScheduledStart(vehicle.auction.start_time)}</Text>
          </View>
        )}
        {onToggleWatch && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onToggleWatch(); }}
            hitSlop={8}
            style={({ pressed }) => [styles.heartBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel={isWatching ? "Remove from watchlist" : "Add to watchlist"}
          >
            <Ionicons
              name={isWatching ? "heart" : "heart-outline"}
              size={20}
              color={isWatching ? theme.colors.error : theme.colors.textMuted}
            />
          </Pressable>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {vehicle.year} {vehicle.make} {vehicle.model}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {vehicle.exterior_color} · {vehicle.location_city}
        </Text>

        <View style={styles.specRow}>
          <Spec icon="speedometer-outline">{formatKm(vehicle.mileage_km)}</Spec>
          <Spec icon="flash-outline" capitalize>{vehicle.fuel_type}</Spec>
          <Spec icon="cog-outline"   capitalize>{vehicle.transmission}</Spec>
        </View>

        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>
              {live ? "Current bid" : scheduled ? "Starting price" : "Listed price"}
            </Text>
            <Text style={styles.price}>
              {formatEur(scheduled ? vehicle.auction?.starting_price_eur : price)}
            </Text>
          </View>
          {vehicle.auction && live && (
            <Text style={styles.bidsSub}>
              {vehicle.auction.bid_count} bids · {vehicle.auction.bidder_count} bidders
            </Text>
          )}
          {vehicle.auction && scheduled && (
            <View style={styles.scheduleHint}>
              <Ionicons name="time-outline" size={11} color={theme.colors.brand} />
              <Text style={styles.scheduleHintText}>
                {formatScheduledStart(vehicle.auction.start_time)}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function Spec({
  icon, capitalize, children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  capitalize?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.specPill}>
      <Ionicons name={icon} size={11} color={theme.colors.textMuted} />
      <Text style={[styles.spec, capitalize && { textTransform: "capitalize" }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  imageWrap: { height: 200, backgroundColor: theme.colors.bgAlt, position: "relative" },
  image:     { width: "100%", height: "100%" },
  liveBadge: {
    position: "absolute", top: 12, left: 12, backgroundColor: theme.colors.success,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.white },
  liveText:  { color: theme.colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  scheduledBadge: {
    position: "absolute", top: 12, left: 12, backgroundColor: theme.colors.brand,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  scheduledText: { color: theme.colors.white, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  timerBadge:{
    position: "absolute", bottom: 12, right: 12, backgroundColor: "rgba(16,24,40,0.9)",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full,
    flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "75%",
  },
  timerText: { color: theme.colors.white, fontSize: 11, fontWeight: "700" },
  heartBtn:  {
    position: "absolute", top: 12, right: 12,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  body:      { padding: 16 },
  title:     { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  subtitle:  { fontSize: 12, color: theme.colors.textLight, marginTop: 3 },
  specRow:   { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 6, flexWrap: "wrap" },
  specPill:  {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bgAlt,
  },
  spec:      { fontSize: 11, color: theme.colors.textMuted, fontWeight: "600" },
  priceRow:  { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  priceLabel:{ fontSize: 10, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  price:     { fontSize: 20, fontWeight: "800", color: theme.colors.brand, marginTop: 2 },
  bidsSub:   { fontSize: 11, color: theme.colors.textLight, fontWeight: "600" },
  scheduleHint: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: theme.colors.brandLight,
    borderRadius: theme.radius.full,
  },
  scheduleHintText: { fontSize: 10, fontWeight: "800", color: theme.colors.brand },
});
