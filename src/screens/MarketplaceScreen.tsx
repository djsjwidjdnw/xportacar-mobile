import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { VehicleCard, type VehicleListItem } from "../components/VehicleCard";
import { LiveAuctionCard } from "../components/LiveAuctionCard";
import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import {
  FilterBar, EMPTY_FILTERS, type VehicleFilters,
} from "../components/FilterBar";
import { supabase } from "../lib/supabase";
import { theme, isAuctionLive } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { useWatchlist } from "../lib/watchlist";
import { useTranslation } from "../lib/i18n";
import type { AuctionRow, VehicleRow } from "../lib/types";

type Filter = "all" | "live";

// Resolve the displayable price for a vehicle — used by both filter and sort.
function priceFor(v: VehicleListItem): number {
  if (v.auction?.current_bid_eur) return v.auction.current_bid_eur;
  if (v.auction?.starting_price_eur) return v.auction.starting_price_eur;
  return v.listed_price_eur ?? 0;
}

function priceInBand(price: number, band: VehicleFilters["priceBand"]): boolean {
  switch (band) {
    case "all":     return true;
    case "u50":     return price < 50_000;
    case "50-100":  return price >= 50_000 && price < 100_000;
    case "100-150": return price >= 100_000 && price < 150_000;
    case "150p":    return price >= 150_000;
  }
}

