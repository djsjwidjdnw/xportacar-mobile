import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../lib/theme";
import { useTranslation } from "../lib/i18n";

// Structured door-to-door delivery address with OpenStreetMap (Nominatim)
// autofill. OTA-safe: pure JS fetch + RN core components, no native modules.
// (React Native fetch — unlike a browser — lets us set the User-Agent that
// Nominatim's usage policy requires.)

export interface DeliveryAddress {
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number | null;
  lon: number | null;
}

export const EMPTY_DELIVERY_ADDRESS: DeliveryAddress = {
  line1: "", line2: "", city: "", postalCode: "", country: "", lat: null, lon: null,
};

// EU + UK door-to-door destinations (ISO-2 → name).
export const SHIP_COUNTRIES: { code: string; name: string }[] = [
  { code: "DE", name: "Germany" }, { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" }, { code: "FR", name: "France" },
  { code: "AT", name: "Austria" }, { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" }, { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" }, { code: "CZ", name: "Czechia" },
  { code: "CH", name: "Switzerland" }, { code: "DK", name: "Denmark" },
  { code: "SE", name: "Sweden" }, { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" }, { code: "IE", name: "Ireland" },
  { code: "LU", name: "Luxembourg" }, { code: "GB", name: "United Kingdom" },
];

export function countryName(code: string): string {
  return SHIP_COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
}

const COUNTRY_CODES = SHIP_COUNTRIES.map((c) => c.code.toLowerCase()).join(",");

type Suggestion = {
  label: string; line1: string; line2: string; city: string;
  postalCode: string; country: string; lat: number; lon: number;
};

// deno-lint-ignore no-explicit-any
function toSuggestion(r: any): Suggestion {
  const a = r.address ?? {};
  const line1 = [a.house_number, a.road ?? a.pedestrian].filter(Boolean).join(" ");
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.city_district ?? "";
  const line2 = a.suburb ?? a.neighbourhood ?? "";
  return {
    label: r.display_name,
    line1,
    line2: line2 && line2 !== city ? line2 : "",
    city,
    postalCode: a.postcode ?? "",
    country: (a.country_code ?? "").toUpperCase(),
    lat: Number(r.lat),
    lon: Number(r.lon),
  };
}

export function AddressAutocomplete({
  value, onChange,
}: {
  value: DeliveryAddress;
  onChange: (next: DeliveryAddress) => void;
}) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNext = useRef(false);

  // Debounced Nominatim lookup off the street field (500ms ≈ 1 req/s).
  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return; }
    const q = value.line1.trim();
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 3) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          format: "json", addressdetails: "1", limit: "5", countrycodes: COUNTRY_CODES,
          q: value.country ? `${q}, ${countryName(value.country)}` : q,
        });
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          headers: { "User-Agent": "XportACar/1.0 (contact@xportacar.com)", "Accept-Language": "en" },
        });
        const raw = await res.json();
        setSuggestions(Array.isArray(raw) ? raw.map(toSuggestion) : []);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value.line1, value.country]);

  const pick = (s: Suggestion) => {
    skipNext.current = true; // don't re-query off the field we just filled
    onChange({
      line1: s.line1 || value.line1,
      line2: s.line2 || value.line2,
      city: s.city || value.city,
      postalCode: s.postalCode || value.postalCode,
      country: s.country || value.country,
      lat: s.lat,
      lon: s.lon,
    });
    setSuggestions([]);
  };

  // Manual edits invalidate the geocoded coordinates (except the unit line).
  const setField = (patch: Partial<DeliveryAddress>, keepCoords = false) =>
    onChange({ ...value, ...patch, ...(keepCoords ? {} : { lat: null, lon: null }) });

  return (
    <View style={{ gap: 10 }}>
      {/* Street + autofill */}
      <View>
        <Text style={styles.label}>{t("addr.street")} *</Text>
        <View style={styles.inputWrap}>
          <TextInput
            value={value.line1}
            onChangeText={(v) => setField({ line1: v })}
            placeholder={t("addr.streetHint")}
            placeholderTextColor={theme.colors.textLight}
            autoCapitalize="words"
            autoCorrect={false}
            style={styles.input}
          />
          {loading && <ActivityIndicator size="small" color={theme.colors.brand} style={styles.spinner} />}
        </View>
        {suggestions.length > 0 && (
          <View style={styles.suggestBox}>
            {suggestions.map((s, i) => (
              <Pressable
                key={`${s.lat},${s.lon},${i}`}
                onPress={() => pick(s)}
                style={({ pressed }) => [styles.suggestRow, i < suggestions.length - 1 && styles.suggestDivider, pressed && { backgroundColor: theme.colors.brandLight }]}
              >
                <Ionicons name="location-outline" size={15} color={theme.colors.brand} style={{ marginTop: 1 }} />
                <Text style={styles.suggestText} numberOfLines={2}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Apartment / unit — keeps coordinates */}
      <View>
        <Text style={styles.label}>{t("addr.unit")}</Text>
        <TextInput
          value={value.line2}
          onChangeText={(v) => setField({ line2: v }, true)}
          placeholder="Apt 4B"
          placeholderTextColor={theme.colors.textLight}
          autoCapitalize="words"
          style={styles.input}
        />
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t("addr.postal")} *</Text>
          <TextInput
            value={value.postalCode}
            onChangeText={(v) => setField({ postalCode: v })}
            placeholder="80539"
            placeholderTextColor={theme.colors.textLight}
            style={styles.input}
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <Text style={styles.label}>{t("addr.city")} *</Text>
          <TextInput
            value={value.city}
            onChangeText={(v) => setField({ city: v })}
            placeholder="Munich"
            placeholderTextColor={theme.colors.textLight}
            autoCapitalize="words"
            style={styles.input}
          />
        </View>
      </View>

      {/* Country picker */}
      <View>
        <Text style={styles.label}>{t("addr.country")} *</Text>
        <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.input, styles.pickerBtn, pressed && { opacity: 0.9 }]}>
          <Text style={[styles.pickerText, !value.country && { color: theme.colors.textLight }]}>
            {value.country ? countryName(value.country) : t("addr.selectCountry")}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t("addr.selectCountry")}</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <FlatList
              data={SHIP_COUNTRIES}
              keyExtractor={(c) => c.code}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { setField({ country: item.code }); setPickerOpen(false); }}
                  style={({ pressed }) => [styles.countryRow, pressed && { backgroundColor: theme.colors.brandLight }]}
                >
                  <Text style={styles.countryName}>{item.name}</Text>
                  {value.country === item.code && <Ionicons name="checkmark" size={18} color={theme.colors.brand} />}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", color: theme.colors.textLight, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 },
  inputWrap: { position: "relative", justifyContent: "center" },
  input: {
    height: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.white, paddingHorizontal: 12, fontSize: 14, color: theme.colors.text,
  },
  spinner: { position: "absolute", right: 12 },
  row: { flexDirection: "row", gap: 10 },
  suggestBox: { marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.white, overflow: "hidden" },
  suggestRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 12, paddingVertical: 11 },
  suggestDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  suggestText: { flex: 1, fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  pickerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerText: { fontSize: 14, color: theme.colors.text, fontWeight: "600" },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  pickerSheet: { backgroundColor: theme.colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, maxHeight: "70%" },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18 },
  pickerTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  countryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: theme.colors.border },
  countryName: { fontSize: 15, color: theme.colors.text, fontWeight: "600" },
});
