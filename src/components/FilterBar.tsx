// Horizontal filter pill row + bottom-sheet selectors. Pure UI — the
// parent owns the filter state and applies it to whatever it's displaying.
//
// Each pill opens a modal with the available options. The modal closes
// on selection (Make, Fuel, Trans, Price band) or on apply (Year range).

import { useMemo, useState } from "react";
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../lib/theme";
import { useTranslation } from "../lib/i18n";

export type PriceBand = "all" | "u50" | "50-100" | "100-150" | "150p";
export type SortKey  = "ending_soon" | "newest" | "price_asc" | "price_desc" | "mileage_asc";

export interface VehicleFilters {
  make: string | null;
  yearMin: number | null;
  yearMax: number | null;
  priceBand: PriceBand;
  fuel: string | null;
  transmission: string | null;
  sort: SortKey;
}

export const EMPTY_FILTERS: VehicleFilters = {
  make: null,
  yearMin: null,
  yearMax: null,
  priceBand: "all",
  fuel: null,
  transmission: null,
  sort: "ending_soon",
};

export function isAnyFilterActive(f: VehicleFilters): boolean {
  return !!(f.make || f.yearMin || f.yearMax || (f.priceBand !== "all") || f.fuel || f.transmission);
}

// Enum orders for the option lists. Labels resolve through t() inside the
// component (priceBandLabel / sortKeyLabel) so they localise; the two mid-band
// labels stay literal (pure currency).
const PRICE_BANDS: PriceBand[] = ["all", "u50", "50-100", "100-150", "150p"];
const SORT_KEYS: SortKey[] = ["ending_soon", "newest", "price_asc", "price_desc", "mileage_asc"];

const FUEL_OPTIONS = ["petrol", "diesel", "hybrid", "electric"];
const TRANSMISSION_OPTIONS = ["automatic", "manual"];

