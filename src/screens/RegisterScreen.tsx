import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";

import { Button } from "../components/Button";
import { KeyboardAwareScroll } from "../components/KeyboardAwareScroll";
import { supabase } from "../lib/supabase";
import { useTranslation } from "../lib/i18n";
import { theme } from "../lib/theme";
import { registerForPush } from "../lib/push";
import {
  pickKycImage, pickKycDocument, uploadKycDocs,
  type PickedFile, type IdSubtype,
} from "../lib/kycUpload";

// Web origin for the register + KYC bridge. Ships in the OTA manifest (extra).
// Canonical www host (apex 307-redirects to www).
const WEB_URL =
  (Constants.expoConfig?.extra as { webUrl?: string } | undefined)?.webUrl ??
  "https://www.xportacar.com";

interface RegisterResponse {
  ok: boolean;
  error?: string;
  needsConfirm?: boolean;
  uploadToken?: string;
}

const ID_TYPES: { value: IdSubtype; key: string }[] = [
  { value: "passport",        key: "register.idPassport" },
  { value: "drivers_license", key: "register.idDriversLicense" },
  { value: "national_id",     key: "register.idNationalId" },
];

// The handle_new_user trigger normally creates the profile row atomically with
// the auth user, but be resilient: retry-read briefly, then upsert as a
// fallback (works thanks to the profiles self-insert RLS policy). Only runs when
// a SESSION exists (the upsert needs auth) — otherwise the web register endpoint
// already upserted the profile via the service role.
async function ensureProfile(
  userId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (data) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  try {
    await supabase.from("profiles").upsert({ id: userId, ...fields }, { onConflict: "id" });
  } catch { /* belt-and-braces — never block signup on this */ }
}

