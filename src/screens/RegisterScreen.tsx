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

// Web origin for the welcome-email bridge. Ships in the OTA manifest (extra).
const WEB_URL =
  (Constants.expoConfig?.extra as { webUrl?: string } | undefined)?.webUrl ??
  "https://xportacar.com";

// The handle_new_user trigger normally creates the profile row atomically with
// the auth user, but be resilient: retry-read briefly, then upsert as a
// fallback (works thanks to the profiles self-insert RLS policy). Keeps account
// setup invisible to the user instead of surfacing a transient "not found".
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
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    try {
      const cleanEmail = email.trim();
      const { data: signUp, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: fullName, company_name: company, country, role: "buyer" } },
      });

      let session = signUp?.session ?? null;
      let user = signUp?.user ?? null;

      // The first network call on a cold install can fail client-side even when
      // the account WAS created server-side (this produced the misleading
      // "network connection" error). If signUp errored or returned no session,
      // try to sign in — recovers the account silently.
      if (signUpError || !session) {
        const { data: signIn } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signIn?.session) {
          session = signIn.session;
          user = signIn.user;
        }
      }

      // Genuine failure (no account created and couldn't sign in).
      if (!user) {
        Alert.alert(
          t("register.createFailedTitle"),
          signUpError?.message ?? t("register.createFailedBody"),
        );
        return;
      }

      // Make sure the profile row exists before we proceed (invisible to user).
      await ensureProfile(user.id, {
        email: cleanEmail,
        full_name: fullName,
        company_name: company || null,
        country: country || null,
        role: "buyer",
        kyc_status: "pending",
      });

      if (session) {
        // Trigger the welcome email server-side (best-effort, never blocks).
        try {
          await fetch(`${WEB_URL}/api/notify/signup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: "{}",
          });
        } catch { /* best-effort — email must never block signup */ }

        try { void registerForPush().catch(() => {}); } catch { /* silent */ }
        Alert.alert(t("register.welcomeTitle"), t("register.welcomeBody"));
        // RootNavigator switches to the app automatically (session is set).
      } else {
        // Email confirmation is required (no session yet).
        Alert.alert(t("register.checkEmailTitle"), t("register.checkEmailBody"));
        navigation.goBack();
      }
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
        <Field label={t("auth.company")}>
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

        <Button label={loading ? t("auth.creating") : t("auth.createAccount")} onPress={submit} loading={loading} fullWidth style={{ marginTop: 8 }} />
        <Button label={t("auth.backToSignIn")} variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: 6 }} />
    </KeyboardAwareScroll>
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
});