export function FilterBar({
  filters, onChange, availableMakes,
}: {
  filters: VehicleFilters;
  onChange: (next: VehicleFilters) => void;
  availableMakes: string[];
}) {
  const { t } = useTranslation();
  // Localised labels for the enum lookup tables (t() is only available here, not
  // at module scope). Currency-only bands stay literal.
  const priceBandLabel = (b: PriceBand): string =>
    b === "u50" ? t("filter.priceUnder50")
      : b === "50-100" ? "€50–100k"
        : b === "100-150" ? "€100–150k"
          : b === "150p" ? t("filter.price150plus")
            : t("filter.anyPrice");
  const sortKeyLabel = (s: SortKey): string =>
    s === "newest" ? t("filter.sortNewest")
      : s === "price_asc" ? t("filter.sortPriceAsc")
        : s === "price_desc" ? t("filter.sortPriceDesc")
          : s === "mileage_asc" ? t("filter.sortMileageAsc")
            : t("filter.sortEndingSoon");
  const [openSheet, setOpenSheet] = useState<null | "make" | "year" | "price" | "fuel" | "trans" | "sort">(null);

  const close = () => setOpenSheet(null);
  const update = (patch: Partial<VehicleFilters>) => onChange({ ...filters, ...patch });
  const clearAll = () => onChange({ ...EMPTY_FILTERS, sort: filters.sort });
  const anyActive = isAnyFilterActive(filters);

  const makesLabel  = filters.make ? filters.make : t("filter.make");
  const yearLabel   = filters.yearMin || filters.yearMax ? `${filters.yearMin ?? t("filter.any")}–${filters.yearMax ?? t("filter.any")}` : t("filter.year");
  const priceLabel  = priceBandLabel(filters.priceBand);
  const fuelLabel   = filters.fuel ?? t("filter.fuel");
  const transLabel  = filters.transmission ?? t("filter.transmission");
  const sortLabel   = sortKeyLabel(filters.sort);

  return (
    <View>
      {/* Pill row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        <Pill label={sortLabel} icon="swap-vertical-outline" active sortAccent onPress={() => setOpenSheet("sort")} />
        <Pill label={makesLabel}  icon="car-sport-outline"   active={!!filters.make}                 onPress={() => setOpenSheet("make")} />
        <Pill label={yearLabel}   icon="calendar-outline"    active={!!(filters.yearMin || filters.yearMax)} onPress={() => setOpenSheet("year")} />
        <Pill label={priceLabel}  icon="pricetag-outline"    active={filters.priceBand !== "all"}    onPress={() => setOpenSheet("price")} />
        <Pill label={fuelLabel}   icon="flash-outline"       active={!!filters.fuel}                  onPress={() => setOpenSheet("fuel")} capitalize />
        <Pill label={transLabel}  icon="cog-outline"         active={!!filters.transmission}          onPress={() => setOpenSheet("trans")} capitalize />
        {anyActive && (
          <Pressable
            onPress={clearAll}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.85 }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color={theme.colors.error} />
            <Text style={styles.clearText}>{t("filter.clearAll")}</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Modals — one BottomSheet per filter */}
      <BottomSheet open={openSheet === "make"} title={t("filter.make")} onClose={close}>
        <PickerList
          options={[{ value: null, label: t("filter.anyMake") }, ...availableMakes.map((m) => ({ value: m, label: m }))]}
          value={filters.make}
          onSelect={(v) => { update({ make: v }); close(); }}
        />
      </BottomSheet>

      <BottomSheet open={openSheet === "year"} title={t("filter.yearRange")} onClose={close}>
        <YearRangePicker
          min={filters.yearMin}
          max={filters.yearMax}
          onApply={(min, max) => { update({ yearMin: min, yearMax: max }); close(); }}
          onClear={() => { update({ yearMin: null, yearMax: null }); close(); }}
        />
      </BottomSheet>

      <BottomSheet open={openSheet === "price"} title={t("filter.priceRange")} onClose={close}>
        <PickerList
          options={PRICE_BANDS.map((b) => ({ value: b, label: priceBandLabel(b) }))}
          value={filters.priceBand}
          onSelect={(v) => { update({ priceBand: v as PriceBand }); close(); }}
        />
      </BottomSheet>

      <BottomSheet open={openSheet === "fuel"} title={t("filter.fuelType")} onClose={close}>
        <PickerList
          options={[{ value: null, label: t("filter.anyFuel") }, ...FUEL_OPTIONS.map((f) => ({ value: f, label: f }))]}
          value={filters.fuel}
          onSelect={(v) => { update({ fuel: v }); close(); }}
          capitalize
        />
      </BottomSheet>

      <BottomSheet open={openSheet === "trans"} title={t("filter.transmission")} onClose={close}>
        <PickerList
          options={[{ value: null, label: t("filter.any") }, ...TRANSMISSION_OPTIONS.map((tr) => ({ value: tr, label: tr }))]}
          value={filters.transmission}
          onSelect={(v) => { update({ transmission: v }); close(); }}
          capitalize
        />
      </BottomSheet>

      <BottomSheet open={openSheet === "sort"} title={t("filter.sortBy")} onClose={close}>
        <PickerList
          options={SORT_KEYS.map((k) => ({ value: k, label: sortKeyLabel(k) }))}
          value={filters.sort}
          onSelect={(v) => { update({ sort: v as SortKey }); close(); }}
        />
      </BottomSheet>
    </View>
  );
}

// ------- Filter pill ------------------------------------------------

function Pill({
  label, icon, active, sortAccent, onPress, capitalize,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  sortAccent?: boolean;
  onPress: () => void;
  capitalize?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active && (sortAccent ? styles.pillSort : styles.pillActive),
        pressed && { opacity: 0.92 },
      ]}
    >
      <Ionicons
        name={icon}
        size={13}
        color={active ? theme.colors.white : theme.colors.textMuted}
      />
      <Text
        style={[
          styles.pillLabel,
          active && styles.pillLabelActive,
          capitalize && { textTransform: "capitalize" },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Ionicons
        name="chevron-down"
        size={11}
        color={active ? theme.colors.white : theme.colors.textLight}
      />
    </Pressable>
  );
}

// ------- Bottom sheet wrapper ---------------------------------------

