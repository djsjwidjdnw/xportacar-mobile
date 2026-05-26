import { useEffect, useMemo, useState } from "react";
import {
  Dimensions, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Spinner } from "../components/Spinner";
import { CurrencyPills } from "../components/CurrencyPills";
import {
  ShippingOptions, type ShippingChoice, describeShipping, getShippingPriceEur,
} from "../components/ShippingOptions";
import { getShippingRates, FALLBACK_RATES, type ShippingRate } from "../lib/shipping";
import { estimateValuation, pricePosition, type Valuation } from "../lib/valuation";
import { supabase } from "../lib/supabase";
import {
  theme, formatKm, formatRemaining, formatScheduledStartLong,
  isAuctionLive, isAuctionEnded, isAuctionScheduled,
} from "../lib/theme";
import { useCurrency } from "../lib/currency";
import { useTranslation } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import type { AuctionRow, VehicleRow, VehicleDamageRow, VehiclePhotoRow } from "../lib/types";

// PostgREST returns the embedded `auctions` row as an OBJECT (not an
// array) when the parent FK is unique, which auctions.vehicle_id is. We
// accept both shapes and normalize once when reading from the response —
// otherwise `vehicle.auctions?.[0]` silently resolves to undefined and
// the sticky Bid Now / Buy Now CTA never renders.
type VehicleFull = VehicleRow & {
  vehicle_photos: VehiclePhotoRow[];
  vehicle_damages: VehicleDamageRow[];
  auctions: AuctionRow[] | AuctionRow | null;
};

