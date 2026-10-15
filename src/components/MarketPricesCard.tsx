import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../lib/theme";
import { useTranslation } from "../lib/i18n";
import { showSpecNote, type MarketPricesView } from "../lib/marketPrices";

// "Market prices": the UAE and EU market prices for this car from real
// listings, the difference, and how many listings each figure is based on.
// Rendered only when lib/marketPrices returns a view (at least one side).

const DATE_LOCALE: Record<string, string> = { en: "en-GB", de: "de-DE", fr: "fr-FR", ar: "ar-AE" };

const money = (n: number, currency: "AED" | "EUR"): string => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString("en-GB")}`;
  }
};
// Signs by hand: Hermes' Intl may not support signDisplay.
const signedEur = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n), "EUR")}`;
const signedPct = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.round(Math.abs(p) * 100)}%`;

export function MarketPricesCard({ view, marketSpec }: { view: MarketPricesView; marketSpec: string | null }) {
  const { t, locale } = useTranslation();
  const { uae, eu, difference } = view;
  const asking = uae?.kind === "asking";
  let updated: string | null = null;
  if (view.updatedAt) {
    try {
      updated = new Date(view.updatedAt).toLocaleDateString(DATE_LOCALE[locale] ?? "en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      updated = view.updatedAt.slice(0, 10);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.subtitle}>{t("marketPrices.subtitle")}</Text>

      {uae && (
        <View style={[styles.box, asking && styles.boxAsking]}>
          <Text style={styles.label}>{asking ? t("marketPrices.askingLabel") : t("marketPrices.uaeLabel")}</Text>
          <Text style={styles.big}>{money(uae.aed, "AED")}</Text>
          {uae.eur != null && <Text style={styles.approx}>{t("marketPrices.approx", { amount: money(uae.eur, "EUR") })}</Text>}
          <Text style={styles.note}>
            {uae.kind === "market" ? t("marketPrices.basedOnUae", { count: uae.count }) : t("marketPrices.askingNote")}
          </Text>
        </View>
      )}

      {eu && (
        <View style={styles.box}>
          <Text style={styles.label}>{t("marketPrices.euLabel")}</Text>
          <Text style={styles.big}>{money(eu.eur, "EUR")}</Text>
          <Text style={styles.note}>{t("marketPrices.basedOnEu", { count: eu.count })}</Text>
        </View>
      )}

      {difference && (
        <View style={styles.diff}>
          <Text style={styles.diffLabel}>
            {difference.basis === "asking" ? t("marketPrices.differenceAsking") : t("marketPrices.differenceMarket")}
          </Text>
          <Text style={styles.diffValue}>
            {signedEur(difference.eur)} <Text style={styles.diffPct}>({signedPct(difference.pct)})</Text>
          </Text>
        </View>
      )}

      {eu && showSpecNote(marketSpec) && (
        <View style={styles.specRow}>
          <Ionicons name="information-circle-outline" size={14} color={theme.colors.textLight} />
          <Text style={styles.specNote}>{t("marketPrices.specNote")}</Text>
        </View>
      )}
      {updated && <Text style={styles.updated}>{t("marketPrices.updated", { date: updated })}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, borderRadius: 14, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, gap: 10 },
  subtitle: { fontSize: 12, color: theme.colors.textLight, lineHeight: 17 },
  box: { padding: 12, borderRadius: 12, backgroundColor: theme.colors.bgAlt, borderWidth: 1, borderColor: theme.colors.border },
  boxAsking: { backgroundColor: theme.colors.white, borderStyle: "dashed", borderColor: theme.colors.borderStrong },
  label: { fontSize: 10, fontWeight: "800", color: theme.colors.textLight, textTransform: "uppercase", letterSpacing: 0.5 },
  big: { fontSize: 22, fontWeight: "800", color: theme.colors.text, marginTop: 4, fontVariant: ["tabular-nums"] },
  approx: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, marginTop: 1, fontVariant: ["tabular-nums"] },
  note: { fontSize: 11, color: theme.colors.textLight, marginTop: 6 },
  diff: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    backgroundColor: theme.colors.brandLight, borderWidth: 1, borderColor: "#b2ddff",
  },
  diffLabel: { fontSize: 12, fontWeight: "700", color: theme.colors.brandDark },
  diffValue: { fontSize: 16, fontWeight: "800", color: theme.colors.brandDark, fontVariant: ["tabular-nums"] },
  diffPct: { fontSize: 12, fontWeight: "700" },
  specRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  specNote: { flex: 1, fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
  updated: { fontSize: 11, color: theme.colors.textLight },
});
