import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../lib/theme";
import { useTranslation } from "../lib/i18n";

export const CUSTOMS_DISCLAIMER_TEXT =
  "All import costs including customs duties and VAT are the responsibility of the buyer and are not included in our fees or shipping costs.";

// Prominent (not fine-print) customs/VAT disclaimer — red + bold by design.
export function CustomsDisclaimer({ style }: { style?: object }) {
  const { t } = useTranslation();
  return (
    <View style={[styles.box, style]}>
      <Ionicons name="warning-outline" size={18} color="#D92D20" style={{ marginTop: 1 }} />
      <Text style={styles.text}>{t("shipping.customsDisclaimer")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF3F2",
    borderWidth: 1,
    borderColor: "#FECDCA",
  },
  text: { flex: 1, fontSize: 12, fontWeight: "800", color: "#B42318", lineHeight: 17 },
});
