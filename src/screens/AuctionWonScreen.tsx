import { useEffect, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { Spinner } from "../components/Spinner";
import { CurrencyPills } from "../components/CurrencyPills";
import { CustomsDisclaimer } from "../components/CustomsDisclaimer";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { useCurrency } from "../lib/currency";
import { useAuth } from "../lib/auth";
import {
  describeMethod, getMethodPriceEur, tuvPriceEur, type ShippingChoice,
} from "../components/ShippingOptions";
import type { AuctionRow, VehicleRow } from "../lib/types";

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
function formatCountdownToDeadline(deadline: Date, now: Date): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return "Payment overdue";
  const totalHours = Math.floor(ms / 3600_000);
  const days  = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins  = Math.floor((ms % 3600_000) / 60_000);
  if (days > 0)  return `${days} day${days === 1 ? "" : "s"}, ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

const PLATFORM_FEE_PCT = 0.029;
const CONFIRM_WINDOW_HOURS = 36;
const PAYMENT_WORKING_DAYS = 5;

interface InvoiceRow {
  id: string;
  created_at: string;
  payment_confirmed_at: string | null;
  status: string;
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
  const { id, shipping: shippingParam } = route.params;
  const { user } = useAuth();
  const { format } = useCurrency();
  const [auction, setAuction] = useState<AuctionFull | null>(null);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [shipping] = useState<ShippingChoice>(shippingParam ?? { method: { kind: "port", port: "Hamburg" }, tuv: false });

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
      setAuction((data as AuctionFull) ?? null);
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
    if (!perm.granted) { Alert.alert("Photos disabled", "Allow photo access in Settings to attach proof."); return; }
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
      Alert.alert("Unsupported file", `${f.name}: only PDF, PNG and JPG are allowed.`); return;
    }
    if (f.size && f.size > MAX_BYTES) { Alert.alert("File too large", `${f.name} is larger than 10MB.`); return; }
    setProofFiles((arr) => (arr.length >= MAX_FILES ? arr : [...arr, f]));
  };

  const submitProof = async () => {
    if (!invoice) return;
    if (proofFiles.length === 0) { Alert.alert("Attach proof", "Add at least one payment proof file."); return; }
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
        if (bytes.byteLength === 0) throw new Error(`"${f.name}" came through empty — re-select the file and try again.`);
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
          throw new Error(`"${f.name}" uploaded empty — please try again.`);
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
      Alert.alert("Payment proof submitted", "Our team will verify receipt. You now have 5 working days to complete the wire.");
    } catch (e) {
      Alert.alert("Couldn't submit", (e as Error).message ?? "Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Loading your invoice…" />;
  if (!auction || !auction.vehicle) {
    return <View style={styles.center}><Text>Auction not found.</Text></View>;
  }

  const hammerEur = auction.current_bid_eur ?? auction.starting_price_eur ?? 0;
  const feeEur = hammerEur * PLATFORM_FEE_PCT;
  const methodEur = getMethodPriceEur(shipping.method);
  const tuvEur = shipping.tuv ? tuvPriceEur() : 0;
  const totalEur = hammerEur + feeEur + methodEur + tuvEur;

  const v = auction.vehicle;
  const isWinner = !!user && auction.winner_id === user.id;

  const confirmed = !!invoice?.payment_confirmed_at;
  const createdAt = invoice?.created_at ? new Date(invoice.created_at) : new Date();
  const confirmDeadline = new Date(createdAt.getTime() + CONFIRM_WINDOW_HOURS * 3600_000);
  const payDeadline = addWorkingDays(invoice?.payment_confirmed_at ? new Date(invoice.payment_confirmed_at) : new Date(), PAYMENT_WORKING_DAYS);
  const confirmExpired = !confirmed && confirmDeadline.getTime() <= now.getTime();

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
        <Text style={styles.heroTitle}>Congratulations!</Text>
        <Text style={styles.heroSub}>
          {isWinner ? "You won this auction." : "This auction has closed."}
        </Text>
        <Text style={styles.heroVehicle}>
          {v.year} {v.make} {v.model}
        </Text>
        <Text style={styles.heroPrice}>{format(hammerEur)}</Text>
      </LinearGradient>

      {/* Currency switcher */}
      <View style={styles.currencyRow}>
        <CurrencyPills />
      </View>

      {/* Invoice */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="receipt-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.sectionTitle}>Invoice</Text>
        </View>

        <View style={styles.invoiceCard}>
          {/* Vehicle */}
          <View style={styles.invRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.invLabel}>Vehicle</Text>
              <Text style={styles.invValue}>
                {v.year} {v.make} {v.model}
              </Text>
              <Text style={styles.invMeta}>VIN {v.vin} · {v.location_city}, {v.location_country}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <LineItem label="Hammer price" value={format(hammerEur)} />
          <LineItem label="Platform fee (2.9%)" value={format(feeEur)} />
          <LineItem
            label={describeMethod(shipping.method)}
            value={format(methodEur)}
            sub="Selected delivery method"
          />
          {shipping.tuv && (
            <LineItem label="German TÜV / Papers Service" value={format(tuvEur)} sub="Add-on service" />
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total due</Text>
            <Text style={styles.totalAmount}>{format(totalEur)}</Text>
          </View>
        </View>

        <CustomsDisclaimer style={{ marginTop: 12 }} />
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
                  <Text style={[styles.deadlineEyebrow, { color: theme.colors.error }]}>Confirmation window expired</Text>
                  <Text style={styles.payBody}>You didn&apos;t confirm in time, so this vehicle may be re-listed. Contact us if you still wish to proceed.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.deadlineEyebrow}>Confirm payment within {CONFIRM_WINDOW_HOURS} hours</Text>
                  <Text style={styles.deadlineDate}>{formatDeadline(confirmDeadline)}</Text>
                  <Text style={styles.deadlineRemaining}>{formatCountdownToDeadline(confirmDeadline, now)}</Text>
                  <Text style={[styles.payBody, { marginTop: 6 }]}>
                    Confirm your intent to pay. You&apos;ll then have {PAYMENT_WORKING_DAYS} working days to complete the wire transfer.
                  </Text>
                  {invoice && (
                    <Pressable
                      onPress={() => setProofOpen(true)}
                      style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.9 }]}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.white} />
                      <Text style={styles.confirmText}>Confirm payment</Text>
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
                Payment confirmed — wire within {PAYMENT_WORKING_DAYS} working days
              </Text>
              <Text style={styles.deadlineDate}>{formatDeadline(payDeadline)}</Text>
              <Text style={[styles.deadlineRemaining, { color: theme.colors.success }]}>{formatCountdownToDeadline(payDeadline, now)}</Text>
              <Text style={[styles.payBody, { marginTop: 6 }]}>Late or missing payment after this deadline may incur late fees/charges.</Text>
            </View>
          </View>
        </View>
      )}

      {/* Payment instructions */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="card-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.sectionTitle}>Payment instructions</Text>
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
              Bank details will be sent to your registered email
              {user?.email ? ` (${user.email})` : ""}.
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void Share.share({
                message: `XportACar invoice — ${v.year} ${v.make} ${v.model}\nTotal due: ${format(totalEur)}\nConfirm within 36h; then pay within 5 working days.`,
              });
            }}
            style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="share-outline" size={16} color={theme.colors.brand} />
            <Text style={styles.shareText}>Share invoice summary</Text>
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
          <Text style={styles.footerOutlineText}>Back to marketplace</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("VehicleDetail", { id: v.id })}
          style={({ pressed }) => [styles.footerOutline, pressed && { opacity: 0.92 }]}
        >
          <Ionicons name="document-text-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.footerOutlineText}>View vehicle</Text>
        </Pressable>
      </View>

      {/* Payment proof upload modal */}
      <Modal visible={proofOpen} transparent animationType="slide" onRequestClose={() => setProofOpen(false)}>
        <KeyboardAvoidingView style={styles.proofBackdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.proofSheet}>
            <View style={styles.proofHeader}>
              <Text style={styles.proofTitle}>Confirm payment & upload proof</Text>
              <Pressable onPress={() => setProofOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.proofSub}>
              Attach your transfer receipt (PDF, PNG or JPG — up to 5 files, 10MB each).
              Submitting confirms your intent to pay.
            </Text>

            <View style={styles.proofPickRow}>
              <Pressable onPress={addImage} style={({ pressed }) => [styles.proofPickBtn, pressed && { opacity: 0.9 }]}>
                <Ionicons name="image-outline" size={18} color={theme.colors.brand} />
                <Text style={styles.proofPickText}>Add photo</Text>
              </Pressable>
              <Pressable onPress={addDocument} style={({ pressed }) => [styles.proofPickBtn, pressed && { opacity: 0.9 }]}>
                <Ionicons name="document-outline" size={18} color={theme.colors.brand} />
                <Text style={styles.proofPickText}>Add PDF / file</Text>
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
              placeholder="Reference number, transfer details, etc. (optional)"
              placeholderTextColor={theme.colors.textLight}
              multiline
              style={styles.proofNote}
            />

            <Pressable
              onPress={submitProof}
              disabled={submitting || proofFiles.length === 0}
              style={({ pressed }) => [styles.proofSubmit, (submitting || proofFiles.length === 0) && { opacity: 0.5 }, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.proofSubmitText}>{submitting ? "Submitting…" : "Submit proof"}</Text>
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

  footer: { paddingHorizontal: 16, marginTop: 22, flexDirection: "row", gap: 10 },
  footerOutline: {
    flex: 1, height: 48, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: theme.colors.brand,
  },
  footerOutlineText: { color: theme.colors.brand, fontWeight: "800", fontSize: 13 },
});
