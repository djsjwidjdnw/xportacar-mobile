import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../lib/theme";
import { useCurrency } from "../lib/currency";
import { CustomsDisclaimer } from "./CustomsDisclaimer";
import {
  getShippingRates, portRoutes, serviceRate, getShippingPriceEur, describeShipping,
  describeMethod, getMethodPriceEur, tuvPriceEur, PORT_FLAT_EUR,
  FALLBACK_RATES, type ShippingChoice, type ShippingRate,
} from "../lib/shipping";

// Re-export so other screens keep importing from here.
export { getShippingPriceEur, describeShipping, describeMethod, getMethodPriceEur, tuvPriceEur };
export type { ShippingChoice, ShippingRate };

const PORT_COUNTRY: Record<string, string> = {
  Hamburg: "Germany", Rotterdam: "Netherlands", Bremerhaven: "Germany",
  Antwerp: "Belgium", Genoa: "Italy", Barcelona: "Spain",
};

export function ShippingOptions({
  value, onChange, rates: ratesProp,
}: {
  value: ShippingChoice;
  onChange: (next: ShippingChoice) => void;
  rates?: ShippingRate[];
}) {
  const { format } = useCurrency();
  const [fetched, setFetched] = useState<ShippingRate[]>(FALLBACK_RATES);
  const rates = ratesProp ?? fetched;

  useEffect(() => {
    if (ratesProp) return;
    let on = true;
    getShippingRates().then((r) => { if (on) setFetched(r); });
    return () => { on = false; };
  }, [ratesProp]);

  const roro = useMemo(() => portRoutes(rates, "roro"), [rates]);
  const doorPrice = serviceRate(rates, "door_to_door_eu")?.base_price_eur ?? 800;
  const tuvPrice = serviceRate(rates, "service_tuv")?.base_price_eur ?? 3500;

  const setMethod = (method: ShippingChoice["method"]) => onChange({ ...value, method });

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.sectionEyebrow}>Delivery method</Text>
      <Row
        active={value.method.kind === "warehouse"}
        onPress={() => setMethod({ kind: "warehouse" })}
        icon="cube-outline"
        title="Warehouse Pickup (Dubai)"
        subtitle="Free · available immediately after payment"
        priceLabel="Free"
      />

      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Ionicons name="boat-outline" size={14} color={theme.colors.brand} />
          <Text style={styles.groupTitle}>Nearest Port Delivery</Text>
        </View>
        {roro.map((p, idx) => {
          const active = value.method.kind === "port" && value.method.port === p.destination_port;
          const country = PORT_COUNTRY[p.destination_port ?? ""] ?? "";
          return (
            <Pressable
              key={p.route_key}
              onPress={() => setMethod({ kind: "port", port: p.destination_port! })}
              style={({ pressed }) => [styles.subRow, idx === roro.length - 1 && { borderBottomWidth: 0 }, pressed && { opacity: 0.95 }]}
            >
              <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioInner} />}</View>
              <View style={styles.subText}>
                <Text style={styles.subTitle} numberOfLines={1}>{p.destination_port}{country ? `, ${country}` : ""}</Text>
                <Text style={styles.subMeta}>{p.transit_days_min}–{p.transit_days_max} days</Text>
              </View>
              <Text style={styles.subPrice} numberOfLines={1}>{format(PORT_FLAT_EUR)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Row
        active={value.method.kind === "door"}
        onPress={() => setMethod({ kind: "door" })}
        icon="home-outline"
        title="Door-to-Door Delivery"
        subtitle="Added on top of the port rate · 30–45 days"
        priceLabel="From"
        priceValue={format(doorPrice)}
      />

      <Text style={styles.sectionEyebrow}>Add-on service</Text>
      {/* TÜV is an additive checkbox — combinable with ANY delivery method. */}
      <Pressable
        onPress={() => onChange({ ...value, tuv: !value.tuv })}
        style={({ pressed }) => [styles.row, value.tuv && styles.rowActive, pressed && { opacity: 0.95 }]}
      >
        <View style={styles.leftBlock}>
          <View style={[styles.checkbox, value.tuv && styles.checkboxActive]}>
            {value.tuv && <Ionicons name="checkmark" size={13} color={theme.colors.white} />}
          </View>
          <View style={[styles.iconWrap, value.tuv && styles.iconWrapActive]}>
            <Ionicons name="document-text-outline" size={16} color={value.tuv ? theme.colors.white : theme.colors.brand} />
          </View>
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={2}>German Registration (TÜV)</Text>
          <Text style={styles.subtitle} numberOfLines={2}>Inspection for DE registration, CoC, customs paperwork</Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.priceCaption} numberOfLines={1}>+ Add</Text>
          <Text style={styles.priceValue} numberOfLines={1}>{format(tuvPrice)}</Text>
        </View>
      </Pressable>

      <CustomsDisclaimer />
    </View>
  );
}

function Row({
  active, onPress, icon, title, subtitle, priceLabel, priceValue,
}: {
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  priceLabel: string;
  priceValue?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.95 }]}>
      <View style={styles.leftBlock}>
        <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioInner} />}</View>
        <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
          <Ionicons name={icon} size={16} color={active ? theme.colors.white : theme.colors.brand} />
        </View>
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
      </View>
      <View style={styles.priceBlock}>
        {priceValue ? (
          <>
            <Text style={styles.priceCaption} numberOfLines={1}>{priceLabel}</Text>
            <Text style={styles.priceValue} numberOfLines={1}>{priceValue}</Text>
          </>
        ) : (
          <Text style={styles.priceValue} numberOfLines={1}>{priceLabel}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
  rowActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  leftBlock: { flexDirection: "row", alignItems: "center", gap: 10 },
  textBlock: { flex: 1, minWidth: 0 },
  priceBlock: { alignItems: "flex-end", minWidth: 70, marginLeft: 4 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white },
  radioActive: { borderColor: theme.colors.brand },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white },
  checkboxActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brand },
  sectionEyebrow: { fontSize: 11, fontWeight: "800", color: theme.colors.textLight, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brand },
  iconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  iconWrapActive: { backgroundColor: theme.colors.brand },
  title: { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: 11, color: theme.colors.textLight, marginTop: 2, fontWeight: "600", lineHeight: 15 },
  priceCaption: { fontSize: 9, color: theme.colors.textLight, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  priceValue: { fontSize: 13, fontWeight: "800", color: theme.colors.brand, marginTop: 2 },
  groupCard: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.white, paddingHorizontal: 14, paddingTop: 8 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  groupTitle: { fontSize: 12, fontWeight: "800", color: theme.colors.text, textTransform: "uppercase", letterSpacing: 0.5 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  subText: { flex: 1, minWidth: 0 },
  subTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  subMeta: { fontSize: 11, color: theme.colors.textLight, marginTop: 1, fontWeight: "600" },
  subPrice: { fontSize: 13, fontWeight: "800", color: theme.colors.text, minWidth: 60, textAlign: "right" },
});
