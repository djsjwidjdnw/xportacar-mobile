import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "../components/Button";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { theme } from "../lib/theme";
import type { ProfileRow } from "../lib/types";

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      const p = data as ProfileRow | null;
      setProfile(p);
      setFullName(p?.full_name ?? "");
      setCompany(p?.company_name ?? "");
      setCountry(p?.country ?? "");
      setPhone(p?.phone ?? "");
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, company_name: company || null, country: country || null, phone: phone || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    Alert.alert("Saved", "Profile updated.");
  };

  if (!user) {
    return <View style={styles.empty}><Text style={styles.muted}>Sign in to view your profile.</Text></View>;
  }

  const kycTag = profile?.kyc_status === "verified"
    ? { bg: theme.colors.successBg, fg: theme.colors.success, l: "KYC verified" }
    : profile?.kyc_status === "rejected"
    ? { bg: theme.colors.errorBg, fg: theme.colors.error, l: "KYC rejected" }
    : { bg: theme.colors.warningBg, fg: theme.colors.warning, l: "KYC pending" };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.card}>
        <Text style={styles.name}>{profile?.full_name ?? user.email}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.row}>
          <View style={[styles.tag, { backgroundColor: theme.colors.bgAlt }]}>
            <Text style={styles.tagText}>{profile?.role ?? "buyer"}</Text>
          </View>
          <View style={[styles.tag, { backgroundColor: kycTag.bg }]}>
            <Text style={[styles.tagText, { color: kycTag.fg }]}>{kycTag.l}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { marginTop: 16 }]}>
        <Text style={styles.section}>Account details</Text>
        <Field label="Full name"><TextInput value={fullName} onChangeText={setFullName} style={styles.input} /></Field>
        <Field label="Company"><TextInput value={company} onChangeText={setCompany} style={styles.input} /></Field>
        <Field label="Country"><TextInput value={country} onChangeText={setCountry} style={styles.input} /></Field>
        <Field label="Phone"><TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" /></Field>
        <Button label={saving ? "Saving…" : "Save changes"} onPress={save} loading={saving} fullWidth style={{ marginTop: 8 }} />
      </View>

      <Button label="Sign out" variant="outline" onPress={signOut} fullWidth style={{ marginTop: 16 }} />
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", color: theme.colors.text, marginBottom: 12 },
  card: { backgroundColor: theme.colors.white, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: 16 },
  name: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  email: { fontSize: 12, color: theme.colors.textLight, marginTop: 2 },
  row: { flexDirection: "row", gap: 8, marginTop: 10 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full },
  tagText: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted, textTransform: "capitalize" },
  section: { fontSize: 15, fontWeight: "800", color: theme.colors.text, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "700", color: theme.colors.textLight, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  input: { height: 46, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong, paddingHorizontal: 12, color: theme.colors.text, fontSize: 14, backgroundColor: theme.colors.white },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  muted: { color: theme.colors.textLight, textAlign: "center" },
});
