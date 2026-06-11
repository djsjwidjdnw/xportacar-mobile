import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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

  const signIn = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", t("auth.missing"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      Alert.alert("Sign in failed", error.message);
      return;
    }
    try { void registerForPush().catch(() => {}); } catch { /* silent */ }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={styles.container} style={{ backgroundColor: theme.colors.white }}>
      {/* Logo + tagline */}
        <View style={styles.header}>
          <Image source={require("../../assets/logo.jpg")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.tagline}>Export Cars. Connect Worlds.</Text>
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
  return (
    <View style={{ marginTop: 14 }}>
      <LinearGradient
        colors={[theme.colors.brand, theme.colors.brandDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBtnWrap}
      >
        <Text
          onPress={loading ? undefined : onPress}
          style={styles.gradientBtnLabel}
          suppressHighlighting
        >
          {label}
        </Text>
      </LinearGradient>
    </View>
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
    height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center",
    shadowColor: theme.colors.brand, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  gradientBtnLabel: { color: theme.colors.white, fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
});
