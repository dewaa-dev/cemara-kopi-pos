import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, FONT, RADII, SHADOW, SPACING } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import {
  BackupItem,
  backupSummary,
  createBackup,
  deleteBackup,
  listBackups,
  maybeAutoBackup,
  restoreBackup,
  shareBackup,
} from "@/src/db/extras";
import { useToast } from "@/src/components/Toast";

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export default function Backup() {
  const c = COLORS.light;
  const toast = useToast();
  const [items, setItems] = useState<BackupItem[]>([]);
  const [summary, setSummary] = useState({
    lastBackup: null as string | null,
    count: 0,
    totalBytes: 0,
    daysSinceLastBackup: null as number | null,
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, s] = await Promise.all([listBackups(), backupSummary()]);
    setItems(list);
    setSummary(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    maybeAutoBackup().then(() => load());
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doBackup = async () => {
    try {
      setBusy(true);
      await createBackup("manual");
      toast.show("Backup berhasil dibuat", "success");
      load();
    } catch (e: any) {
      toast.show("Gagal backup: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  const doRestore = async (b: BackupItem) => {
    try {
      setBusy(true);
      await restoreBackup(b);
      toast.show("Restore berhasil. Restart aplikasi.", "success");
    } catch (e: any) {
      toast.show("Gagal restore: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  const doDelete = async (b: BackupItem) => {
    await deleteBackup(b);
    toast.show("Backup dihapus", "success");
    load();
  };

  const doShare = async (b: BackupItem) => {
    try {
      await shareBackup(b);
    } catch (e: any) {
      toast.show("Tidak bisa membagikan", "error");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Backup & Restore" subtitle="Database lokal" showBack testID="backup-header" />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        <View style={[styles.heroCard, { backgroundColor: c.brand }]} testID="backup-hero">
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>Backup Terakhir</Text>
            <Text style={styles.heroValue}>
              {summary.lastBackup
                ? new Date(summary.lastBackup).toLocaleString("id-ID")
                : "Belum ada backup"}
            </Text>
            <Text style={styles.heroSub}>
              {summary.count} file • {fmtBytes(summary.totalBytes)}
            </Text>
            {summary.daysSinceLastBackup !== null && summary.daysSinceLastBackup >= 3 && (
              <View style={styles.heroAlert}>
                <MaterialCommunityIcons name="alert-circle" size={14} color="#FFD180" />
                <Text style={styles.heroAlertText}>
                  Backup terakhir {summary.daysSinceLastBackup} hari lalu
                </Text>
              </View>
            )}
          </View>
          <MaterialCommunityIcons name="database-check" size={48} color="rgba(255,255,255,0.85)" />
        </View>

        <Pressable
          testID="manual-backup"
          onPress={doBackup}
          disabled={busy}
          android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          style={[styles.cta, { backgroundColor: c.brand, opacity: busy ? 0.7 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialCommunityIcons name="cloud-upload" size={20} color="#fff" />
              <Text style={styles.ctaText}>Backup Sekarang</Text>
            </>
          )}
        </Pressable>

        <View style={[styles.infoCard, { backgroundColor: c.surfaceSecondary }]}>
          <MaterialCommunityIcons name="information" size={18} color={c.info} />
          <Text style={[styles.infoText, { color: c.onSurfaceMuted }]}>
            Auto backup berjalan otomatis sekali per hari saat aplikasi dibuka. File disimpan di penyimpanan internal device dengan format <Text style={{ fontWeight: "800" }}>backup_YYYY_MM_DD.db</Text>. Siap untuk sinkronisasi Google Drive di versi berikutnya.
          </Text>
        </View>

        <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Riwayat Backup</Text>
        {loading ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 20 }} />
        ) : items.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 30 }}>
            <MaterialCommunityIcons name="database-off" size={42} color={c.onSurfaceMuted} />
            <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Belum ada file backup</Text>
          </View>
        ) : (
          items.map((b) => (
            <View key={b.id} style={[styles.bkRow, { backgroundColor: c.surfaceSecondary }]} testID={`bk-${b.id}`}>
              <View style={[styles.bkIcon, { backgroundColor: c.brandSoft }]}>
                <MaterialCommunityIcons name="file-cabinet" size={20} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.onSurface, fontWeight: "700" }} numberOfLines={1}>{b.file_name}</Text>
                <Text style={{ color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 }}>
                  {new Date(b.created_at).toLocaleString("id-ID")} • {fmtBytes(b.size_bytes)} • {b.kind === "auto" ? "Otomatis" : "Manual"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable testID={`bk-share-${b.id}`} onPress={() => doShare(b)} hitSlop={6}>
                  <MaterialCommunityIcons name="share-variant" size={20} color={c.info} />
                </Pressable>
                <Pressable testID={`bk-restore-${b.id}`} onPress={() => doRestore(b)} hitSlop={6}>
                  <MaterialCommunityIcons name="backup-restore" size={20} color={c.success} />
                </Pressable>
                <Pressable testID={`bk-delete-${b.id}`} onPress={() => doDelete(b)} hitSlop={6}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color={c.error} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heroCard: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, borderRadius: RADII.md, ...SHADOW.fab, marginBottom: SPACING.md },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
  heroValue: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 4 },
  heroSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 4 },
  heroAlert: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  heroAlertText: { color: "#FFD180", fontSize: 11, fontWeight: "700" },
  cta: { height: 54, borderRadius: RADII.md, alignItems: "center", justifyContent: "center", marginBottom: SPACING.md, flexDirection: "row", gap: 8, ...SHADOW.fab },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  infoCard: { flexDirection: "row", gap: 8, padding: 12, borderRadius: RADII.md, marginBottom: SPACING.md },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  section: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 12, marginBottom: 8 },
  bkRow: { flexDirection: "row", alignItems: "center", padding: SPACING.md, gap: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm, ...SHADOW.card },
  bkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