function BottomSheet({
  open, title, onClose, children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable hitSlop={10} onPress={onClose}>
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ------- Picker list ------------------------------------------------

function PickerList<T extends string | null>({
  options, value, onSelect, capitalize,
}: {
  options: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
  capitalize?: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <Pressable
            key={`${o.value ?? "any"}-${i}`}
            onPress={() => onSelect(o.value)}
            style={({ pressed }) => [
              styles.optionRow,
              active && styles.optionRowActive,
              pressed && { opacity: 0.92 },
            ]}
          >
            <Text style={[
              styles.optionLabel,
              active && styles.optionLabelActive,
              capitalize && { textTransform: "capitalize" },
            ]}>
              {o.label}
            </Text>
            {active && <Ionicons name="checkmark-circle" size={20} color={theme.colors.brand} />}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ------- Year range picker ------------------------------------------

function YearRangePicker({
  min, max, onApply, onClear,
}: {
  min: number | null;
  max: number | null;
  onApply: (min: number | null, max: number | null) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [localMin, setLocalMin] = useState(min != null ? String(min) : "");
  const [localMax, setLocalMax] = useState(max != null ? String(max) : "");

  const parsedMin = useMemo(() => (localMin ? Number(localMin) : null), [localMin]);
  const parsedMax = useMemo(() => (localMax ? Number(localMax) : null), [localMax]);
  const invalid = parsedMin != null && parsedMax != null && parsedMin > parsedMax;

  return (
    <View style={{ paddingBottom: 24 }}>
      <Text style={styles.fieldHelp}>{t("filter.yearHelp")}</Text>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{t("filter.from")}</Text>
          <TextInput
            value={localMin}
            onChangeText={(v) => setLocalMin(v.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="number-pad"
            style={styles.input}
            placeholder="2018"
            placeholderTextColor={theme.colors.textLight}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{t("filter.to")}</Text>
          <TextInput
            value={localMax}
            onChangeText={(v) => setLocalMax(v.replace(/[^0-9]/g, "").slice(0, 4))}
            keyboardType="number-pad"
            style={styles.input}
            placeholder="2024"
            placeholderTextColor={theme.colors.textLight}
          />
        </View>
      </View>
      {invalid && <Text style={styles.fieldError}>{t("filter.yearInvalid")}</Text>}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
        <Pressable
          onPress={onClear}
          style={({ pressed }) => [styles.actionBtnOutline, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.actionBtnOutlineText}>{t("filter.clear")}</Text>
        </Pressable>
        <Pressable
          onPress={() => !invalid && onApply(parsedMin, parsedMax)}
          style={({ pressed }) => [
            styles.actionBtn,
            invalid && { opacity: 0.5 },
            pressed && !invalid && { opacity: 0.92 },
          ]}
          disabled={invalid}
        >
          <Text style={styles.actionBtnText}>{t("filter.apply")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6, paddingHorizontal: 2,
  },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.white,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  pillActive: {
    backgroundColor: theme.colors.brand,
    borderColor: theme.colors.brand,
  },
  pillSort: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  pillLabel: { fontSize: 12, fontWeight: "800", color: theme.colors.textMuted, letterSpacing: 0.2 },
  pillLabelActive: { color: theme.colors.white },

  clearBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: theme.colors.errorBg,
    borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: "#fda29b",
  },
  clearText: { fontSize: 12, fontWeight: "800", color: theme.colors.error },

  // BottomSheet
  modalScrim: { flex: 1, backgroundColor: "rgba(16,24,40,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    maxHeight: "75%",
  },
  sheetHandle: {
    alignSelf: "center", width: 36, height: 4, borderRadius: 2,
    backgroundColor: theme.colors.borderStrong, marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginBottom: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },

  optionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  optionRowActive: { },
  optionLabel: { fontSize: 14, fontWeight: "600", color: theme.colors.text },
  optionLabelActive: { color: theme.colors.brand, fontWeight: "800" },

  // Year range picker
  fieldLabel: { fontSize: 10, fontWeight: "800", color: theme.colors.textLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  fieldHelp:  { fontSize: 12, color: theme.colors.textLight, marginBottom: 14, fontWeight: "600" },
  fieldError: { fontSize: 12, color: theme.colors.error, marginTop: 8, fontWeight: "700" },
  input: {
    height: 46, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.white,
  },

  actionBtn: {
    flex: 1, height: 46, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  actionBtnText: { color: theme.colors.white, fontWeight: "800", fontSize: 14 },
  actionBtnOutline: {
    flex: 1, height: 46, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    backgroundColor: theme.colors.white,
    alignItems: "center", justifyContent: "center",
  },
  actionBtnOutlineText: { color: theme.colors.text, fontWeight: "800", fontSize: 14 },
});
