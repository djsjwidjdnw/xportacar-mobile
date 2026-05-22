import { useEffect, useMemo, useState } from "react";
import {
  Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Spinner } from "../components/Spinner";
import { CurrencyPills } from "../components/CurrencyPills";
import {
  ShippingOptions, type ShippingChoice, describeShipping, getShippingPriceEur,
} from "../components/ShippingOptions";
import { supabase } from "../lib/supabase";
import { theme, formatKm, formatRemaining, formatScheduledStartLong } from "../lib/theme";
import { useCurrency } from "../lib/currency";
import { useTranslation } from "../lib/i18n";
import type { AuctionRow, VehicleRow, VehicleDamageRow, VehiclePhotoRow } from "../lib/types";

type VehicleFull = VehicleRow & {
  vehicle_photos: VehiclePhotoRow[];
  vehicle_damages: VehicleDamageRow[];
  auctions: AuctionRow[];
};

const SEVERITY_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  cosmetic: { bg: "#ecfdf3", fg: theme.colors.success, border: "#a6f4c5" },
  minor:    { bg: theme.colors.warningBg, fg: "#b54708", border: "#fedf89" },
  moderate: { bg: "#fff4ed", fg: "#c4320a", border: "#feb273" },
  major:    { bg: theme.colors.errorBg,   fg: theme.colors.error, border: "#fda29b" },
};