function pickAuction(a: VehicleFull["auctions"]): AuctionRow | null {
  if (!a) return null;
  if (Array.isArray(a)) return a[0] ?? null;
  return a;
}

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
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<VehicleFull | null>(null);
  const [auction, setAuction] = useState<AuctionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [shipping, setShipping] = useState<ShippingChoice>({ kind: "port", port: "Hamburg" });
  const [reportOpen, setReportOpen] = useState(false);
  const [shipRates, setShipRates] = useState<ShippingRate[]>(FALLBACK_RATES);
  useEffect(() => { let on = true; getShippingRates().then((r) => { if (on) setShipRates(r); }); return () => { on = false; }; }, []);

  useEffect(() => {
    (async () => {
      // Load the vehicle + its embedded photos/damages in one trip…
      const { data, error } = await supabase
        .from("vehicles")
        .select(`
          *,
          vehicle_photos (id, vehicle_id, url, sort_order, caption, category),
          vehicle_damages (id, vehicle_id, location, description, severity, photo_url),
          auctions (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
        `)
        .eq("id", id)
        .single();

      const v = (data as VehicleFull) ?? null;
      setVehicle(v);

      // …then fall back to a direct auctions query if the embed didn't
      // return one. Belt-and-braces because PostgREST sometimes returns
      // the embed as an empty object when RLS hides the row.
      let a = pickAuction(v?.auctions);
      if (!a && !error) {
        const { data: ar } = await supabase
          .from("auctions")
          .select("id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id")
          .eq("vehicle_id", id)
          .order("end_time", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ar) a = ar as AuctionRow;
      }
      setAuction(a);
      // Diagnostic — surfaces in Metro logs so we can confirm the auction
      // payload reached the screen. Remove once the sticky CTA is stable.
      // eslint-disable-next-line no-console
      console.log("[VehicleDetail] AUCTION DATA:", JSON.stringify(a));
      setLoading(false);
    })();
  }, [id]);

  const photos = useMemo(
    () => (vehicle?.vehicle_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order),
    [vehicle],
  );
  // Compute live/scheduled/ended from end_time + status so the sticky CTA
  // and badges stay accurate when the DB row hasn't flipped to "ended" yet.
  const live      = isAuctionLive(auction);
  const scheduled = isAuctionScheduled(auction);
  const ended     = isAuctionEnded(auction);

  // Headline price for the sticky bar and "total estimate" — uses raw EUR
  // since formatEur is replaced with the currency-aware format() helper.
  const priceEur = live
    ? (auction?.current_bid_eur ?? auction?.starting_price_eur ?? 0)
    : scheduled
      ? (auction?.starting_price_eur ?? 0)
      : ended
        ? (auction?.current_bid_eur ?? auction?.starting_price_eur ?? 0)
        : (vehicle?.listed_price_eur ?? 0);

  const shippingEur = getShippingPriceEur(shipping, shipRates);
  const totalEur = priceEur + shippingEur;

  // Market valuation (currency-aware via format()).
  const valuation = useMemo<Valuation | null>(
    () => (vehicle ? estimateValuation({ make: vehicle.make, model: vehicle.model, year: vehicle.year, mileageKm: vehicle.mileage_km }) : null),
    [vehicle],
  );
  const mvPos = valuation ? pricePosition(priceEur, valuation) : "unknown";
  const mvPct = valuation ? Math.min(96, Math.max(4, ((priceEur - valuation.minEur) / Math.max(1, valuation.maxEur - valuation.minEur)) * 100)) : 0;
  const mvColor = mvPos === "fair" ? theme.colors.success : mvPos === "below" ? theme.colors.warning : mvPos === "above" ? theme.colors.error : theme.colors.textMuted;

  const buyNowAvailable = !!(live && auction?.buy_now_price_eur != null);
  const userWonThis = !!(ended && user && auction && auction.winner_id === user.id);

  if (loading) return <Spinner label={t("vehicle.loading")} />;
  if (!vehicle) return <View style={styles.center}><Text>{t("vehicle.notFound")}</Text></View>;

  const width = Dimensions.get("window").width;
  const goAuction = () => auction && navigation.navigate("Auction", { id: auction.id });
  const goBuyNow  = () => auction && navigation.navigate("Auction", { id: auction.id, buyNow: true });
  const goInvoice = () => auction && navigation.navigate("AuctionWon", { id: auction.id });
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
              <Spec icon="barcode-outline"        label={t("vehicle.specVin")}          value={vehicle.vin} />
              <Spec icon="speedometer-outline"    label={t("vehicle.specMileage")}      value={formatKm(vehicle.mileage_km)} />
              <Spec icon="flash-outline"          label={t("vehicle.specFuel")}         value={vehicle.fuel_type} capitalize />
              <Spec icon="cog-outline"            label={t("vehicle.specTransmission")} value={vehicle.transmission} capitalize />
              <Spec icon="car-sport-outline"      label={t("vehicle.specBody")}         value={vehicle.body_type ?? "—"} />
              <Spec icon="color-palette-outline"  label={t("vehicle.specExterior")}     value={vehicle.exterior_color ?? "—"} />
              <Spec icon="color-fill-outline"     label={t("vehicle.specInterior")}     value={vehicle.interior_color ?? "—"} />
              <Spec icon="pricetag-outline"       label={t("vehicle.specListedPrice")}  value={format(vehicle.listed_price_eur)} />
            </View>
          </Section>

          {/* Market value */}
          {valuation && (
            <Section title="Market value" icon="trending-up-outline">
              <View style={styles.mvCard}>
                <Text style={styles.mvAvg}>{format(valuation.avgEur)}</Text>
                <Text style={styles.mvAvgLabel}>average market value</Text>
                <View style={styles.mvTrack}>
                  <View style={[styles.mvMarker, { left: `${mvPct}%`, backgroundColor: mvColor }]} />
                </View>
                <View style={styles.mvRow}>
                  <Text style={styles.mvMinMax}>Min {format(valuation.minEur)}</Text>
                  <Text style={styles.mvMinMax}>Max {format(valuation.maxEur)}</Text>
                </View>
                <Text style={styles.mvNote}>
                  {valuation.source === "market_data"
                    ? `Based on ${valuation.dataPoints} comparable listings across EU markets`
                    : "Estimated market value"}
                </Text>
              </View>
            </Section>
          )}

          {/* Shipping options selector */}
          <Section title={t("vehicle.shipping")} icon="boat-outline">
            <Text style={styles.shipSub}>{t("vehicle.shippingChoose")}</Text>
            <ShippingOptions value={shipping} onChange={setShipping} rates={shipRates} />

            {/* Live total estimate */}
            <View style={styles.totalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.totalLabel}>{t("vehicle.totalEstimate")}</Text>
                <Text style={styles.totalBreakdown}>
                  {t("vehicle.totalBreakdown", {
                    price: format(priceEur),
                    shipping: format(shippingEur),
                    method: describeShipping(shipping),
                  })}
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

          {/* Condition report — tap anywhere to open the full inspection report */}
          <Section title={t("vehicle.condition")} icon="shield-checkmark-outline">
            <Pressable onPress={() => setReportOpen(true)} style={({ pressed }) => pressed && { opacity: 0.9 }}>
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
                        {d.photo_url ? (
                          <Image source={{ uri: d.photo_url }} style={styles.damageThumb} contentFit="cover" />
                        ) : null}
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
              <View style={styles.viewReportRow}>
                <Ionicons name="images-outline" size={16} color={theme.colors.brand} />
                <Text style={styles.viewReportText}>View full inspection report</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.brand} />
              </View>
            </Pressable>
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
              {live ? t("auction.currentBid")
                : scheduled ? t("vehicle.startingPrice")
                : ended ? t("vehicle.finalPrice")
                : t("vehicle.listedPrice")}
            </Text>
            <Text style={styles.stickyPrice}>{format(priceEur)}</Text>
          </View>

          <View style={styles.stickyCtas}>
            {/* When the user is the winner of an ended auction, surface a
                View Invoice CTA so they can find the payment screen. */}
            {userWonThis ? (
              <Pressable
                onPress={goInvoice}
                style={({ pressed }) => [styles.bidNowShadow, pressed && { opacity: 0.92 }]}
              >
                <LinearGradient
                  colors={[theme.colors.success, "#027A48"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.bidNowBtn}
                >
                  <Ionicons name="receipt-outline" size={18} color={theme.colors.white} />
                  <Text style={styles.bidNowText}>{t("vehicle.viewInvoice")}</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <>
                {buyNowAvailable && (
                  <Pressable
                    onPress={goBuyNow}
                    style={({ pressed }) => [styles.buyNowBtn, pressed && { opacity: 0.92 }]}
                  >
                    <Ionicons name="flash" size={16} color={theme.colors.brand} />
                    <Text style={styles.buyNowText} numberOfLines={1}>
                      {t("vehicle.buyNowPrice", { price: format(auction?.buy_now_price_eur ?? 0) })}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={goAuction}
                  style={({ pressed }) => [styles.bidNowShadow, pressed && { opacity: 0.92 }]}
                >
                  <LinearGradient
                    colors={live ? [theme.colors.brand, theme.colors.brandDark] : [theme.colors.textMuted, theme.colors.textMuted]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.bidNowBtn}
                  >
                    <Ionicons
                      name={live ? "hammer-outline" : scheduled ? "eye-outline" : "albums-outline"}
                      size={18}
                      color={theme.colors.white}
                    />
                    <Text style={styles.bidNowText}>
                      {live ? t("vehicle.bidNow")
                        : scheduled ? t("vehicle.viewAuction")
                        : ended ? t("vehicle.viewResult")
                        : t("vehicle.viewAuction")}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      <InspectionReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        vehicle={vehicle}
        photos={photos}
        damages={vehicle.vehicle_damages}
      />
    </View>
  );
}

function InspectionReportModal({
  visible, onClose, vehicle, photos, damages,
}: {
  visible: boolean;
  onClose: () => void;
  vehicle: VehicleFull;
  photos: VehiclePhotoRow[];
  damages: VehicleDamageRow[];
}) {
  const inspectedOn = vehicle.inspection_date
    ? new Date(vehicle.inspection_date).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "long", year: "numeric",
      })
    : "—";

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={styles.reportHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.reportEyebrow}>Inspection report</Text>
            <Text style={styles.reportTitle} numberOfLines={1}>
              {vehicle.year} {vehicle.make} {vehicle.model}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.reportClose} accessibilityLabel="Close report">
            <Ionicons name="close" size={22} color={theme.colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Meta */}
          <View style={styles.reportMeta}>
            <View style={styles.reportMetaRow}>
              <Ionicons name="calendar-outline" size={16} color={theme.colors.brand} />
              <Text style={styles.reportMetaLabel}>Inspected</Text>
              <Text style={styles.reportMetaValue} numberOfLines={1}>{inspectedOn}</Text>
            </View>
            <View style={styles.reportMetaRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.brand} />
              <Text style={styles.reportMetaLabel}>Inspector</Text>
              <Text style={styles.reportMetaValue} numberOfLines={1}>
                {vehicle.inspector_id ? `XportACar · ${vehicle.inspector_id.slice(0, 8)}` : "XportACar field team"}
              </Text>
            </View>
          </View>

          {/* Inspector notes */}
          {vehicle.inspection_notes ? (
            <View style={styles.reportNotes}>
              <Text style={styles.reportSectionTitle}>Inspector notes</Text>
              <Text style={styles.reportNotesText}>{vehicle.inspection_notes}</Text>
            </View>
          ) : null}

          {/* Photos */}
          {photos.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={styles.reportSectionTitle}>Photos ({photos.length})</Text>
              <View style={styles.reportPhotoGrid}>
                {photos.map((p) => (
                  <Image key={p.id} source={{ uri: p.url }} style={styles.reportPhoto} contentFit="cover" />
                ))}
              </View>
            </View>
          )}

          {/* Damage detail */}
          <View style={{ marginTop: 20 }}>
            <Text style={styles.reportSectionTitle}>Condition &amp; damage ({damages.length})</Text>
            {damages.length === 0 ? (
              <View style={styles.cleanReport}>
                <Ionicons name="checkmark-circle" size={20} color={theme.colors.success} />
                <Text style={styles.cleanReportText}>No damage reported. Vehicle inspected and certified.</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {damages.map((d) => {
                  const sev = SEVERITY_COLOR[d.severity] ?? SEVERITY_COLOR.cosmetic;
                  return (
                    <View key={d.id} style={styles.reportDamageCard}>
                      {d.photo_url ? (
                        <Image source={{ uri: d.photo_url }} style={styles.reportDamagePhoto} contentFit="cover" />
                      ) : (
                        <View style={[styles.reportDamagePhoto, styles.reportDamageNoPhoto]}>
                          <Ionicons name="image-outline" size={22} color={theme.colors.textLight} />
                        </View>
                      )}
                      <View style={styles.reportDamageBody}>
                        <View style={styles.reportDamageTop}>
                          <Text style={styles.damageLoc}>{d.location}</Text>
                          <View style={[styles.severityPill, { backgroundColor: sev.bg, borderColor: sev.border, borderWidth: 1 }]}>
                            <Text style={[styles.severityText, { color: sev.fg }]}>{d.severity}</Text>
                          </View>
                        </View>
                        <Text style={styles.damageDesc}>{d.description}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
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

  // Market value bar
  mvCard: { padding: 14, borderRadius: 14, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
  mvAvg: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  mvAvgLabel: { fontSize: 11, color: theme.colors.textLight, fontWeight: "600", marginTop: 1 },
  mvTrack: { height: 8, borderRadius: 4, backgroundColor: theme.colors.bgAlt, marginTop: 16, marginBottom: 14, position: "relative" },
  mvMarker: { position: "absolute", top: -3, width: 14, height: 14, borderRadius: 7, marginLeft: -7, borderWidth: 2, borderColor: theme.colors.white },
  mvRow: { flexDirection: "row", justifyContent: "space-between" },
  mvMinMax: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted },
  mvNote: { fontSize: 11, color: theme.colors.textLight, marginTop: 10 },
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
  damageThumb: { width: 44, height: 44, borderRadius: 8, marginRight: 12, backgroundColor: theme.colors.bgAlt },

  // "View full report" affordance under the condition preview
  viewReportRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: theme.colors.brandLight,
    borderWidth: 1, borderColor: "#b2ddff",
  },
  viewReportText: { flex: 1, fontSize: 13, fontWeight: "800", color: theme.colors.brand },

  // Full inspection report modal
  reportHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingTop: 54, paddingBottom: 14, paddingHorizontal: 16,
    backgroundColor: theme.colors.white, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  reportEyebrow: { fontSize: 10, fontWeight: "800", color: theme.colors.textLight, letterSpacing: 1, textTransform: "uppercase" },
  reportTitle:   { fontSize: 18, fontWeight: "800", color: theme.colors.text, marginTop: 2 },
  reportClose:   { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bgAlt },
  reportMeta:    { backgroundColor: theme.colors.white, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 14, gap: 10 },
  reportMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reportMetaLabel: { fontSize: 11, fontWeight: "800", color: theme.colors.textLight, textTransform: "uppercase", letterSpacing: 0.4, width: 78 },
  reportMetaValue: { flex: 1, fontSize: 13, fontWeight: "700", color: theme.colors.text },
  reportNotes:   { marginTop: 16, backgroundColor: theme.colors.bgAlt, borderRadius: 12, padding: 14 },
  reportSectionTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.text, marginBottom: 10 },
  reportNotesText: { fontSize: 13, lineHeight: 20, color: theme.colors.textMuted },
  reportPhotoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reportPhoto:   { width: "48%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: theme.colors.bgAlt },
  reportDamageCard: {
    flexDirection: "row", gap: 12, padding: 12,
    backgroundColor: theme.colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  reportDamagePhoto:  { width: 72, height: 72, borderRadius: 10, backgroundColor: theme.colors.bgAlt },
  reportDamageNoPhoto:{ alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  reportDamageBody:   { flex: 1 },
  reportDamageTop:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 },

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
