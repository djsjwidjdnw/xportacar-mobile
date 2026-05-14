import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme, formatEur, formatKm, formatRemaining } from "../lib/theme";
import type { AuctionRow, VehicleRow } from "../lib/types";

export interface VehicleListItem extends VehicleRow {
  photo_url: string | null;
  auction: AuctionRow | null;
}

export function VehicleCard({
  vehicle,
  onPress,
}: {
  vehicle: VehicleListItem;
  onPress: () => void;
}) {
  const live = vehicle.auction?.status === "active";
  const price = live ? (vehicle.auction?.current_bid_eur ?? vehicle.auction?.starting_price_eur) : vehicle.listed_price_eur;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}>
      <View style={styles.imageWrap}>
        <Image
          source={vehicle.photo_url ? { uri: vehicle.photo_url } : require("../../assets/icon.png")}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
        {live && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {live && vehicle.auction && (
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>{formatRemaining(vehicle.auction.end_time)}</Text>
          </View>
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
          <Text style={styles.spec}>{formatKm(vehicle.mileage_km)}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.spec}>{vehicle.fuel_type}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.spec}>{vehicle.transmission}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>{live ? "Current bid" : "Starting price"}</Text>
          <Text style={styles.price}>{formatEur(price)}</Text>
        </View>
        {vehicle.auction && (
          <Text style={styles.bidsSub}>
            {vehicle.auction.bid_count} bids · {vehicle.auction.bidder_count} bidders
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    marginBottom: 16,
  },
  imageWrap: { aspectRatio: 16 / 10, backgroundColor: theme.colors.bgAlt, position: "relative" },
  image: { width: "100%", height: "100%" },
  liveBadge: {
    position: "absolute", top: 10, left: 10, backgroundColor: theme.colors.errorBg,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.error },
  liveText: { color: theme.colors.error, fontSize: 10, fontWeight: "800" },
  timerBadge: {
    position: "absolute", bottom: 10, right: 10, backgroundColor: "rgba(16,24,40,0.85)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
  },
  timerText: { color: theme.colors.white, fontSize: 11, fontWeight: "700" },
  body: { padding: 14 },
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  subtitle: { fontSize: 12, color: theme.colors.textLight, marginTop: 2 },
  specRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 },
  spec: { fontSize: 11, color: theme.colors.textMuted, textTransform: "capitalize" },
  dot:  { fontSize: 11, color: theme.colors.textLight },
  priceRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceLabel: { fontSize: 10, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  price: { fontSize: 17, fontWeight: "800", color: theme.colors.text },
  bidsSub: { marginTop: 4, fontSize: 11, color: theme.colors.textLight },
});