export function VehicleDetailScreen({
  route, navigation,
}: {
  route: { params: { id: string } };
  navigation: { navigate: (s: string, p?: object) => void };
}) {
  const { id } = route.params;
  const { t } = useTranslation();
  const { format } = useCurrency();
  const [vehicle, setVehicle] = useState<VehicleFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [shipping, setShipping] = useState<ShippingChoice>({ kind: "port", port: "Hamburg" });

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

  const photos = useMemo(
    () => (vehicle?.vehicle_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [vehicle],
  );
  const auction = vehicle?.auctions?.[0];
  const live      = auction?.status === "active";
  const scheduled = auction?.status === "scheduled";
  const ended     = auction?.status === "ended" || auction?.status === "sold";

  // Headline price for the sticky bar and "total estimate" — uses raw EUR
  // since formatEur is replaced with the currency-aware format() helper.
  const priceEur = live
    ? (auction?.current_bid_eur ?? auction?.starting_price_eur ?? 0)
    : scheduled
      ? (auction?.starting_price_eur ?? 0)
      : ended
        ? (auction?.current_bid_eur ?? auction?.starting_price_eur ?? 0)
        : (vehicle?.listed_price_eur ?? 0);

  const shippingEur = getShippingPriceEur(shipping);
  const totalEur = priceEur + shippingEur;

  const buyNowAvailable = !!(live && auction?.buy_now_price_eur != null);

  if (loading) return <Spinner label="Loading vehicle…" />;
  if (!vehicle) return <View style={styles.center}><Text>Vehicle not found.</Text></View>;

  const width = Dimensions.get("window").width;
  const goAuction = () => auction && navigation.navigate("Auction", { id: auction.id });
  const goBuyNow  = () => auction && navigation.navigate("Auction", { id: auction.id, buyNow: true });
  const stickyVisible = !!auction;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: stickyVisible ? 140 : 32 }}>
        {/* Carousel */}
        <View>
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Image source={{ uri: item.url }} style={{ width, height: width * 0.72 }} contentFit="cover" />
            )}
          />
          <View style={styles.dotRow}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.dot, i === photoIndex && styles.dotActive]} />
            ))}
          </View>
          {live && auction && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE · {formatRemaining(auction.end_time)}</Text>
            </View>
          )}
          {scheduled && auction && (
            <View style={[styles.liveBadge, { backgroundColor: theme.colors.brand }]}>
              <Ionicons name="calendar-outline" size={11} color={theme.colors.white} />
              <Text style={[styles.liveText, { color: theme.colors.white }]}>SCHEDULED</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>{vehicle.year} {vehicle.make} {vehicle.model}</Text>
          <Text style={styles.subtitle}>
            {vehicle.exterior_color} · {vehicle.interior_color} · {vehicle.location_city}, {vehicle.location_country}
          </Text>

          <View style={{ marginTop: 12 }}>
            <CurrencyPills />
          </View>

          {scheduled && auction && (
            <View style={styles.scheduledCard}>
              <Ionicons name="calendar" size={18} color={theme.colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.scheduledLabel}>{t("vehicle.scheduledShort")}</Text>
                <Text style={styles.scheduledValue}>{formatScheduledStartLong(auction.start_time)}</Text>
              </View>
            </View>
          )}

          {/* Specs */}
          <Section title={t("vehicle.specs")} icon="information-circle-outline">
            <View style={styles.specGrid}>
              <Spec icon="barcode-outline"        label="VIN"          value={vehicle.vin} />
              <Spec icon="speedometer-outline"    label="Mileage"      value={formatKm(vehicle.mileage_km)} />
              <Spec icon="flash-outline"          label="Fuel"         value={vehicle.fuel_type} capitalize />
              <Spec icon="cog-outline"            label="Transmission" value={vehicle.transmission} capitalize />
              <Spec icon="car-sport-outline"      label="Body"         value={vehicle.body_type ?? "—"} />
              <Spec icon="color-palette-outline"  label="Exterior"     value={vehicle.exterior_color ?? "—"} />
              <Spec icon="color-fill-outline"     label="Interior"     value={vehicle.interior_color ?? "—"} />
              <Spec icon="pricetag-outline"       label="Listed price" value={format(vehicle.listed_price_eur)} />
            </View>
          </Section>

          {/* Shipping options selector */}
          <Section title="Shipping & Delivery" icon="boat-outline">
            <Text style={styles.shipSub}>Choose how the vehicle reaches you. Prices reflect the selected currency.</Text>
            <ShippingOptions value={shipping} onChange={setShipping} />

            {/* Live total estimate */}
            <View style={styles.totalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalLabel}>Total estimate</Text>
                <Text style={styles.totalBreakdown}>
                  {format(priceEur)} vehicle + {format(shippingEur)} {describeShipping(shipping)}
                </Text>
              </View>
              <Text style={styles.totalAmount}>{format(totalEur)}</Text>
            </View>
          </Section>

          {/* Features */}
          {Array.isArray(vehicle.features) && vehicle.features.length > 0 && (
            <Section title={t("vehicle.features")} icon="sparkles-outline">
              <View style={styles.tagRow}>
                {vehicle.features.map((f) => (
                  <View key={f} style={styles.tag}>
                    <Ionicons name="checkmark-circle" size={11} color={theme.colors.brand} />
                    <Text style={styles.tagText}>{f}</Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Condition report */}
          <Section title={t("vehicle.condition")} icon="shield-checkmark-outline">
            {vehicle.vehicle_damages.length === 0 ? (
              <View style={styles.cleanReport}>
                <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                <Text style={styles.cleanReportText}>{t("vehicle.noDamage")}</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {vehicle.vehicle_damages.map((d) => {
                  const sev = SEVERITY_COLOR[d.severity] ?? SEVERITY_COLOR.cosmetic;
                  return (
                    <View key={d.id} style={[styles.damageRow, { borderLeftWidth: 4, borderLeftColor: sev.fg }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.damageLoc}>{d.location}</Text>
                        <Text style={styles.damageDesc}>{d.description}</Text>
                      </View>
                      <View style={[styles.severityPill, { backgroundColor: sev.bg, borderColor: sev.border, borderWidth: 1 }]}>
                        <Text style={[styles.severityText, { color: sev.fg }]}>{d.severity}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Section>

          {vehicle.description && (
            <Section title={t("vehicle.sellerNotes")} icon="chatbox-outline">
              <Text style={styles.bodyText}>{vehicle.description}</Text>
            </Section>
          )}
        </View>
      </ScrollView>

      {/* Sticky bottom CTA bar — Bid Now (gradient) + Buy Now (outline) when available */}
      {stickyVisible && (
        <View style={styles.stickyBar}>
          <View style={styles.stickyTop}>
            <Text style={styles.stickyLabel}>
              {live ? t("auction.currentBid") : scheduled ? "Starting price" : ended ? "Final price" : "Listed price"}
            </Text>
            <Text style={styles.stickyPrice}>{format(priceEur)}</Text>
          </View>

          <View style={styles.stickyCtas}>
            {buyNowAvailable && (
              <Pressable
                onPress={goBuyNow}
                style={({ pressed }) => [styles.buyNowBtn, pressed && { opacity: 0.92 }]}
              >
                <Ionicons name="flash" size={16} color={theme.colors.brand} />
                <Text style={styles.buyNowText}>
                  Buy Now {format(auction?.buy_now_price_eur ?? 0)}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={goAuction}
              style={({ pressed }) => [styles.bidNowShadow, pressed && { opacity: 0.92 }]}
            >
              <LinearGradient
                colors={[theme.colors.brand, theme.colors.brandDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.bidNowBtn}
              >
                <Ionicons
                  name={live ? "hammer-outline" : scheduled ? "eye-outline" : "albums-outline"}
                  size={18}
                  color={theme.colors.white}
                />
                <Text style={styles.bidNowText}>
                  {live ? "Bid Now" : scheduled ? "View Auction" : "View Auction"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function Section({
  title, icon, children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={theme.colors.brand} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Spec({
  icon, label, value, capitalize,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <View style={styles.specItem}>
      <Ionicons name={icon} size={14} color={theme.colors.textLight} />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={[styles.specValue, capitalize && { textTransform: "capitalize" }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Carousel
  dotRow: { flexDirection: "row", justifyContent: "center", gap: 4, position: "absolute", bottom: 14, alignSelf: "center" },
  dot:    { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.55)" },
  dotActive: { backgroundColor: theme.colors.white, width: 18 },
  liveBadge: {
    position: "absolute", top: 16, left: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.full,
    flexDirection: "row", alignItems: "center", gap: 6,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  liveDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.success },
  liveText: { fontSize: 11, fontWeight: "800", color: theme.colors.text, letterSpacing: 0.3 },

  // Body
  body: { padding: 20 },
  title: { fontSize: 24, fontWeight: "800", color: theme.colors.text },
  subtitle: { color: theme.colors.textLight, marginTop: 4, fontSize: 13, lineHeight: 18 },

  // Scheduled banner
  scheduledCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: theme.colors.brandLight, borderWidth: 1, borderColor: "#b2ddff",
  },
  scheduledLabel: { fontSize: 10, fontWeight: "800", color: theme.colors.brand, textTransform: "uppercase", letterSpacing: 0.6 },
  scheduledValue: { fontSize: 14, fontWeight: "800", color: theme.colors.text, marginTop: 2 },

  // Section
  section: { marginTop: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },

  // Specs
  specGrid: { gap: 10 },
  specItem: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: theme.colors.white,
    borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border,
  },
  specLabel: { fontSize: 10, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  specValue: { fontSize: 13, color: theme.colors.text, fontWeight: "700", marginTop: 2 },

  // Shipping
  shipSub: { fontSize: 12, color: theme.colors.textLight, marginTop: -6, marginBottom: 12 },
  totalCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 14, padding: 14, borderRadius: 14,
    backgroundColor: theme.colors.brandLight, borderWidth: 1, borderColor: "#b2ddff",
  },
  totalLabel:      { fontSize: 10, color: theme.colors.brand, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  totalBreakdown:  { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, fontWeight: "600" },
  totalAmount:     { fontSize: 20, fontWeight: "800", color: theme.colors.brand },

  // Tags
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandLight,
  },
  tagText: { fontSize: 11, color: theme.colors.brandDark, fontWeight: "700" },

  // Condition
  cleanReport: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, borderRadius: 12, backgroundColor: "#ecfdf3", borderWidth: 1, borderColor: "#a6f4c5",
  },
  cleanReportText: { color: theme.colors.success, fontSize: 13, fontWeight: "600", flex: 1 },
  damageRow: {
    flexDirection: "row", alignItems: "center", padding: 14,
    backgroundColor: theme.colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  damageLoc:  { fontWeight: "800", color: theme.colors.text, fontSize: 13 },
  damageDesc: { color: theme.colors.textLight, fontSize: 12, marginTop: 2 },
  severityPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full },
  severityText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },

  bodyText: { fontSize: 14, lineHeight: 22, color: theme.colors.textMuted },

  // Sticky bottom bar
  stickyBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: theme.colors.white,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
    paddingTop: 12, paddingBottom: 22, paddingHorizontal: 16,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  stickyTop:   { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  stickyLabel: { fontSize: 10, color: theme.colors.textLight, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  stickyPrice: { fontSize: 22, fontWeight: "800", color: theme.colors.brand },
  stickyCtas:  { flexDirection: "row", gap: 8 },
  buyNowBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    flex: 1, height: 52, borderRadius: 14,
    borderWidth: 1.5, borderColor: theme.colors.brand, backgroundColor: theme.colors.white,
  },
  buyNowText: { color: theme.colors.brand, fontSize: 14, fontWeight: "800" },
  bidNowShadow: {
    flex: 1, borderRadius: 14,
    shadowColor: theme.colors.brand, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  bidNowBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 52, borderRadius: 14,
  },
  bidNowText: { color: theme.colors.white, fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
});
