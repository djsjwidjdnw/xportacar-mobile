import { Pressable, StyleSheet, Text, View } from "react-native";
import { CURRENCIES, useCurrency } from "../lib/currency";
import { theme } from "../lib/theme";

export function CurrencyPills() {
  const { currency, setCurrency } = useCurrency();
  return (
    <View style={styles.row}>
      {CURRENCIES.map((c) => {
        const active = c === currency;
        return (
          <Pressable
            key={c}
            onPress={() => setCurrency(c)}
            style={({ pressed }) => [
              styles.pill,
              active && styles.pillActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{c}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.bgAlt,
    alignSelf: "flex-start",
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
  },
  pillActive: {
    backgroundColor: theme.colors.white,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.textMuted,
    letterSpacing: 0.4,
  },
  pillTextActive: {
    color: theme.colors.brand,
  },
});
