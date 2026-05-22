import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../lib/theme";
import { useCurrency } from "../lib/currency";

export type ShippingChoice =
  | { kind: "warehouse" }
  | { kind: "port"; port: string }
  | { kind: "door" }
  | { kind: "tuv" };

// Cost in EUR for cards that have a single number; ranges resolve in the UI.
export interface PortOption {
  port: string;
  country: string;
  priceEur: number;
  days: number;
}

export const PORT_OPTIONS: PortOption[] = [
  { port: "Hamburg",   country: "Germany",     priceEur: 1800, days: 28 },
  { port: "Rotterdam", country: "Netherlands", priceEur: 1600, days: 25 },
  { port: "Genoa",     country: "Italy",       priceEur: 2100, days: 22 },
  { port: "Barcelona", country: "Spain",       priceEur: 2200, days: 24 },
];

export const DOOR_RANGE_EUR = { min: 2800, max: 4500 };
export const TUV_PRICE_EUR = 750;

export function getShippingPriceEur(choice: ShippingChoice): number {
  switch (choice.kind) {
    case "warehouse": return 0;
    case "port":      return PORT_OPTIONS.find((p) => p.port === choice.port)?.priceEur ?? 0;
    case "door":      return DOOR_RANGE_EUR.min; // use the low end for "total estimate"
    case "tuv":       return TUV_PRICE_EUR;
  }
}

export function describeShipping(choice: ShippingChoice): string {
  switch (choice.kind) {
    case "warehouse": return "Warehouse Pickup (Dubai)";
    case "port":      return `Nearest Port — ${choice.port}`;
    case "door":      return "Door-to-Door Delivery";
    case "tuv":       return "German TÜV / Papers Service";
  }
}

export function ShippingOptions({
  value, onChange,
}: {
  value: ShippingChoice;
  onChange: (next: ShippingChoice) => void;
}) {
  const { format } = useCurrency();
  const doorLabel = useMemo(
    () => `${format(DOOR_RANGE_EUR.min)} – ${format(DOOR_RANGE_EUR.max)} estimated`,
    [format],
  );

  return (
    <View style={{ gap: 12 }}>
      <Row
        active={value.kind === "warehouse"}
        onPress={() => onChange({ kind: "warehouse" })}
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
        {PORT_OPTIONS.map((p, idx) => {
          const active = value.kind === "port" && value.port === p.port;
          return (
            <Pressable
              key={p.port}
              onPress={() => onChange({ kind: "port", port: p.port })}
              style={({ pressed }) => [
                styles.subRow,
                idx === PORT_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                pressed && { opacity: 0.95 },
              ]}
            >
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioInner} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subTitle}>{p.port}, {p.country}</Text>
                <Text style={styles.subMeta}>{p.days} days</Text>
              </View>
              <Text style={styles.subPrice}>{format(p.priceEur)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Row
        active={value.kind === "door"}
        onPress={() => onChange({ kind: "door" })}
        icon="home-outline"
        title="Door-to-Door Delivery"
        subtitle="30–45 days · varies by destination"
        priceLabel={doorLabel}
      />

      <Row
        active={value.kind === "tuv"}
        onPress={() => onChange({ kind: "tuv" })}
        icon="document-text-outline"
        title="German TÜV / Papers Service"
        subtitle="Inspection for DE registration, CoC, customs paperwork"
        priceLabel={`+ ${format(TUV_PRICE_EUR)}`}
      />
    </View>
  );
}

function Row({
  active, onPress, icon, title, subtitle, priceLabel,
}: {
  active: boolean;
  onPress: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  priceLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && { opacity: 0.95 },
      ]}
    >
      <View style={[styles.radio, active && styles.radioActive]}>
        {active && <View style={styles.radioInner} />}
      </View>
      <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
        <Ionicons name={icon} size={16} color={active ? theme.colors.white : theme.colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.price}>{priceLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: theme.colors.white,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  rowActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: theme.colors.border,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.white,
  },
  radioActive: { borderColor: theme.colors.brand },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brand },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: theme.colors.brand },
  title:    { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  subtitle: { fontSize: 11, color: theme.colors.textLight, marginTop: 2, fontWeight: "600" },
  price:    { fontSize: 13, fontWeight: "800", color: theme.colors.brand, marginLeft: 4 },

  groupCard: {
    borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 14, paddingTop: 8,
  },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  groupTitle: { fontSize: 12, fontWeight: "800", color: theme.colors.text, textTransform: "uppercase", letterSpacing: 0.5 },
  subRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  subTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  subMeta:  { fontSize: 11, color: theme.colors.textLight, marginTop: 1, fontWeight: "600" },
  subPrice: { fontSize: 13, fontWeight: "800", color: theme.colors.text },
});
