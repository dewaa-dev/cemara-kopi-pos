import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS, RADII, SHADOW, SPACING } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useAuth } from "@/src/contexts/AuthContext";

type HubItem = {
  key: string;
  label: string;
  desc: string;
  icon: any;
  route: string;
  color: string;
  adminOnly?: boolean;
};

export default function More() {
  const c = COLORS.light;
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  const items: HubItem[] = [
    {
      key: "laporan",
      label: "Laporan",
      desc: "Penjualan & rekap periode",
      icon: "chart-bar",
      route: "/(app)/reports",
      color: c.brand,
    },
    {
      key: "cashflow",
      label: "Cash Flow",
      desc: "Kas masuk & keluar",
      icon: "swap-vertical-bold",
      route: "/(app)/cashflow",
      color: c.accent,
    },
    {
      key: "drafts",
      label: "Draft Order",
      desc: "Pesanan belum dibayar",
      icon: "clipboard-text-clock-outline",
      route: "/(app)/drafts",
      color: c.secondary,
    },
    {
      key: "backup",
      label: "Backup & Restore",
      desc: "Backup database lokal",
      icon: "cloud-upload-outline",
      route: "/(app)/backup",
      color: c.info,
      adminOnly: true,
    },
    {
      key: "dbhealth",
      label: "Kesehatan Database",
      desc: "Monitor & status",
      icon: "shield-check-outline",
      route: "/(app)/dbhealth",
      color: c.success,
      adminOnly: true,
    },
    {
      key: "settings",
      label: "Pengaturan Toko",
      desc: "Identitas & konfigurasi",
      icon: "cog-outline",
      route: "/(app)/settings",
      color: "#6B6873",
      adminOnly: true,
    },
    {
      key: "printer",
      label: "Printer Bluetooth",
      desc: "Thermal 58mm / 80mm",
      icon: "printer-pos",
      route: "/(app)/printer",
      color: "#0066CC",
    },
  ];

  const visible = items.filter((it) => isAdmin || !it.adminOnly);

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Lainnya" subtitle="Menu & pengaturan" testID="more-header" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.userCard, { backgroundColor: c.surfaceSecondary }]} testID="user-card">
          <View style={[styles.userAvatar, { backgroundColor: c.brandSoft }]}>
            <MaterialCommunityIcons
              name={user?.role === "admin" ? "shield-account" : "account-circle"}
              size={28}
              color={c.brand}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: c.onSurface }]}>{user?.name}</Text>
            <Text style={[styles.userRole, { color: c.onSurfaceMuted }]}>
              {user?.role === "admin" ? "Administrator" : "Kasir"} • @{user?.username}
            </Text>
          </View>
        </View>

        <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Menu</Text>
        <View style={styles.grid}>
          {visible.map((it) => (
            <Pressable
              key={it.key}
              testID={`hub-${it.key}`}
              onPress={() => router.push(it.route as any)}
              android_ripple={{ color: c.brandSoft }}
              style={[styles.gridItem, { backgroundColor: c.surfaceSecondary }]}
            >
              <View style={[styles.gridIcon, { backgroundColor: it.color + "1F" }]}>
                <MaterialCommunityIcons name={it.icon} size={26} color={it.color} />
              </View>
              <Text style={[styles.gridLabel, { color: c.onSurface }]} numberOfLines={1}>
                {it.label}
              </Text>
              <Text style={[styles.gridDesc, { color: c.onSurfaceMuted }]} numberOfLines={2}>
                {it.desc}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          testID="logout-button"
          onPress={logout}
          android_ripple={{ color: "#FFB4AB55" }}
          style={[styles.logoutBtn, { borderColor: c.error }]}
        >
          <MaterialCommunityIcons name="logout" size={20} color={c.error} />
          <Text style={{ color: c.error, fontWeight: "800" }}>Keluar</Text>
        </Pressable>

        <Text style={[styles.version, { color: c.onSurfaceMuted }]}>
          Cemara Kopi POS v1.1 • 100% Offline • Secure Local Storage
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 120 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    ...SHADOW.card,
  },
  userAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { fontSize: 16, fontWeight: "800" },
  userRole: { fontSize: 12, marginTop: 2 },
  section: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md },
  gridItem: {
    width: "47.8%",
    padding: SPACING.md,
    borderRadius: RADII.md,
    minHeight: 130,
    ...SHADOW.card,
  },
  gridIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  gridLabel: { fontSize: 14, fontWeight: "800" },
  gridDesc: { fontSize: 11, marginTop: 4, lineHeight: 14 },
  logoutBtn: {
    marginTop: SPACING.xl,
    height: 50,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  version: { textAlign: "center", marginTop: SPACING.lg, fontSize: 11 },
});
