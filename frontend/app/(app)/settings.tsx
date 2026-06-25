import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, RADII, SHADOW, SPACING } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { getSettings, setSetting } from "@/src/db/repo";
import { useToast } from "@/src/components/Toast";

const FIELDS: { key: string; label: string; icon: any; placeholder?: string; numeric?: boolean }[] = [
  { key: "store_name", label: "Nama Toko", icon: "store-outline" },
  { key: "store_address", label: "Alamat", icon: "map-marker-outline" },
  { key: "store_whatsapp", label: "Nomor WhatsApp", icon: "whatsapp", placeholder: "08xxxxxxxxxx" },
  { key: "tax_percent", label: "Pajak (%)", icon: "percent-outline", numeric: true, placeholder: "0" },
  { key: "receipt_footer", label: "Footer Struk", icon: "format-text" },
];

export default function Settings() {
  const c = COLORS.light;
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<typeof FIELDS[number] | null>(null);
  const [val, setVal] = useState("");

  const load = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onOpen = (f: typeof FIELDS[number]) => {
    setEditing(f);
    setVal(settings[f.key] ?? "");
  };

  const save = async () => {
    if (!editing) return;
    await setSetting(editing.key, val);
    toast.show("Tersimpan", "success");
    setEditing(null);
    load();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Pengaturan Toko" subtitle="Identitas & konfigurasi" showBack testID="settings-header" />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <View style={[styles.brandCard, { backgroundColor: c.brand }]}>
          <MaterialCommunityIcons name="coffee" size={38} color="#fff" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.brandName}>{settings.store_name || "Cemara Kopi"}</Text>
            <Text style={styles.brandSub}>{settings.store_address || "Alamat belum diatur"}</Text>
          </View>
        </View>

        <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Identitas</Text>
        {FIELDS.map((f) => (
          <Pressable
            key={f.key}
            testID={`setting-${f.key}`}
            onPress={() => onOpen(f)}
            android_ripple={{ color: c.brandSoft }}
            style={[styles.row, { backgroundColor: c.surfaceSecondary }]}
          >
            <View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}>
              <MaterialCommunityIcons name={f.icon} size={20} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.onSurfaceMuted, fontSize: 11, fontWeight: "700" }}>{f.label}</Text>
              <Text style={{ color: c.onSurface, fontSize: 14, marginTop: 2 }} numberOfLines={1}>
                {settings[f.key] || "—"}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={c.onSurfaceMuted} />
          </Pressable>
        ))}

        <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Tentang</Text>
        <View style={[styles.aboutCard, { backgroundColor: c.surfaceSecondary }]}>
          <MaterialCommunityIcons name="information-outline" size={18} color={c.info} />
          <Text style={[styles.aboutText, { color: c.onSurfaceMuted }]}>
            Cemara Kopi POS v1.1 • 100% Offline-first • Database tersimpan aman di internal storage Android. Aplikasi siap dikembangkan untuk sinkronisasi cloud di versi berikutnya tanpa mengubah struktur inti.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBg}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.onSurface }]}>{editing?.label}</Text>
              <Pressable onPress={() => setEditing(null)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
              </Pressable>
            </View>
            <TextInput
              testID="setting-input"
              value={val}
              onChangeText={setVal}
              placeholder={editing?.placeholder ?? editing?.label}
              placeholderTextColor={c.onSurfaceMuted}
              keyboardType={editing?.numeric ? "numeric" : "default"}
              autoFocus
              multiline={editing?.key === "receipt_footer" || editing?.key === "store_address"}
              style={[styles.input, { borderColor: c.border, color: c.onSurface, marginTop: SPACING.md, minHeight: editing?.key === "receipt_footer" || editing?.key === "store_address" ? 80 : 48 }]}
            />
            <Pressable
              testID="setting-save"
              onPress={save}
              android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              style={[styles.modalCta, { backgroundColor: c.brand }]}
            >
              <Text style={styles.modalCtaText}>Simpan</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandCard: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, borderRadius: RADII.md, marginBottom: SPACING.md, ...SHADOW.fab },
  brandName: { color: "#fff", fontSize: 18, fontWeight: "800" },
  brandSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  section: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: SPACING.md, marginBottom: SPACING.sm },
  row: { flexDirection: "row", alignItems: "center", padding: SPACING.md, gap: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm, ...SHADOW.card },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  aboutCard: { flexDirection: "row", gap: 8, padding: 12, borderRadius: RADII.md, marginBottom: SPACING.md },
  aboutText: { flex: 1, fontSize: 12, lineHeight: 17 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: "#D0CCC6", marginBottom: SPACING.md },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalCta: { height: 54, borderRadius: RADII.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.md, overflow: "hidden", ...SHADOW.fab },
  modalCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  input: { borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: SPACING.md, fontSize: 14, paddingVertical: 12 },
});
