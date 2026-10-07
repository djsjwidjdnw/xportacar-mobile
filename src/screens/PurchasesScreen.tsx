// "Purchases" tab for the fixed-price marketplace (app_settings.bidding_enabled
// off; MyBidsScreen takes this tab back when bidding is on). Lists the vehicles
// the buyer bought through buy_now(), with the invoice state, and opens the
// order screen (AuctionWon) on tap.

import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { Spinner } from "../components/Spinner";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTranslation } from "../lib/i18n";
import { useCurrency } from "../lib/currency";
import { theme, pickThumbnailPhoto, thumb } from "../lib/theme";

interface PurchaseRow {
  id: string;
  end_time: string;
  current_bid_eur: number | null;
  buy_now_price_eur: number | null;
  vehicle: {
    id: string; year: number; make: string; model: string;
    vehicle_photos?: { url: string; sort_order: number; caption?: string | null; category?: string | null }[];
  } | null;
}

export function PurchasesScreen({ navigation }: { navigation: { navigate: (s: string, p?: object) => void } }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { format } = useCurrency();
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [invoiceStatus, setInvoiceStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) { setRows([]); return; }
    const [{ data }, { data: inv }] = await Promise.all([
      supabase
        .from("auctions")
        .select("id, end_time, current_bid_eur, buy_now_price_eur, vehicle:vehicles!vehicle_id ( id, year, make, model, vehicle_photos ( url, sort_order, caption, category ) )")
        .eq("winner_id", user.id)
        .eq("status", "sold")
        .order("end_time", { ascending: false }),
      supabase.from("invoices").select("auction_id, status").eq("buyer_id", user.id),
    ]);
    setRows((data as unknown as PurchaseRow[]) ?? []);
    setInvoiceStatus(Object.fromEntries(((inv as { auction_id: string; status: string }[] | null) ?? []).map((r) => [r.auction_id, r.status])));
  }, [user]);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  if (!user) {
    return <EmptyState icon="lock-closed-outline" title={t("purchases.signInTitle")} body={t("purchases.signInBody")} />;
  }
  if (loading) return <Spinner label={t("purchases.loading")} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      style={{ backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      ListHeaderComponent={<Text style={styles.heading}>{t("purchases.title")}</Text>}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={theme.colors.brand}
          colors={[theme.colors.brand]}
        />
      }
      ListEmptyComponent={<EmptyState icon="receipt-outline" title={t("purchases.emptyTitle")} body={t("purchases.emptyBody")} />}
      renderItem={({ item }) => {
        const v = item.vehicle;
        const photo = pickThumbnailPhoto(v?.vehicle_photos)?.url ?? null;
        const paid = invoiceStatus[item.id] === "paid";
        return (
          <Pressable
            onPress={() => navigation.navigate("AuctionWon", { id: item.id })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.95 }]}
          >
            <Image
              source={photo ? { uri: thumb(photo, 300) } : require("../../assets/icon.png")}
              style={styles.thumb}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{v ? `${v.year} ${v.make} ${v.model}` : "—"}</Text>
              <Text style={styles.sub}>{t("purchases.boughtFor", { price: format(item.current_bid_eur ?? item.buy_now_price_eur ?? 0) })}</Text>
              <View style={[styles.pill, { backgroundColor: paid ? theme.colors.successBg : theme.colors.warningBg }]}>
                <Text style={[styles.pillText, { color: paid ? theme.colors.success : theme.colors.warning }]}>
                  {paid ? t("purchases.paid") : t("purchases.awaitingPayment")}
                </Text>
              </View>
            </View>
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{t("purchases.viewOrder")}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.brand} />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 22, fontWeight: "800", color: theme.colors.text, marginBottom: 12 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.colors.white, borderRadius: 14, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  thumb: { width: 72, height: 54, borderRadius: 8, backgroundColor: theme.colors.bgAlt },
  title: { fontSize: 14, fontWeight: "800", color: theme.colors.text },
  sub: { fontSize: 12, color: theme.colors.textLight, marginTop: 2, fontWeight: "600" },
  pill: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full },
  pillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  cta: { flexDirection: "row", alignItems: "center", gap: 2 },
  ctaText: { fontSize: 11, fontWeight: "800", color: theme.colors.brand, textTransform: "uppercase", letterSpacing: 0.3 },
});
