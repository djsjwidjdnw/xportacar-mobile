import { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";

import { Button } from "../components/Button";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { registerForPush } from "../lib/push";

export function LoginScreen({ navigation }: { navigation: { navigate: (s: string) => void } }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      Alert.alert("Sign in failed", error.message);
      return;
    }
    // Fire-and-forget push registration.
    registerForPush().catch(() => {});
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.logo}><Text style={styles.logoMark}>X</Text></View>
          <Text style={styles.brand}>XportACar</Text>
        </View>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Sign in to bid on premium UAE-sourced vehicles.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
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
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholderTextColor={theme.colors.textLight}
            style={styles.input}
          />
        </View>

        <Button label={loading ? "Signing in…" : "Sign in"} onPress={signIn} loading={loading} fullWidth style={{ marginTop: 8 }} />

        <Button
          label="Create a trade account"
          variant="ghost"
          onPress={() => navigation.navigate("Register")}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, paddingBottom: 48 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 40 },
  logo: { width: 36, height: 36, borderRadius: 8, backgroundColor: theme.colors.brand, alignItems: "center", justifyContent: "center" },
  logoMark: { color: theme.colors.white, fontWeight: "800", fontSize: 18 },
  brand: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  title: { fontSize: 28, fontWeight: "800", color: theme.colors.text },
  subtitle: { marginTop: 8, color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 28 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: theme.colors.text, marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: 14,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: theme.colors.white,
  },
});
