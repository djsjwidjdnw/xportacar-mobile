import { useEffect, useState } from "react";
import {
  ActivityIndicator, Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";

import { Button } from "../components/Button";
import { supabase } from "../lib/supabase";
import { theme, formatEur, formatKm, formatRemaining } from "../lib/theme";
import type { AuctionRow, VehicleRow, VehicleDamageRow, VehiclePhotoRow } from "../lib/types";

type VehicleFull = VehicleRow & {
  vehicle_photos: VehiclePhotoRow[];
  vehicle_damages: VehicleDamageRow[];
  auctions: AuctionRow[];
};

const SEVERITY_COLOR: Record<string, { bg: string; fg: string }> = {
  cosmetic: { bg: theme.colors.bgAlt,    fg: theme.colors.textMuted },
  minor:    { bg: theme.colors.brandLight, fg: theme.colors.brandDark },
  moderate: { bg: theme.colors.warningBg, fg: theme.colors.warning },
  major:    { bg: theme.colors.errorBg,   fg: theme.colors.error },
};

export function VehicleDetailScreen({
  route, navigation,
}: {
  route: { params: { id: string } };
  navigation: { navigate: (s: string, p?: object) => void };
}) {
  const { id } = route.params;
  const [vehicle, setVehicle] = useState<VehicleFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("vehicles")
        .select(`
          *,
          vehicle_photos (id, vehicle_id, url, sort_order, caption, category),
          vehicle_damages (id, vehicle_id, location, description, severity),
          auctions (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
        `)
        .eq("id", id)
        .single();
      setVehicle((data as VehicleFull) ?? null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.colors.brand} /></View>;
  if (!vehicle) return <View style={styles.center}><Text>Vehicle not found.</Text></View>;

  const photos = (vehicle.vehicle_photos ?? []).sort((a, b) => a.sort_order - b.sort_order);
  const auction = vehicle.auctions?.[0];
  const live = auction?.status === "active";
  const price = live ? (auction?.current_bid_eur ?? auction?.starting_price_eur) : vehicle.listed_price_eur;
  const width = Dimensions.get("window").width;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.bg }} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Carousel */}
      <View>
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <Image source={{ uri: item.url }} style={{ width, height: width * 0.65 }} contentFit="cover" />
          )}
        />
        <View style={styles.dotRow}>
          {photos.map((_, i) => (
            <View key={i} style={[styles.dot, i === photoIndex && { backgroundColor: theme.colors.white, width: 18 }]} />
          ))}
        </View>
        {live && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE · {formatRemaining(auction!.end_time)}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
        <Text style={styles.subtitle}>{vehicle.exterior_color} · {vehicle.interior_color} · {vehicle.location_city}, {vehicle.location_country}</Text>

        {/* Price card */}
        <View style={styles.priceCard}>
          <View>
            <Text style={styles.priceLabel}>{live ? "Current bid" : "Starting price"}</Text>
            <Text style={styles.priceValue}>{formatEur(price)}</Text>
            {auction && <Text style={styles.priceSub}>{auction.bid_count} bids · {auction.bidder_count} bidders</Text>}
          </View>
          {auction && (
            <Button
              label="View auction"
              onPress={() => navigation.navigate("Auction", { id: auction.id })}
              style={{ marginTop: 14 }}
              fullWidth
            />
          )}
        </View>

        {/* Specs */}
        <Section title="Specifications">
          <View style={styles.specGrid}>
            <Spec label="VIN"           value={vehicle.vin} />
            <Spec label="Mileage"       value={formatKm(vehicle.mileage_km)} />
            <Spec label="Fuel"          value={vehicle.fuel_type} />
            <Spec label="Transmission"  value={vehicle.transmission} />
            <Spec label="Body"          value={vehicle.body_type ?? "—"} />
            <Spec label="Exterior"      value={vehicle.exterior_color ?? "—"} />
            <Spec label="Interior"      value={vehicle.interior_color ?? "—"} />
            <Spec label="Listed price"  value={formatEur(vehicle.listed_price_eur)} />
          </View>
        </Section>

        {/* Features */}
        {Array.isArray(vehicle.features) && vehicle.features.length > 0 && (
          <Section title="Features & equipment">
            <View style={styles.tagRow}>
              {vehicle.features.map((f) => (
                <View key={f} style={styles.tag}><Text style={styles.tagText}>{f}</Text></View>
              ))}
            </View>
          </Section>
        )}

        {/* Condition report */}
        <Section title="Condition report">
          {vehicle.vehicle_damages.length === 0 ? (
            <Text style={styles.muted}>No reported damage. Inspected and certified.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {vehicle.vehicle_damages.map((d) => {
                const sev = SEVERITY_COLOR[d.severity] ?? SEVERITY_COLOR.cosmetic;
                return (
                  <View key={d.id} style={styles.damageRow}>
                    <View>
                      <Text style={styles.damageLoc}>{d.location}</Text>
                      <Text style={styles.damageDesc}>{d.description}</Text>
                    </View>
                    <View style={[styles.severity, { backgroundColor: sev.bg }]}>
                      <Text style={[styles.severityText, { color: sev.fg }]}>{d.severity}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Section>

        {vehicle.description && (
          <Section title="Seller notes"><Text style={styles.body14}>{vehicle.description}</Text></Section>
        )}
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specItem}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dotRow: { flexDirection: "row", justifyContent: "center", gap: 4, position: "absolute", bottom: 12, alignSelf: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.55)" },
  liveBadge: {
    position: "absolute", top: 16, left: 16, backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full,
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.error },
  liveText: { fontSize: 11, fontWeight: "800", color: theme.colors.error },
  body: { padding: 20 },
  title: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  subtitle: { color: theme.colors.textLight, marginTop: 4, fontSize: 13 },
  priceCard: { marginTop: 18, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.white, padding: 16 },
  priceLabel: { fontSize: 10, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  priceValue: { fontSize: 28, fontWeight: "800", color: theme.colors.text, marginTop: 2 },
  priceSub: { fontSize: 12, color: theme.colors.textLight, marginTop: 4 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text, marginBottom: 10 },
  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  specItem: { width: "48%", paddingVertical: 8, paddingHorizontal: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
  specLabel: { fontSize: 10, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  specValue: { fontSize: 13, color: theme.colors.text, fontWeight: "600", marginTop: 3, textTransform: "capitalize" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.radius.full, backgroundColor: theme.colors.brandLight },
  tagText: { fontSize: 11, color: theme.colors.brandDark, fontWeight: "600" },
  muted: { color: theme.colors.textLight, fontSize: 13 },
  damageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
  damageLoc: { fontWeight: "700", color: theme.colors.text, fontSize: 13 },
  damageDesc: { color: theme.colors.textLight, fontSize: 12, marginTop: 2 },
  severity: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  severityText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  body14: { fontSize: 14, lineHeight: 22, color: theme.colors.textMuted },
});
