import { useEffect, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { Spinner } from "../components/Spinner";
import { CurrencyPills } from "../components/CurrencyPills";
import { CustomsDisclaimer } from "../components/CustomsDisclaimer";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { useCurrency } from "../lib/currency";
import { useAuth } from "../lib/auth";
import { useTranslation } from "../lib/i18n";
import {
  PORT_FLAT_EUR, TUV_EUR,
  shippingCostEur, distanceFromHamburgCoords, distanceFromHamburgKm,
} from "../lib/distance";
import {
  AddressAutocomplete, EMPTY_DELIVERY_ADDRESS, countryName,
  type DeliveryAddress,
} from "../components/AddressAutocomplete";
import { type ShippingChoice } from "../components/ShippingOptions";
import type { AuctionRow, VehicleRow, VehicleStatus } from "../lib/types";

interface AuctionFull extends AuctionRow {
  vehicle: VehicleRow;
}

// Returns a Date 5 working days (Mon-Fri) after `from`.
function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

function formatDeadline(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

// Live "X days, Y hours" countdown until the payment deadline.
type TFn = (key: string, values?: Record<string, string | number>) => string;

function formatCountdownToDeadline(deadline: Date, now: Date, t: TFn): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return t("won.overdue");
  const totalHours = Math.floor(ms / 3600_000);
  const days  = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins  = Math.floor((ms % 3600_000) / 60_000);
  if (days > 0)  return t("won.remainingDays", { days, hours });
  if (hours > 0) return t("won.remainingHours", { hours, mins });
  return t("won.remainingMins", { mins });
}

const PLATFORM_FEE_PCT = 0.029;
const CONFIRM_WINDOW_HOURS = 36;
const PAYMENT_WORKING_DAYS = 5;

// Web origin for the invoice API (finalize / pdf-url / pdf). MUST be the
// canonical www host: the apex xportacar.com 307-redirects to www, and fetch
// DROPS the Authorization header on that cross-host redirect → 401. Hitting www
// directly preserves the bearer token.
const WEB_URL =
  (Constants.expoConfig?.extra as { webUrl?: string } | undefined)?.webUrl ??
  "https://www.xportacar.com";

interface InvoiceRow {
  id: string;
  created_at: string;
  payment_confirmed_at: string | null;
  status: string;
}

// Order-lifecycle timeline (sold → picked_up → in_transit → delivered).
const TIMELINE_STEPS = ["sold", "picked_up", "in_transit", "delivered"] as const;
type TimelineStatus = (typeof TIMELINE_STEPS)[number];
const TIMELINE_LABEL_KEY: Record<TimelineStatus, string> = {
  sold: "timeline.sold",
  picked_up: "timeline.pickedUp",
  in_transit: "timeline.inTransit",
  delivered: "timeline.delivered",
};
const TIMELINE_ICON: Record<TimelineStatus, keyof typeof Ionicons.glyphMap> = {
  sold: "trophy-outline",
  picked_up: "cube-outline",
  in_transit: "boat-outline",
  delivered: "checkmark-done-outline",
};

interface StatusEventRow {
  status: string;
  note: string | null;
  created_at: string;
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface ProofFile { uri: string; name: string; mimeType: string; size: number }

const PROOF_ALLOWED_EXT = /\.(pdf|png|jpe?g)$/i;
const PROOF_ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg"];

// The payment-proofs bucket only allows pdf/png/jpeg — normalise the type so
// uploads aren't rejected when the picker reports "" or image/jpg.
function proofContentType(f: ProofFile): string {
  const t = (f.mimeType || "").toLowerCase();
  if (t === "application/pdf" || t === "image/png" || t === "image/jpeg") return t;
  if (t === "image/jpg") return "image/jpeg";
  const ext = f.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  return "image/jpeg";
}

export function AuctionWonScreen({
  route, navigation,
}: {
  route: { params: { id: string; shipping?: ShippingChoice } };
  navigation: { navigate: (s: string, p?: object) => void; goBack: () => void };
}) {
  const { id } = route.params;
  const { user } = useAuth();
  const { format } = useCurrency();
  const { t } = useTranslation();
  const [auction, setAuction] = useState<AuctionFull | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [statusEvents, setStatusEvents] = useState<StatusEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  // Shipping + delivery selection (drives the invoice total below).
  const [shippingMethod, setShippingMethod] = useState<"standard" | "door_to_door">("standard");
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_DELIVERY_ADDRESS);
  const [tuv, setTuv] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderSaved, setOrderSaved] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Payment proof flow.
  const [proofOpen, setProofOpen] = useState(false);
  const [proofFiles, setProofFiles] = useState<ProofFile[]>([]);
  const [proofNote, setProofNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadInvoice = async () => {
    if (!user) return;
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, created_at, payment_confirmed_at, status")
      .eq("auction_id", id)
      .eq("buyer_id", user.id)
      .maybeSingle();
    setInvoice((inv as InvoiceRow) ?? null);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("auctions")
        .select(`*, vehicle:vehicles!vehicle_id(*)`)
        .eq("id", id)
        .single();
      const full = (data as AuctionFull) ?? null;
      setAuction(full);
      // Order-lifecycle events for this vehicle (sold → … → delivered).
      const vehicleId = full?.vehicle?.id;
      if (vehicleId) {
        const { data: ev } = await supabase
          .from("vehicle_status_events")
          .select("status, note, created_at")
          .eq("vehicle_id", vehicleId)
          .in("status", TIMELINE_STEPS as unknown as string[])
          .order("created_at", { ascending: true });
        setStatusEvents((ev as StatusEventRow[]) ?? []);
      }
      await loadInvoice();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  // Tick the countdown every minute (no need for second-level precision here).
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);

  const MAX_FILES = 5;
  const MAX_BYTES = 10 * 1024 * 1024;

  const addImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t("won.photosDisabledTitle"), t("won.photosDisabledBody")); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    addProof({ uri: a.uri, name: a.fileName ?? `proof-${Date.now()}.jpg`, mimeType: a.mimeType ?? "image/jpeg", size: a.fileSize ?? 0 });
  };

  const addDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/png", "image/jpeg"], multiple: false, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    addProof({ uri: a.uri, name: a.name ?? `proof-${Date.now()}`, mimeType: a.mimeType ?? "application/pdf", size: a.size ?? 0 });
  };

  const addProof = (f: ProofFile) => {
    if (!PROOF_ALLOWED_EXT.test(f.name) && !PROOF_ALLOWED_MIME.includes((f.mimeType || "").toLowerCase())) {
      Alert.alert(t("won.unsupportedFileTitle"), t("won.unsupportedFileBody", { name: f.name })); return;
    }
    if (f.size && f.size > MAX_BYTES) { Alert.alert(t("won.fileTooLargeTitle"), t("won.fileTooLargeBody", { name: f.name })); return; }
    setProofFiles((arr) => (arr.length >= MAX_FILES ? arr : [...arr, f]));
  };

  const submitProof = async () => {
    if (!invoice) return;
    if (proofFiles.length === 0) { Alert.alert(t("won.attachProofTitle"), t("won.attachProofBody")); return; }
    setSubmitting(true);
    try {
      // Private "payment-proofs" bucket. Path = {invoice_id}/{file} so the
      // bucket RLS lets the owning buyer upload to their invoice folder.
      // Store the storage KEY (path), not a public URL — admins read via
      // 7-day signed URLs (matches the web app).
      const uploaded: { path: string; filename: string; uploaded_at: string }[] = [];
      for (const f of proofFiles) {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const key = `${invoice.id}/${Date.now()}-${safe}`;
        // React Native's fetch(uri).blob() hands Supabase a Blob whose bytes
        // don't cross the bridge, so Storage ends up with a 0-byte file. Read
        // the real bytes into an ArrayBuffer first (works for PDF + images; no
        // expo-file-system needed, so this stays OTA-safe).
        const bytes = new Uint8Array(await (await fetch(f.uri)).arrayBuffer());
        if (bytes.byteLength === 0) throw new Error(t("won.fileEmptyReselect", { name: f.name }));
        const { error: upErr } = await supabase.storage.from("payment-proofs")
          .upload(key, bytes, { contentType: proofContentType(f), upsert: false });
        if (upErr) throw upErr;
        // Confirm the stored object is non-zero; if empty, remove it and fail
        // rather than recording a broken proof reference on the invoice.
        const fname = key.slice(key.lastIndexOf("/") + 1);
        const { data: listed } = await supabase.storage.from("payment-proofs").list(invoice.id, { search: fname, limit: 100 });
        const storedSize = (listed?.find((o) => o.name === fname)?.metadata as { size?: number } | undefined)?.size;
        if (storedSize === 0) {
          await supabase.storage.from("payment-proofs").remove([key]).catch(() => {});
          throw new Error(t("won.fileUploadedEmpty", { name: f.name }));
        }
        uploaded.push({ path: key, filename: f.name, uploaded_at: new Date().toISOString() });
      }
      const { error } = await supabase.rpc("submit_payment_proof", {
        p_invoice_id: invoice.id, p_urls: uploaded, p_note: proofNote,
      });
      if (error) throw error;
      setProofOpen(false);
      setProofFiles([]);
      setProofNote("");
      await loadInvoice();
      Alert.alert(t("won.proofSubmittedTitle"), t("won.proofSubmittedBody", { days: PAYMENT_WORKING_DAYS }));
    } catch (e) {
      Alert.alert(t("won.submitFailedTitle"), (e as Error).message ?? t("auction.tryAgain"));
    } finally {
      setSubmitting(false);
    }
  };

  // Mint a signed, login-free PDF URL from the web app. The bare /pdf route
  // needs a session cookie that mobile Safari doesn't have (the old "Unauthorized
  // black screen"); /pdf-url returns a 7-day HMAC-signed URL anyone can open.
  // OTA-safe: pure fetch + Linking + RN-core Share (no native PDF modules — the
  // 1.0.0 binary lacks expo-file-system/sharing/web-browser). The PDF is also
  // emailed to the buyer as a real attachment server-side.
  const signedPdfUrl = async (): Promise<string | null> => {
    if (!invoice) return null;
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token;
    if (!tok) { if (__DEV__) console.warn("[pdf] no session token"); return null; }
    try {
      const res = await fetch(`${WEB_URL}/api/invoice/${invoice.id}/pdf-url`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) { if (__DEV__) console.warn("[pdf] /pdf-url HTTP", res.status); return null; }
      const json = await res.json();
      if (typeof json?.url !== "string") { if (__DEV__) console.warn("[pdf] no url in response", json); return null; }
      if (__DEV__) console.log("[pdf] signed url", json.url);
      return json.url;
    } catch (e) {
      if (__DEV__) console.warn("[pdf] fetch failed", (e as Error)?.message);
      return null;
    }
  };

  const viewPdf = async () => {
    setPdfBusy(true);
    const url = await signedPdfUrl();
    setPdfBusy(false);
    if (!url) { Alert.alert(t("won.openInvoiceFailedTitle"), t("won.openInvoiceFailedBody")); return; }
    try { await Linking.openURL(url); }
    catch { Alert.alert(t("won.openInvoiceFailedTitle"), t("won.openInvoiceFailedBody")); }
  };

  const sharePdf = async () => {
    setPdfBusy(true);
    const url = await signedPdfUrl();
    setPdfBusy(false);
    if (!url) { Alert.alert(t("won.openInvoiceFailedTitle"), t("won.openInvoiceFailedBody")); return; }
    try { await Share.share({ url, message: t("won.sharePdfMessage", { url }) }); }
    catch { /* user dismissed the share sheet */ }
  };

  if (loading) return <Spinner label={t("won.loadingInvoice")} />;
  if (!auction || !auction.vehicle) {
    return <View style={styles.center}><Text>{t("auction.notFound")}</Text></View>;
  }

  const hammerEur = auction.current_bid_eur ?? auction.starting_price_eur ?? 0;
  const feeEur = hammerEur * PLATFORM_FEE_PCT;
  // Door-to-door is priced from the delivery address: €4500 flat + €3.50/km from
  // Hamburg. Use the geocoded lat/lon (Haversine) when the buyer picked an
  // autofill suggestion, else fall back to the country/city lookup table.
  const isDoor = shippingMethod === "door_to_door";
  const distanceKm = isDoor
    ? (address.lat != null && address.lon != null
        ? distanceFromHamburgCoords(address.lat, address.lon)
        : distanceFromHamburgKm(countryName(address.country), address.city))
    : null;
  const methodEur = isDoor ? shippingCostEur("door_to_door", distanceKm ?? 0) : PORT_FLAT_EUR;
  const tuvEur = tuv ? TUV_EUR : 0;
  const totalEur = hammerEur + feeEur + methodEur + tuvEur;

  const v = auction.vehicle;
  const isWinner = !!user && auction.winner_id === user.id;

  // Confirm the order: persist shipping + extras to the invoice and send the
  // invoice email, via the bearer-authed web endpoint (the buy_now RPC alone
  // sends no email — this is the unified completion point, matching web).
  const confirmOrder = async () => {
    if (!invoice) return;
    if (isDoor && (!address.line1.trim() || !address.city.trim() || !address.postalCode.trim() || !address.country.trim())) {
      Alert.alert(t("won.completeAddressTitle"), t("won.completeAddressBody"));
      return;
    }
    setSavingOrder(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const tok = session?.access_token;
      if (!tok) throw new Error(t("auction.tryAgain"));
      const body = {
        shippingMethod,
        shippingEur: methodEur,
        distanceKm,
        ...(isDoor ? {
          shippingLine1: address.line1,
          shippingLine2: address.line2,
          shippingCity: address.city,
          shippingPostalCode: address.postalCode,
          shippingCountry: address.country,
          shippingLatitude: address.lat,
          shippingLongitude: address.lon,
        } : {}),
        extras: tuv ? [{ name: "German Registration (TÜV)", price_eur: TUV_EUR }] : [],
      };
      const res = await fetch(`${WEB_URL}/api/invoice/${invoice.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? t("auction.tryAgain"));
      setOrderSaved(true);
      Alert.alert(t("won.orderSavedTitle"), t("won.orderSavedBody"));
    } catch (e) {
      Alert.alert(t("won.orderFailedTitle"), (e as Error)?.message ?? t("auction.tryAgain"));
    } finally {
      setSavingOrder(false);
    }
  };

  const confirmed = !!invoice?.payment_confirmed_at;
  const createdAt = invoice?.created_at ? new Date(invoice.created_at) : new Date();
  const confirmDeadline = new Date(createdAt.getTime() + CONFIRM_WINDOW_HOURS * 3600_000);
  const payDeadline = addWorkingDays(invoice?.payment_confirmed_at ? new Date(invoice.payment_confirmed_at) : new Date(), PAYMENT_WORKING_DAYS);
  const confirmExpired = !confirmed && confirmDeadline.getTime() <= now.getTime();

  // Order-status timeline: index the latest event per status, then resolve each
  // of the four steps to complete / current / future.
  const eventByStatus = new Map<string, StatusEventRow>();
  for (const e of statusEvents) {
    const prev = eventByStatus.get(e.status);
    if (!prev || new Date(e.created_at) > new Date(prev.created_at)) eventByStatus.set(e.status, e);
  }
  const vehicleStatus: VehicleStatus | null = v.status ?? null;
  const currentStepIndex = TIMELINE_STEPS.indexOf(vehicleStatus as TimelineStatus);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Celebration banner */}
      <LinearGradient
        colors={["#039855", "#027A48"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <View style={styles.trophyWrap}>
          <Ionicons name="trophy" size={36} color={theme.colors.white} />
        </View>
        <Text style={styles.heroTitle}>{t("won.congrats")}</Text>
        <Text style={styles.heroSub}>
          {isWinner ? t("won.subtitle") : t("won.closed")}
        </Text>
        <Text style={styles.heroVehicle}>
          {`${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""}`}
        </Text>
        <Text style={styles.heroPrice}>{format(hammerEur)}</Text>
      </LinearGradient>

      {/* Currency switcher */}
      <View style={styles.currencyRow}>
        <CurrencyPills />
      </View>

      {/* Order-status timeline (sold → picked_up → in_transit → delivered) */}
      {isWinner && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="navigate-outline" size={16} color={theme.colors.brand} />
            <Text style={styles.sectionTitle}>{t("timeline.orderStatus")}</Text>
          </View>

          <View style={styles.timelineCard}>
            {TIMELINE_STEPS.map((step, i) => {
              const event = eventByStatus.get(step);
              // Sold counts as complete once the vehicle is sold, even with no
              // explicit event row (orders predating the events table).
              const soldComplete = step === "sold" && (!!v.sold_at || vehicleStatus === "sold" || currentStepIndex > 0);
              const isComplete = !!event || soldComplete;
              const isCurrent = vehicleStatus === step;
              const dateIso = event?.created_at ?? (step === "sold" ? v.sold_at ?? null : null);
              const isLast = i === TIMELINE_STEPS.length - 1;

              const circleColor = isComplete
                ? theme.colors.success
                : isCurrent
                  ? theme.colors.brand
                  : theme.colors.border;
              const iconName: keyof typeof Ionicons.glyphMap = isComplete
                ? "checkmark"
                : isCurrent
                  ? "ellipse"
                  : TIMELINE_ICON[step];

              return (
                <View key={step} style={styles.tlRow}>
                  {/* Rail: circle + connector */}
                  <View style={styles.tlRail}>
                    <View style={[styles.tlCircle, { backgroundColor: circleColor, borderColor: circleColor }]}>
                      <Ionicons
                        name={iconName}
                        size={isCurrent && !isComplete ? 10 : 14}
                        color={isComplete || isCurrent ? theme.colors.white : theme.colors.textLight}
                      />
                    </View>
                    {!isLast && (
                      <View style={[styles.tlConnector, { backgroundColor: isComplete ? theme.colors.success : theme.colors.border }]} />
                    )}
                  </View>

                  {/* Step content */}
                  <View style={[styles.tlContent, !isLast && { paddingBottom: 18 }]}>
                    <Text
                      style={[
                        styles.tlLabel,
                        isComplete ? styles.tlLabelDone : isCurrent ? styles.tlLabelCurrent : styles.tlLabelFuture,
                      ]}
                    >
                      {t(TIMELINE_LABEL_KEY[step])}
                    </Text>
                    {dateIso && <Text style={styles.tlDate}>{formatEventDate(dateIso)}</Text>}
                    {event?.note ? <Text style={styles.tlNote}>{event.note}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Shipping & delivery — choose Standard port or Door-to-door (address) */}
      {isWinner && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cube-outline" size={16} color={theme.colors.brand} />
            <Text style={styles.sectionTitle}>{t("won.shipMethod")}</Text>
          </View>
          <View style={{ gap: 10 }}>
            {/* Standard port */}
            <Pressable
              onPress={() => { setShippingMethod("standard"); setOrderSaved(false); }}
              style={({ pressed }) => [styles.shipCard, !isDoor && styles.shipCardActive, pressed && { opacity: 0.95 }]}
            >
              <View style={[styles.radio, !isDoor && styles.radioActive]}>{!isDoor && <View style={styles.radioInner} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shipTitle}>{t("won.standardShipping")}</Text>
                <Text style={styles.shipSub}>{t("won.standardSub")}</Text>
              </View>
              <Text style={styles.shipPrice}>{format(PORT_FLAT_EUR)}</Text>
            </Pressable>

            {/* Door-to-door */}
            <Pressable
              onPress={() => { setShippingMethod("door_to_door"); setOrderSaved(false); }}
              style={({ pressed }) => [styles.shipCard, isDoor && styles.shipCardActive, pressed && { opacity: 0.95 }]}
            >
              <View style={[styles.radio, isDoor && styles.radioActive]}>{isDoor && <View style={styles.radioInner} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shipTitle}>{t("shipping.doorToDoor")}</Text>
                <Text style={styles.shipSub}>{t("shipping.doorToDoorSubtitle")}</Text>
              </View>
              <Text style={styles.shipPrice}>{format(PORT_FLAT_EUR)}+</Text>
            </Pressable>

            {isDoor && (
              <View style={styles.addrCard}>
                <AddressAutocomplete value={address} onChange={(a) => { setAddress(a); setOrderSaved(false); }} />
                <Text style={styles.distanceLine}>
                  {t("addr.distance")}: <Text style={styles.distanceVal}>{distanceKm ?? 0} km</Text>
                  {" "}({address.lat != null && address.lon != null ? t("addr.located") : t("addr.estimated")}) · {format(methodEur)}
                </Text>
              </View>
            )}

            {/* German Registration (TÜV) — combinable with either method */}
            <Pressable
              onPress={() => { setTuv((x) => !x); setOrderSaved(false); }}
              style={({ pressed }) => [styles.shipCard, tuv && styles.shipCardActive, pressed && { opacity: 0.95 }]}
            >
              <View style={[styles.checkbox, tuv && styles.checkboxActive]}>{tuv && <Ionicons name="checkmark" size={13} color={theme.colors.white} />}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.shipTitle}>{t("won.germanReg")}</Text>
                <Text style={styles.shipSub}>{t("shipping.germanRegistrationSubtitle")}</Text>
              </View>
              <Text style={styles.shipPrice}>{format(TUV_EUR)}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Invoice */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="receipt-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.sectionTitle}>{t("won.invoice")}</Text>
        </View>

        <View style={styles.invoiceCard}>
          {/* Vehicle */}
          <View style={styles.invRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invLabel}>{t("won.vehicleLabel")}</Text>
              <Text style={styles.invValue}>
                {`${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""}`}
              </Text>
              <Text style={styles.invMeta}>{t("won.vinMeta", { vin: v.vin, city: v.location_city, country: v.location_country })}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <LineItem label={t("won.hammer")} value={format(hammerEur)} />
          <LineItem label={t("won.platformFee")} value={format(feeEur)} />
          <LineItem
            label={isDoor ? `${t("shipping.doorToDoor")} (${distanceKm ?? 0} km)` : t("won.standardShipping")}
            value={format(methodEur)}
            sub={t("won.selectedDelivery")}
          />
          {tuv && (
            <LineItem label={t("won.germanReg")} value={format(tuvEur)} sub={t("won.addOnService")} />
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t("won.totalDue")}</Text>
            <Text style={styles.totalAmount}>{format(totalEur)}</Text>
          </View>
        </View>

        <CustomsDisclaimer style={{ marginTop: 12 }} />

        {/* Confirm the shipping + extras selection → persists to the invoice and
            sends the invoice email (the unified completion point for Buy Now). */}
        {isWinner && invoice && (
          <Pressable
            onPress={confirmOrder}
            disabled={savingOrder}
            style={({ pressed }) => [styles.confirmOrderBtn, savingOrder && { opacity: 0.6 }, pressed && { opacity: 0.9 }]}
          >
            {orderSaved ? <Ionicons name="checkmark-circle" size={16} color={theme.colors.white} /> : null}
            <Text style={styles.confirmOrderText}>
              {savingOrder ? t("won.savingOrder") : orderSaved ? t("won.orderConfirmed") : t("won.confirmOrder")}
            </Text>
          </Pressable>
        )}

        {invoice && (
          <View style={styles.pdfRow}>
            <Pressable
              onPress={viewPdf}
              disabled={pdfBusy}
              style={({ pressed }) => [styles.pdfBtn, pdfBusy && { opacity: 0.6 }, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="eye-outline" size={16} color={theme.colors.brand} />
              <Text style={styles.pdfBtnText}>{t("won.viewPdf")}</Text>
            </Pressable>
            <Pressable
              onPress={sharePdf}
              disabled={pdfBusy}
              style={({ pressed }) => [styles.pdfBtn, pdfBusy && { opacity: 0.6 }, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="share-outline" size={16} color={theme.colors.brand} />
              <Text style={styles.pdfBtnText}>{t("won.sharePdf")}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Two-step payment timeline */}
      {!confirmed ? (
        <View style={styles.section}>
          <View style={[styles.deadlineCard, confirmExpired && { backgroundColor: theme.colors.errorBg, borderColor: "#fda29b" }]}>
            <View style={styles.deadlineIcon}>
              <Ionicons name="time-outline" size={20} color={confirmExpired ? theme.colors.error : theme.colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              {confirmExpired ? (
                <>
                  <Text style={[styles.deadlineEyebrow, { color: theme.colors.error }]}>{t("won.confirmExpiredEyebrow")}</Text>
                  <Text style={styles.payBody}>{t("won.confirmExpiredBody")}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.deadlineEyebrow}>{t("won.confirmWithinHours", { hours: CONFIRM_WINDOW_HOURS })}</Text>
                  <Text style={styles.deadlineDate}>{formatDeadline(confirmDeadline)}</Text>
                  <Text style={styles.deadlineRemaining}>{formatCountdownToDeadline(confirmDeadline, now, t)}</Text>
                  <Text style={[styles.payBody, { marginTop: 6 }]}>
                    {t("won.confirmIntentBody", { days: PAYMENT_WORKING_DAYS })}
                  </Text>
                  {invoice && (
                    <Pressable
                      onPress={() => setProofOpen(true)}
                      style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }]}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.white} />
                      <Text style={styles.confirmText}>{t("won.confirmPayment")}</Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={[styles.deadlineCard, { backgroundColor: "#ecfdf3", borderColor: "#a6f4c5" }]}>
            <View style={styles.deadlineIcon}>
              <Ionicons name="checkmark-circle-outline" size={20} color={theme.colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.deadlineEyebrow, { color: theme.colors.success }]}>
                {t("won.paymentConfirmedEyebrow", { days: PAYMENT_WORKING_DAYS })}
              </Text>
              <Text style={styles.deadlineDate}>{formatDeadline(payDeadline)}</Text>
              <Text style={[styles.deadlineRemaining, { color: theme.colors.success }]}>{formatCountdownToDeadline(payDeadline, now, t)}</Text>
              <Text style={[styles.payBody, { marginTop: 6 }]}>{t("won.latePaymentNote")}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Payment instructions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="card-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.sectionTitle}>{t("won.paymentTitle")}</Text>
        </View>

        <View style={styles.payCard}>
          <Text style={styles.payBody}>
            Pay by wire transfer to <Text style={styles.payStrong}>XportACar</Text> (operated by Global
            Business Consultancy L.L.C-FZ) within <Text style={styles.payStrong}>{PAYMENT_WORKING_DAYS} working days</Text>{" "}
            of confirming. Shipping or warehouse pickup begins upon payment confirmation.
          </Text>

          <View style={styles.bankBox}>
            <Ionicons name="business-outline" size={16} color={theme.colors.textMuted} />
            <Text style={styles.bankText}>
              {t("won.bankDetails")}
              {user?.email ? ` (${user.email})` : ""}.
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void Share.share({
                message: t("won.shareSummaryMessage", {
                  vehicle: `${v.year} ${v.make} ${v.model}${v.trim ? " " + v.trim : ""}`,
                  total: format(totalEur),
                  hours: CONFIRM_WINDOW_HOURS,
                  days: PAYMENT_WORKING_DAYS,
                }),
              });
            }}
            style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="share-outline" size={16} color={theme.colors.brand} />
            <Text style={styles.shareText}>{t("won.share")}</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer actions */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => navigation.navigate("Marketplace")}
          style={({ pressed }) => [styles.footerOutline, pressed && { opacity: 0.92 }]}
        >
          <Ionicons name="grid-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.footerOutlineText}>{t("won.backMarket")}</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("VehicleDetail", { id: v.id })}
          style={({ pressed }) => [styles.footerOutline, pressed && { opacity: 0.92 }]}
        >
          <Ionicons name="document-text-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.footerOutlineText}>{t("won.viewVehicle")}</Text>
        </Pressable>
      </View>

      {/* Payment proof upload modal */}
      <Modal visible={proofOpen} transparent animationType="slide" onRequestClose={() => setProofOpen(false)}>
        <KeyboardAvoidingView style={styles.proofBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.proofSheet}>
            <View style={styles.proofHeader}>
              <Text style={styles.proofTitle}>{t("won.proofModalTitle")}</Text>
              <Pressable onPress={() => setProofOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.proofSub}>
              {t("won.proofModalSub", { max: MAX_FILES, size: MAX_BYTES / (1024 * 1024) })}
            </Text>

            <View style={styles.proofPickRow}>
              <Pressable onPress={addImage} style={({ pressed }) => [styles.proofPickBtn, pressed && { opacity: 0.9 }]}>
                <Ionicons name="image-outline" size={18} color={theme.colors.brand} />
                <Text style={styles.proofPickText}>{t("won.addPhoto")}</Text>
              </Pressable>
              <Pressable onPress={addDocument} style={({ pressed }) => [styles.proofPickBtn, pressed && { opacity: 0.9 }]}>
                <Ionicons name="document-outline" size={18} color={theme.colors.brand} />
                <Text style={styles.proofPickText}>{t("won.addPdfFile")}</Text>
              </Pressable>
            </View>

            {proofFiles.map((f, i) => (
              <View key={`${f.name}-${i}`} style={styles.proofFileRow}>
                <Ionicons name="attach-outline" size={16} color={theme.colors.textLight} />
                <Text style={styles.proofFileName} numberOfLines={1}>{f.name}</Text>
                <Pressable onPress={() => setProofFiles((arr) => arr.filter((_, idx) => idx !== i))} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textLight} />
                </Pressable>
              </View>
            ))}

            <TextInput
              value={proofNote}
              onChangeText={setProofNote}
              placeholder={t("won.proofNotePlaceholder")}
              placeholderTextColor={theme.colors.textLight}
              multiline
              style={styles.proofNote}
            />

            <Pressable
              onPress={submitProof}
              disabled={submitting || proofFiles.length === 0}
              style={({ pressed }) => [styles.proofSubmit, (submitting || proofFiles.length === 0) && { opacity: 0.5 }, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.proofSubmitText}>{submitting ? t("won.submitting") : t("won.submitProof")}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function LineItem({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <View style={styles.lineRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.lineLabel}>{label}</Text>
        {sub && <Text style={styles.lineSub}>{sub}</Text>}
      </View>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  heroCard: {
    margin: 16, marginTop: 24,
    padding: 24, borderRadius: 20,
    alignItems: "center",
    shadowColor: theme.colors.success, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  trophyWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.32)",
    marginBottom: 14,
  },
  heroTitle:   { fontSize: 26, fontWeight: "800", color: theme.colors.white, letterSpacing: -0.3 },
  heroSub:     { fontSize: 13, color: "rgba(255,255,255,0.92)", marginTop: 4, fontWeight: "600" },
  heroVehicle: { fontSize: 16, color: theme.colors.white, marginTop: 16, fontWeight: "800" },
  heroPrice:   { fontSize: 36, fontWeight: "800", color: theme.colors.white, marginTop: 4 },

  currencyRow: { paddingHorizontal: 20, marginTop: 4, marginBottom: 4 },

  section: { paddingHorizontal: 16, marginTop: 18 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  sectionTitle:  { fontSize: 14, fontWeight: "800", color: theme.colors.text },

  invoiceCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border,
    padding: 16,
  },
  invRow:    { flexDirection: "row", alignItems: "center", gap: 12 },
  invLabel:  { fontSize: 10, color: theme.colors.textLight, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  invValue:  { fontSize: 15, fontWeight: "800", color: theme.colors.text, marginTop: 4 },
  invMeta:   { fontSize: 11, color: theme.colors.textLight, marginTop: 2, fontWeight: "600" },

  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 14 },

  lineRow:   { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  lineLabel: { fontSize: 13, color: theme.colors.text, fontWeight: "600" },
  lineSub:   { fontSize: 11, color: theme.colors.textLight, marginTop: 2 },
  lineValue: { fontSize: 14, fontWeight: "800", color: theme.colors.text },

  totalRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  totalLabel: { fontSize: 12, color: theme.colors.textLight, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  totalAmount:{ fontSize: 22, fontWeight: "800", color: theme.colors.brand },

  timelineCard: {
    backgroundColor: theme.colors.white,
    borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border,
    padding: 16,
  },
  tlRow:       { flexDirection: "row", gap: 12 },
  tlRail:      { alignItems: "center", width: 28 },
  tlCircle:    { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tlConnector: { width: 2, flex: 1, minHeight: 22, marginTop: 2 },
  tlContent:   { flex: 1, paddingTop: 3 },
  tlLabel:        { fontSize: 14, fontWeight: "800" },
  tlLabelDone:    { color: theme.colors.text },
  tlLabelCurrent: { color: theme.colors.brandDark },
  tlLabelFuture:  { color: theme.colors.textLight },
  tlDate:      { fontSize: 11, color: theme.colors.textLight, fontWeight: "600", marginTop: 2 },
  tlNote:      { fontSize: 12, color: theme.colors.textMuted, marginTop: 3, lineHeight: 17 },

  deadlineCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 16, borderRadius: 14,
    backgroundColor: theme.colors.warningBg,
    borderWidth: 1, borderColor: "#fedf89",
  },
  deadlineIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white },
  deadlineEyebrow:  { fontSize: 10, color: theme.colors.warning, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  deadlineDate:     { fontSize: 15, color: theme.colors.text, fontWeight: "800", marginTop: 4 },
  deadlineRemaining:{ fontSize: 12, color: theme.colors.warning, fontWeight: "700", marginTop: 2 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, height: 44, borderRadius: 10, backgroundColor: theme.colors.brand },
  confirmText: { color: theme.colors.white, fontWeight: "800", fontSize: 14 },

  proofBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  proofSheet: { backgroundColor: theme.colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 12 },
  proofHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  proofTitle: { fontSize: 16, fontWeight: "800", color: theme.colors.text },
  proofSub: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  proofPickRow: { flexDirection: "row", gap: 10 },
  proofPickBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  proofPickText: { color: theme.colors.brand, fontWeight: "800", fontSize: 13 },
  proofFileRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  proofFileName: { flex: 1, fontSize: 13, color: theme.colors.text, fontWeight: "600" },
  proofNote: { minHeight: 64, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, padding: 12, fontSize: 13, color: theme.colors.text, textAlignVertical: "top" },
  proofSubmit: { height: 48, borderRadius: 12, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  proofSubmitText: { color: theme.colors.white, fontWeight: "800", fontSize: 15 },

  payCard: {
    backgroundColor: theme.colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: theme.colors.border, padding: 16,
  },
  payBody:   { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  payStrong: { color: theme.colors.text, fontWeight: "800" },
  bankBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginTop: 12, padding: 12, borderRadius: 12,
    backgroundColor: theme.colors.bgAlt,
  },
  bankText: { flex: 1, fontSize: 12, color: theme.colors.textMuted, fontWeight: "600" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 12, height: 42, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight,
  },
  shareText: { color: theme.colors.brand, fontWeight: "800", fontSize: 12 },

  pdfRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  pdfBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 44, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight,
  },
  pdfBtnText: { color: theme.colors.brand, fontWeight: "800", fontSize: 13 },

  // Shipping & delivery selection
  shipCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border },
  shipCardActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white },
  radioActive: { borderColor: theme.colors.brand },
  radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.colors.brand },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white },
  checkboxActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brand },
  shipTitle: { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  shipSub: { fontSize: 11, color: theme.colors.textLight, marginTop: 2, fontWeight: "600", lineHeight: 15 },
  shipPrice: { fontSize: 13, fontWeight: "800", color: theme.colors.brand },
  addrCard: { padding: 14, borderRadius: 14, backgroundColor: theme.colors.bgAlt, borderWidth: 1, borderColor: theme.colors.border },
  distanceLine: { marginTop: 10, fontSize: 12, color: theme.colors.textMuted, fontWeight: "600", lineHeight: 17 },
  distanceVal: { fontWeight: "800", color: theme.colors.text },
  confirmOrderBtn: { marginTop: 14, height: 48, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: theme.colors.brand },
  confirmOrderText: { color: theme.colors.white, fontWeight: "800", fontSize: 15 },

  footer: { paddingHorizontal: 16, marginTop: 22, flexDirection: "row", gap: 10 },
  footerOutline: {
    flex: 1, height: 48, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: theme.colors.brand,
  },
  footerOutlineText: { color: theme.colors.brand, fontWeight: "800", fontSize: 13 },
});
