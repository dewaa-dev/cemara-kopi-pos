import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, FONT, RADII, SHADOW, SPACING } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { dbHealth } from "@/src/db/extras";

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export default function DbHealth() {
  const c = COLORS.light;
  const [h, setH] = useState<Awaited<ReturnType<typeof dbHealth>> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await dbHealth();
    setH(r);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const statusColor =
    h?.overallStatus === "critical"
      ? c.error
      : h?.overallStatus === "warning"
      ? c.warning
      : c.success;
  const statusLabel =
    h?.overallStatus === "critical"
      ? "Critical"
      : h?.overallStatus === "warning"
      ? "Warning"
      : "Normal";

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Kesehatan Database" subtitle="Monitoring & status" showBack testID="dbhealth-header" />

      {loading ? (
        <ActivityIndicator color={c.brand} style={{ marginTop: 30 }} />
      ) : !h ? null : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
          <View style={[styles.statusCard, { backgroundColor: statusColor }]} testID="health-status">
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>Status Keseluruhan</Text>
              <Text style={styles.statusValue}>{statusLabel}</Text>
              {h.warnings.length > 0 && (
                <View style={{ marginTop: 8, gap: 4 }}>
                  {h.warnings.map((w, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <MaterialCommunityIcons name="alert-circle" size={14} color="#fff" />
                      <Text style={styles.statusWarn}>{w}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <MaterialCommunityIcons
              name={
                h.overallStatus === "critical"
                  ? "alert-octagon"
                  : h.overallStatus === "warning"
                  ? "alert"
                  : "shield-check"
              }
              size={48}
              color="rgba(255,255,255,0.85)"
            />
          </View>

          <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Statistik Database</Text>
          <View style={styles.grid}>
            <Stat label="Produk" v={h.products} icon="package-variant" color={c.brand} testID="stat-products" />
            <Stat label="Kategori" v={h.categories} icon="tag-multiple" color={c.accent} testID="stat-categories" />
            <Stat label="Transaksi" v={h.transactions} icon="receipt" color={c.secondary} testID="stat-tx" />
            <Stat label="Draft" v={h.drafts} icon="clipboard-text" color={c.info} testID="stat-drafts" />
            <Stat label="Pengguna" v={h.users} icon="account-multiple" color={c.success} testID="stat-users" />
            <Stat label="Cash Flow" v={h.cashFlowCount} icon="cash-multiple" color={c.warning} testID="stat-cf" />
          </View>

          <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Storage & Backup</Text>
          <Row icon="database" label="Ukuran Database" value={fmtBytes(h.dbSizeBytes)} />
          <Row icon="cloud-check" label="Jumlah File Backup" value={`${h.backupCount} file`} />
          <Row
            icon="clock-outline"
            label="Backup Terakhir"
            value={
              h.lastBackup
                ? new Date(h.lastBackup).toLocaleString("id-ID") +
                  (h.daysSinceLastBackup !== null ? ` (${h.daysSinceLastBackup} hari lalu)` : "")
                : "Belum pernah"
            }
          />

          <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Keamanan</Text>
          <Row icon="shield-lock" label="Status Enkripsi" value={h.encryptionStatus} />
          <Row icon="cellphone-key" label="Storage" value="Internal Android (sandboxed)" />
          <Row icon="check-circle" label="Auto Backup" value="Aktif (harian saat dibuka)" />
        </ScrollView>
      )}
    </View>
  );
}

const Stat = ({ label, v, icon, color, testID }: any) => {
  const c = COLORS.light;
  return (
    <View testID={testID} style={[styles.stat, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "1F" }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statLabel, { color: c.onSurfaceMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.onSurface }]}>{v}</Text>
    </View>
  );
};

const Row = ({ icon, label, value }: { icon: any; label: string; value: string }) => {
  const c = COLORS.light;
  return (
    <View style={[styles.row, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}>
        <MaterialCommunityIcons name={icon} size={18} color={c.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.onSurfaceMuted, fontSize: 11, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: c.onSurface, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusCard: { flexDirection: "row", alignItems: "center", padding: SPACING.lg, borderRadius: RADII.md, marginBottom: SPACING.md, ...SHADOW.fab },
  statusLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
  statusValue: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 4 },
  statusWarn: { color: "#fff", fontSize: 11, flex: 1 },
  section: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: SPACING.md, marginBottom: SPACING.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  stat: { width: "47.8%", padding: SPACING.md, borderRadius: RADII.md, ...SHADOW.card },
  statIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  statLabel: { fontSize: 11, fontWeight: "600" },
  statValue: { fontSize: FONT.sizes.xxl, fontWeight: "800", marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm, ...SHADOW.card },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