export function MarketplaceScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { ids: watchIds, toggle: toggleWatch } = useWatchlist(user?.id ?? null);
  const [items, setItems] = useState<VehicleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Filter>("all");
  const [filters, setFilters] = useState<VehicleFilters>(EMPTY_FILTERS);

  const fetchVehicles = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        *,
        vehicle_photos (url, sort_order),
        auctions (id, vehicle_id, status, start_time, end_time, starting_price_eur, current_bid_eur, buy_now_price_eur, reserve_price_eur, bid_count, bidder_count, winner_id)
      `)
      .in("status", ["listed", "in_auction"])
      .order("updated_at", { ascending: false });
    if (error) { setItems([]); return; }
    type Row = VehicleRow & {
      vehicle_photos?: { url: string; sort_order: number }[];
      auctions?: AuctionRow[] | AuctionRow | null;
    };
    const pickAuction = (a: Row["auctions"]): AuctionRow | null => {
      if (!a) return null;
      if (Array.isArray(a)) return a[0] ?? null;
      return a;
    };
    const list: VehicleListItem[] = (data as Row[]).map((row) => {
      const photos = (row.vehicle_photos ?? []) as { url: string; sort_order: number }[];
      const photo = photos.sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
      const auction = pickAuction(row.auctions);
      const { vehicle_photos: _v, auctions: _a, ...rest } = row;
      return { ...(rest as VehicleRow), photo_url: photo, auction };
    });
    setItems(list);
  }, []);

  useEffect(() => { fetchVehicles().finally(() => setLoading(false)); }, [fetchVehicles]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchVehicles();
    setRefreshing(false);
  };

  // Build the unique-makes list from the loaded dataset — drives the
  // Make filter dropdown without an extra query.
  const availableMakes = useMemo(
    () => Array.from(new Set(items.map((v) => v.make))).sort(),
    [items],
  );

  // Apply tab + free-text + filter+sort.
  const liveItems = useMemo(
    () => items.filter((v) => isAuctionLive(v.auction)),
    [items],
  );

  const filtered = useMemo(() => {
    const base = tab === "live" ? liveItems : items;
    const q = query.trim().toLowerCase();
    const result = base.filter((v) => {
      if (q && !`${v.year} ${v.make} ${v.model} ${v.vin} ${v.exterior_color ?? ""}`.toLowerCase().includes(q)) {
        return false;
      }
      if (filters.make && v.make !== filters.make) return false;
      if (filters.yearMin != null && v.year < filters.yearMin) return false;
      if (filters.yearMax != null && v.year > filters.yearMax) return false;
      if (!priceInBand(priceFor(v), filters.priceBand)) return false;
      if (filters.fuel && v.fuel_type !== filters.fuel) return false;
      if (filters.transmission && v.transmission !== filters.transmission) return false;
      return true;
    });

    // Sort
    const sorted = [...result];
    switch (filters.sort) {
      case "ending_soon":
        sorted.sort((a, b) => {
          const ae = a.auction?.end_time, be = b.auction?.end_time;
          if (ae && be) return new Date(ae).getTime() - new Date(be).getTime();
          if (ae) return -1;
          if (be) return 1;
          return 0;
        });
        break;
      case "newest":
        // No created_at on type — use year desc then VIN as a stable tiebreaker.
        sorted.sort((a, b) => b.year - a.year || (a.vin ?? "").localeCompare(b.vin ?? ""));
        break;
      case "price_asc":
        sorted.sort((a, b) => priceFor(a) - priceFor(b));
        break;
      case "price_desc":
        sorted.sort((a, b) => priceFor(b) - priceFor(a));
        break;
      case "mileage_asc":
        sorted.sort((a, b) => (a.mileage_km ?? 0) - (b.mileage_km ?? 0));
        break;
    }
    return sorted;
  }, [tab, items, liveItems, query, filters]);

  const onToggle = async (vehicleId: string) => {
    if (!user) { Alert.alert("Sign in required", t("watchlist.signin")); return; }
    const result = await toggleWatch(vehicleId);
    if (result === "error") Alert.alert("Couldn't update watchlist");
  };

  if (loading) return <Spinner label={`${t("marketplace.title")}…`} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <FlatList
        data={filtered}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View>
            {/* Hero banner — dark navy → brand blue gradient */}
            <LinearGradient
              colors={["#101828", theme.colors.brand]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <Text style={styles.heroEyebrow}>{t("marketplace.heroEyebrow")}</Text>
              <Text style={styles.heroTitle}>{t("marketplace.heroTitle")}</Text>
              <Text style={styles.heroSubtitle}>{t("marketplace.heroSub")}</Text>
              <View style={styles.heroStats}>
                <View>
                  <Text style={styles.heroStatNum}>{items.length}</Text>
                  <Text style={styles.heroStatLabel}>{t("marketplace.heroVehicles")}</Text>
                </View>
                <View style={styles.heroDivider} />
                <View>
                  <Text style={styles.heroStatNum}>{liveItems.length}</Text>
                  <Text style={styles.heroStatLabel}>{t("marketplace.heroLiveNow")}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Search */}
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={18} color={theme.colors.textLight} style={{ marginRight: 8 }} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("marketplace.search")}
                placeholderTextColor={theme.colors.textLight}
                style={styles.search}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>

            {/* Filters + sort */}
            <FilterBar
              filters={filters}
              onChange={setFilters}
              availableMakes={availableMakes}
            />

            {/* All / Live segmented pills */}
            <View style={styles.segWrap}>
              <SegPill
                active={tab === "all"}
                onPress={() => setTab("all")}
                icon="grid-outline"
                label={t("marketplace.allTab")}
                count={items.length}
              />
              <SegPill
                active={tab === "live"}
                onPress={() => setTab("live")}
                icon="flash"
                label={t("marketplace.liveTab")}
                count={liveItems.length}
                liveAccent
              />
            </View>

            <View style={styles.resultsRow}>
              <Text style={styles.resultsLabel}>
                {tab === "live"
                  ? t("marketplace.liveCount", { count: filtered.length })
                  : t("marketplace.results", { count: filtered.length, total: items.length })}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) =>
          tab === "live" ? (
            <LiveAuctionCard
              vehicle={item}
              isWatching={watchIds.has(item.id)}
              onToggleWatch={user ? () => onToggle(item.id) : undefined}
              onPress={() => navigation.navigate("VehicleDetail", { id: item.id })}
              onBidPress={() => item.auction && navigation.navigate("Auction", { id: item.auction.id })}
            />
          ) : (
            <VehicleCard
              vehicle={item}
              isWatching={watchIds.has(item.id)}
              onToggleWatch={user ? () => onToggle(item.id) : undefined}
              onPress={() => navigation.navigate("VehicleDetail", { id: item.id })}
              onPrimaryAction={() => {
                if (isAuctionLive(item.auction)) {
                  navigation.navigate("Auction", { id: item.auction!.id });
                } else {
                  navigation.navigate("VehicleDetail", { id: item.id });
                }
              }}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
          />
        }
        ListEmptyComponent={
          tab === "live" ? (
            <EmptyState
              icon="flash-outline"
              title={t("marketplace.noLiveTitle")}
              body={t("marketplace.noLiveBody")}
            />
          ) : (
            <EmptyState icon="car-outline" title={t("marketplace.noMatches")} body={t("marketplace.empty")} />
          )
        }
      />
    </View>
  );
}

function SegPill({
  active, onPress, icon, label, count, liveAccent,
}: {
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  liveAccent?: boolean;
}) {
  const accent = liveAccent ? theme.colors.success : theme.colors.brand;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.seg,
        active && { backgroundColor: accent },
        !active && { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.white },
        pressed && { opacity: 0.92 },
      ]}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? theme.colors.white : theme.colors.textMuted}
      />
      <Text style={[styles.segLabel, active && { color: theme.colors.white }]}>{label}</Text>
      <View style={[styles.segCount, active ? { backgroundColor: "rgba(255,255,255,0.22)" } : { backgroundColor: theme.colors.bgAlt }]}>
        <Text style={[styles.segCountText, active && { color: theme.colors.white }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 16, padding: 24, borderRadius: 20, marginBottom: 16,
    shadowColor: theme.colors.brand, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  heroEyebrow:  { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  heroTitle:    { color: theme.colors.white, fontSize: 26, fontWeight: "800", marginTop: 6 },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 4, lineHeight: 18 },
  heroStats:    { flexDirection: "row", alignItems: "center", marginTop: 18 },
  heroStatNum:  { color: theme.colors.white, fontSize: 22, fontWeight: "800" },
  heroStatLabel:{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  heroDivider:  { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 20 },

  searchWrap: {
    flexDirection: "row", alignItems: "center",
    height: 48, borderRadius: 12, borderWidth: 1,
    borderColor: theme.colors.border, paddingHorizontal: 14,
    backgroundColor: theme.colors.white, marginBottom: 8,
  },
  search: { flex: 1, fontSize: 14, color: theme.colors.text },

  // Segmented filter
  segWrap: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 12 },
  seg: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 42, borderRadius: theme.radius.full, paddingHorizontal: 12,
  },
  segLabel: { fontSize: 13, fontWeight: "800", color: theme.colors.text, letterSpacing: 0.2 },
  segCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: theme.radius.full, minWidth: 22, alignItems: "center" },
  segCountText: { fontSize: 11, fontWeight: "800", color: theme.colors.textMuted },

  resultsRow: { marginBottom: 12 },
  resultsLabel: { fontSize: 12, color: theme.colors.textLight, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
});
