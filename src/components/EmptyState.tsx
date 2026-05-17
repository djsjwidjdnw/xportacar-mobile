import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../lib/theme";

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={32} color={theme.colors.brand} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 32, alignItems: "center", marginTop: 32 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: theme.colors.brandLight,
    alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: "800", color: theme.colors.text, textAlign: "center", marginBottom: 6 },
  body:  { fontSize: 13, color: theme.colors.textLight, textAlign: "center", lineHeight: 20, maxWidth: 280 },
});
