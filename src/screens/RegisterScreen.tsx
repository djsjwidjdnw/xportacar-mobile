import { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";

import { Button } from "../components/Button";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { registerForPush } from "../lib/push";

export function RegisterScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password || !fullName) {
      Alert.alert("Missing info", "Name, email and password are required.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Use at least 8 characters.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName, company_name: company, country, role: "buyer" } },
    });
    setLoading(false);
    if (error) {
      Alert.alert("Couldn't sign up", error.message);
      return;
    }
    // Belt-and-braces upsert profile.
    if (data.user) {
      await supabase.from("profiles").upsert({
        id:           data.user.id,
        email:        email.trim(),
        full_name:    fullName,
        company_name: company || null,
        country:      country || null,
        role:         "buyer",
        kyc_status:   "pending",
      }, { onConflict: "id" });
    }
    if (data.session) {
      // Push is best-effort — Expo Go SDK 53+ removed push token support
      // so wrap defensively so a sync throw can't take the app down.
      try { void registerForPush().catch(() => {}); } catch { /* silent */ }
      Alert.alert("Welcome to XportACar", "Your trade account is live.");
    } else {
      Alert.alert("Check your email", "Confirm your email to finish signing up.");
      navigation.goBack();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Open a trade account</Text>
        <Text style={styles.subtitle}>Two minutes. Approved within a day.</Text>

        <Field label="Full name" required>
          <TextInput value={fullName} onChangeText={setFullName} placeholder="Klaus Weber" style={styles.input} placeholderTextColor={theme.colors.textLight} />
        </Field>
        <Field label="Company">
          <TextInput value={company} onChangeText={setCompany} placeholder="AutoHaus Weber GmbH" style={styles.input} placeholderTextColor={theme.colors.textLight} />
        </Field>
        <Field label="Country">
          <TextInput value={country} onChangeText={setCountry} placeholder="Germany" style={styles.input} placeholderTextColor={theme.colors.textLight} />
        </Field>
        <Field label="Email" required>
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
        <Field label="Password" required>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} placeholderTextColor={theme.colors.textLight} />
          <Text style={styles.hint}>At least 8 characters.</Text>
        </Field>

        <Button label={loading ? "Creating…" : "Create account"} onPress={submit} loading={loading} fullWidth style={{ marginTop: 8 }} />
        <Button label="Back to sign in" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: 6 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
});
