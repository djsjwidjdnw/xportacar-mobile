// "This listing is no longer available": when a car or its listing has been
// deleted, the vehicle/auction screen sends the buyer back to the marketplace
// (clearing the stale screen from the stack) and the marketplace shows a short
// translated notice. Pure JS, so it ships by OTA.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StackActions, useNavigation, type NavigationProp, type ParamListBase } from "@react-navigation/native";

import { theme } from "./theme";
import { useTranslation } from "./i18n";

let pending = false;
const listeners = new Set<() => void>();

/**
 * True when a PostgREST `.single()` error means "no such row": zero rows
 * (PGRST116) or an id that isn't a valid uuid (22P02). Network errors are not
 * "missing" — those keep the screen's own fallback.
 */
export function isMissingRow(error: { code?: string } | null | undefined): boolean {
  return !error || error.code === "PGRST116" || error.code === "22P02";
}

/** Once `missing` turns true: pop this stack to its root and open the marketplace with the notice. */
export function useLeaveMissingListing(missing: boolean) {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  useEffect(() => {
    if (!missing) return;
    pending = true;
    listeners.forEach((l) => l());
    const tabs = navigation.getParent();
    navigation.dispatch(StackActions.popToTop());
    tabs?.navigate("Marketplace", { screen: "MarketplaceHome" });
  }, [missing, navigation]);
}

/** Banner for the top of the marketplace; shows once, then hides after a few seconds. */
export function ListingUnavailableBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(pending);

  useEffect(() => {
    const show = () => setVisible(pending);
    listeners.add(show);
    show();
    return () => { listeners.delete(show); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => { pending = false; setVisible(false); }, 6000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;
  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Ionicons name="information-circle-outline" size={18} color={theme.colors.brand} />
      <Text style={styles.text}>{t("marketplace.listingUnavailable")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B2DDFF",
    backgroundColor: "#EFF8FF",
  },
  text: { flex: 1, fontSize: 14, fontWeight: "600", color: "#1849A9" },
});
