import { useState } from "react";
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "../components/Button";
import { KeyboardAwareScroll } from "../components/KeyboardAwareScroll";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { registerForPush } from "../lib/push";
import { useTranslation } from "../lib/i18n";

export function LoginScreen({ navigation }: { navigation: { navigate: (s: string) => void } }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot-password modal
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const signIn = async () => {
    if (loading) return; // guard against double-taps queuing multiple sign-ins
    if (!email || !password) {
      Alert.alert(t("register.missingTitle"), t("auth.missing"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      Alert.alert(t("auth.signInFailed"), error.message);
      return;
    }
    try { void registerForPush().catch(() => {}); } catch { /* silent */ }
  };

  const openReset = () => {
    setResetEmail(email.trim());
    setResetSent(false);
    setResetOpen(true);
  };

  const sendReset = async () => {
    if (resetSending) return;
    const addr = resetEmail.trim();
    if (!addr) {
      Alert.alert(t("pw.resetTitle"), t("pw.emailRequired"));
      return;
    }
    setResetSending(true);
    // Ignore the error detail — show the neutral "sent" message either way so we
    // don't leak whether an account exists for this email.
    try {
      await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: "https://www.xportacar.com/reset-password/callback",
      });
    } catch { /* neutral — show sent regardless */ }
    setResetSending(false);
    setResetSent(true);
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={styles.container} style={{ backgroundColor: theme.colors.white }}>
      {/* Logo + tagline */}
        <View style={styles.header}>
          <Image source={require("../../assets/logo.jpg")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>{t("auth.tagline")}</Text>
        </View>

        <Text style={styles.title}>{t("auth.welcomeBack")}</Text>
        <Text style={styles.subtitle}>{t("auth.signInBlurb")}</Text>

        <Field label={t("auth.email")}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@company.com"
            placeholderTextColor={theme.colors.textLight}
            style={styles.input}
          />
        </Field>

        <Field label={t("auth.password")}>
          <View style={styles.pwRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
              autoComplete="password"
              placeholderTextColor={theme.colors.textLight}
              style={[styles.input, styles.pwInput]}
            />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8} style={styles.eyeBtn}>
              <Ionicons
                name={showPw ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={theme.colors.textLight}
              />
            </Pressable>
          </View>
        </Field>

        <Pressable onPress={openReset} hitSlop={8} style={styles.forgotBtn}>
          <Text style={styles.forgotText}>{t("pw.forgot")}</Text>
        </Pressable>

        {/* Gradient sign-in button */}
        <GradientButton
          label={loading ? t("auth.signingIn") : t("auth.signIn")}
          onPress={signIn}
          loading={loading}
        />

        <Button
          label={t("auth.createAccount")}
          variant="ghost"
          onPress={() => navigation.navigate("Register")}
          style={{ marginTop: 4 }}
        />

      {/* Forgot-password modal */}
      <Modal
        visible={resetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!resetSending) setResetOpen(false); }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={theme.colors.brand} />
              </View>
              <Text style={styles.modalTitle}>{t("pw.resetTitle")}</Text>
              <Pressable onPress={() => { if (!resetSending) setResetOpen(false); }} hitSlop={10} disabled={resetSending}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {resetSent ? (
              <>
                <Text style={styles.modalBody}>{t("pw.sent")}</Text>
                <Pressable
                  onPress={() => setResetOpen(false)}
                  style={({ pressed }) => [styles.modalPrimaryBtn, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.modalPrimaryText}>{t("auth.backToSignIn")}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalBody}>{t("pw.resetBody")}</Text>
                <Text style={styles.modalLabel}>{t("auth.email")}</Text>
                <TextInput
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="you@company.com"
                  placeholderTextColor={theme.colors.textLight}
                  editable={!resetSending}
                  style={styles.modalInput}
                />
                <Pressable
                  onPress={sendReset}
                  disabled={resetSending}
                  style={({ pressed }) => [styles.modalPrimaryBtn, resetSending && { opacity: 0.6 }, pressed && { opacity: 0.9 }]}
                >
                  {resetSending && <ActivityIndicator size="small" color={theme.colors.white} />}
                  <Text style={styles.modalPrimaryText}>{t("pw.sendLink")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => { if (!resetSending) setResetOpen(false); }}
                  disabled={resetSending}
                  style={({ pressed }) => [styles.modalCancelBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.modalCancelText}>{t("pw.cancel")}</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAwareScroll>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function GradientButton({ label, onPress, loading }: { label: string; onPress: () => void; loading: boolean }) {
  // The WHOLE gradient is the tap target (a Pressable), not just the text — the
  // old `<Text onPress>` made only the glyphs tappable, so taps on the rest of
  // the 52pt button did nothing (the "tap several times, no response" bug).
  // Pressed opacity gives instant feedback; a spinner shows while signing in.
  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      style={({ pressed }) => [{ marginTop: 14 }, pressed && !loading && { opacity: 0.85 }]}
    >
      <LinearGradient
        colors={[theme.colors.brand, theme.colors.brandDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBtnWrap}
      >
        {loading && <ActivityIndicator size="small" color={theme.colors.white} style={{ marginRight: 8 }} />}
        <Text style={styles.gradientBtnLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 56, paddingBottom: 48 },
  header:    { alignItems: "center", marginBottom: 32 },
  logo:      { width: 180, height: 72 },
  tagline:   { marginTop: 10, fontSize: 13, fontWeight: "600", color: theme.colors.brand, letterSpacing: 0.5 },
  title:     { fontSize: 28, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  subtitle:  { marginTop: 6, color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: 24 },
  field:     { marginBottom: 16 },
  label:     { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.bgAlt,
  },
  pwRow:   { justifyContent: "center" },
  pwInput: { paddingRight: 48 },
  eyeBtn:  { position: "absolute", right: 8, padding: 8 },
  gradientBtnWrap: {
    height: 52, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center",
    shadowColor: theme.colors.brand, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  gradientBtnLabel: { color: theme.colors.white, fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },

  forgotBtn:  { alignSelf: "flex-end", marginTop: -4, marginBottom: 4, paddingVertical: 4 },
  forgotText: { fontSize: 13, fontWeight: "700", color: theme.colors.brand },

  // Forgot-password modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalSheet: { backgroundColor: theme.colors.white, borderRadius: 20, padding: 20, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  modalIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.brandLight, alignItems: "center", justifyContent: "center" },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: theme.colors.text },
  modalBody: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  modalLabel: { fontSize: 11, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  modalInput: { height: 48, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 14, color: theme.colors.text, fontSize: 15, backgroundColor: theme.colors.bgAlt },
  modalPrimaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 48, borderRadius: theme.radius.lg, backgroundColor: theme.colors.brand, marginTop: 4,
  },
  modalPrimaryText: { color: theme.colors.white, fontWeight: "800", fontSize: 15 },
  modalCancelBtn: { height: 44, alignItems: "center", justifyContent: "center" },
  modalCancelText: { color: theme.colors.textMuted, fontWeight: "800", fontSize: 14 },
});