export function RegisterScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { t, locale } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  // KYC fields
  const [isBusiness, setIsBusiness] = useState(false);
  const [idSubtype, setIdSubtype] = useState<IdSubtype | null>(null);
  const [personalId, setPersonalId] = useState<PickedFile | null>(null);
  const [tradeLicense, setTradeLicense] = useState<PickedFile | null>(null);

  const submit = async () => {
    if (loading) return; // guard against double-taps queuing multiple sign-ups
    if (!email || !password || !fullName) {
      Alert.alert(t("register.missingTitle"), t("register.missingBody"));
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      Alert.alert(t("register.invalidEmailTitle"), t("register.invalidEmailBody"));
      return;
    }
    if (password.length < 8) {
      Alert.alert(t("register.weakPwdTitle"), t("register.min8Body"));
      return;
    }
    // KYC validation
    if (!idSubtype) {
      Alert.alert(t("register.kycStepTitle"), t("register.needIdType"));
      return;
    }
    if (!personalId) {
      Alert.alert(t("register.kycStepTitle"), t("register.needPersonalId"));
      return;
    }
    if (isBusiness && !company.trim()) {
      Alert.alert(t("register.kycStepTitle"), t("register.needCompany"));
      return;
    }
    if (isBusiness && !tradeLicense) {
      Alert.alert(t("register.kycStepTitle"), t("register.needTradeLicense"));
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = email.trim();

      // 1) Create the auth user via the web register endpoint. This triggers
      //    Supabase's confirmation email AND the welcome email server-side, and
      //    upserts the profile via the service role — so we no longer call
      //    supabase.auth.signUp / /api/notify/signup directly.
      let res: RegisterResponse;
      try {
        const r = await fetch(`${WEB_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            fullName,
            companyName: company || null,
            country: country || null,
            isBusiness,
            locale,
          }),
        });
        res = (await r.json().catch(() => ({ ok: false }))) as RegisterResponse;
        if (!r.ok && res.ok == null) res.ok = false;
      } catch {
        Alert.alert(t("register.createFailedTitle"), t("register.createFailedBody"));
        return;
      }

      if (!res.ok) {
        Alert.alert(t("register.createFailedTitle"), res.error ?? t("register.createFailedBody"));
        return;
      }

      // 2) Upload the KYC documents. Right after signup there's no session, so
      //    authenticate with the one-time uploadToken returned by /register.
      const upload = await uploadKycDocs({
        token: res.uploadToken,
        personalId,
        idSubtype,
        tradeLicense: isBusiness ? tradeLicense : null,
        isBusiness,
      });

      // 3a) Email confirmation required → no session yet. Tell them to check
      //     their inbox and go back to the sign-in screen.
      if (res.needsConfirm) {
        if (!upload.ok) {
          Alert.alert(t("register.kycDoneTitle"), t("register.uploadFailed"));
        } else {
          Alert.alert(t("register.checkEmailTitle"), t("register.checkEmailBody"));
        }
        navigation.goBack();
        return;
      }

      // 3b) Confirmation off → sign in so the session is set and RootNavigator
      //     swaps to the app, then trigger push registration like before.
      const { data: signIn } = await supabase.auth.signInWithPassword({
        email: cleanEmail, password,
      });
      const session = signIn?.session ?? null;
      const user = signIn?.user ?? null;

      if (session && user) {
        // Profile upsert needs auth — only attempt it with a session.
        await ensureProfile(user.id, {
          email: cleanEmail,
          full_name: fullName,
          company_name: company || null,
          country: country || null,
          role: "buyer",
          kyc_status: "pending",
        });
        try { void registerForPush().catch(() => {}); } catch { /* silent */ }
      }

      if (!upload.ok) {
        Alert.alert(t("register.kycDoneTitle"), t("register.uploadFailed"));
      } else {
        Alert.alert(t("register.welcomeTitle"), t("register.welcomeBody"));
      }
      // RootNavigator switches to the app automatically (session is set).
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={styles.container} style={{ backgroundColor: theme.colors.bg }}>
        <Text style={styles.title}>{t("auth.openTrade")}</Text>
        <Text style={styles.subtitle}>{t("auth.twoMinutes")}</Text>

        <Field label={t("auth.fullName")} required>
          <TextInput value={fullName} onChangeText={setFullName} placeholder="Klaus Weber" style={styles.input} placeholderTextColor={theme.colors.textLight} />
        </Field>

        <Field label={t("auth.company")} required={isBusiness}>
          <TextInput value={company} onChangeText={setCompany} placeholder="AutoHaus Weber GmbH" style={styles.input} placeholderTextColor={theme.colors.textLight} />
        </Field>
        <Field label={t("auth.country")}>
          <TextInput value={country} onChangeText={setCountry} placeholder="Germany" style={styles.input} placeholderTextColor={theme.colors.textLight} />
        </Field>
        <Field label={t("auth.email")} required>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@company.com"
            style={styles.input}
            placeholderTextColor={theme.colors.textLight}
          />
        </Field>
        <Field label={t("auth.password")} required>
          <View style={styles.pwRow}>
            <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPw} style={[styles.input, styles.pwInput]} placeholderTextColor={theme.colors.textLight} />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={theme.colors.textLight} />
            </Pressable>
          </View>
          <Text style={styles.hint}>{t("register.min8Hint")}</Text>
        </Field>

        {/* --- KYC: identity verification --- */}
        <View style={styles.kycHeader}>
          <Ionicons name="shield-checkmark-outline" size={16} color={theme.colors.brand} />
          <Text style={styles.kycTitle}>{t("register.kycStepTitle")}</Text>
        </View>
        <Text style={styles.kycHint}>{t("register.kycStepHint")}</Text>

        {/* ID type selector */}
        <Field label={t("register.idType")} required>
          <View style={styles.idTypeRow}>
            {ID_TYPES.map((it) => {
              const active = idSubtype === it.value;
              return (
                <Pressable
                  key={it.value}
                  onPress={() => setIdSubtype(it.value)}
                  style={[styles.idTypeChip, active && styles.idTypeChipActive]}
                >
                  <Text style={[styles.idTypeText, active && styles.idTypeTextActive]} numberOfLines={1}>
                    {t(it.key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {/* Personal ID picker */}
        <FilePickerField
          label={t("register.personalId")}
          required
          hint={t("register.personalIdHint")}
          file={personalId}
          onPick={setPersonalId}
        />

        {/* Business toggle — drives whether a trade licence is required */}
        <Field label={t("register.businessQ")}>
          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setIsBusiness(true)}
              style={[styles.segment, isBusiness && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, isBusiness && styles.segmentTextActive]}>{t("register.yes")}</Text>
            </Pressable>
            <Pressable
              onPress={() => setIsBusiness(false)}
              style={[styles.segment, !isBusiness && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, !isBusiness && styles.segmentTextActive]}>{t("register.no")}</Text>
            </Pressable>
          </View>
        </Field>

        {/* Trade licence — business only */}
        {isBusiness && (
          <FilePickerField
            label={t("register.tradeLicense")}
            required
            hint={t("register.tradeLicenseHint")}
            file={tradeLicense}
            onPick={setTradeLicense}
          />
        )}

        <Button label={loading ? t("register.uploading") : t("auth.createAccount")} onPress={submit} loading={loading} fullWidth style={{ marginTop: 8 }} />
        <Button label={t("auth.backToSignIn")} variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: 6 }} />
    </KeyboardAwareScroll>
  );
}

// A labelled file picker offering "Photo" (image library) or "File" (document).
// Reused for personal ID + trade licence. Mirrors AuctionWonScreen's picker.
function FilePickerField({
  label, required, hint, file, onPick,
}: {
  label: string;
  required?: boolean;
  hint: string;
  file: PickedFile | null;
  onPick: (f: PickedFile | null) => void;
}) {
  const { t } = useTranslation();
  const choosePhoto = async () => { const f = await pickKycImage(t); if (f) onPick(f); };
  const chooseFile  = async () => { const f = await pickKycDocument(); if (f) onPick(f); };

  return (
    <Field label={label} required={required}>
      <View style={styles.pickRow}>
        <Pressable onPress={choosePhoto} style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.9 }]}>
          <Ionicons name="image-outline" size={18} color={theme.colors.brand} />
          <Text style={styles.pickText}>{t("register.choosePhoto")}</Text>
        </Pressable>
        <Pressable onPress={chooseFile} style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.9 }]}>
          <Ionicons name="document-outline" size={18} color={theme.colors.brand} />
          <Text style={styles.pickText}>{t("register.chooseFile")}</Text>
        </Pressable>
      </View>
      {file ? (
        <View style={styles.fileRow}>
          <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
          <Pressable onPress={() => onPick(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textLight} />
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>{hint}</Text>
      )}
    </Field>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}{required && <Text style={{ color: theme.colors.error }}>  *</Text>}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 56, paddingBottom: 56 },
  title: { fontSize: 26, fontWeight: "800", color: theme.colors.text },
  subtitle: { marginTop: 6, color: theme.colors.textMuted, marginBottom: 24, fontSize: 14 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.text, marginBottom: 6 },
  hint:  { fontSize: 11, color: theme.colors.textLight, marginTop: 4 },
  input: {
    height: 46,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 14,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.white,
  },
  pwRow:   { justifyContent: "center" },
  pwInput: { paddingRight: 48 },
  eyeBtn:  { position: "absolute", right: 6, padding: 8 },

  // Business segmented toggle
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1, height: 46, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong,
    alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.white,
  },
  segmentActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  segmentText: { fontSize: 14, fontWeight: "700", color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.brand },

  // KYC section
  kycHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 6 },
  kycTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.text },
  kycHint: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17, marginBottom: 16 },

  // ID type chips
  idTypeRow: { flexDirection: "row", gap: 8 },
  idTypeChip: {
    flex: 1, height: 42, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6, backgroundColor: theme.colors.white,
  },
  idTypeChipActive: { borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight },
  idTypeText: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted },
  idTypeTextActive: { color: theme.colors.brand },

  // File picker buttons + chosen-file chip
  pickRow: { flexDirection: "row", gap: 10 },
  pickBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 44, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.brand, backgroundColor: theme.colors.brandLight,
  },
  pickText: { color: theme.colors.brand, fontWeight: "800", fontSize: 13 },
  fileRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, padding: 10, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  fileName: { flex: 1, fontSize: 13, color: theme.colors.text, fontWeight: "600" },
});
