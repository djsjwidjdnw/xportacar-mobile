import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";
import { useTranslation } from "../lib/i18n";

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={theme.colors.brand} />
      <Text style={styles.label}>{label ?? t("common.loading")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:  { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg },
  label: { marginTop: 12, fontSize: 13, color: theme.colors.textLight, fontWeight: "600" },
});
