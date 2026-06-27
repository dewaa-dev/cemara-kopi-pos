import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, FONT, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import { dashboardSummary, Product } from "@/src/db/repo";
import { useAuth } from "@/src/contexts/AuthContext";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Summary = Awaited<ReturnType<typeof dashboardSummary>>;
type DayData = { date: string; total: number };

// ✅ FIXED: hapus + 1 yang bikin hari maju 1
const dayLabel = (d: string) => {
  const [year, month, day] = d.split("-").map(Number);
  const dt = new Date(year, month - 1, day);
  return ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][dt.getDay()];
};

const fullDayLabel = (d: string) => {
  const [year, month, day] = d.split("-").map(Number);
  const dt = new Date(year, month - 1, day);
  return ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][dt.getDay()];
};

const formatDate = (d: string) => {
  const [year, month, day] = d.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${day} ${months[month - 1]} ${year}`;
};

// ─── SalesChart ───────────────────────────────────────────────────────────────
const SalesChart = ({ data }: { data: DayData[] }) => {
  const c = COLORS.light;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const animVals = useRef<Animated.Value[]>([]);
  const tooltipAnim = useRef(new Animated.Value(0)).current;

  const maxVal = Math.max(...data.map((s) => s.total), 1);

  // FIX: init animated values dengan useMemo agar jumlah selalu sinkron
  // Ini lebih aman daripada mutate ref langsung karena re-render berurutan
  const animValsMemo = React.useMemo(
    () => data.map(() => new Animated.Value(0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.length]
  );
  if (animVals.current.length !== data.length) {
    animVals.current = animValsMemo;
  }

  // Animate bars in on mount / data change
  useEffect(() => {
    const anims = animVals.current.map((av, i) =>
      Animated.spring(av, {
        toValue: Math.max(0.04, data[i].total / maxVal),
        useNativeDriver: false,
        damping: 14,
        stiffness: 120,
        delay: i * 40,
      })
    );
    Animated.stagger(40, anims).start();
  }, [data]);

  const handlePress = (idx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (selectedIdx === idx) {
      setSelectedIdx(null);
      Animated.timing(tooltipAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    } else {
      setSelectedIdx(idx);
      Animated.spring(tooltipAnim, { toValue: 1, useNativeDriver: true, damping: 12 }).start();
    }
  };

  const selected = selectedIdx !== null ? data[selectedIdx] : null;

  return (
    <View>
      {/* Tooltip panel — muncul saat bar dipencet */}
      {selected && (
        <Animated.View
          style={[
            styles.tooltip,
            { backgroundColor: c.brand, opacity: tooltipAnim,
              transform: [{ scale: tooltipAnim.interpolate({ inputRange: [0,1], outputRange: [0.92,1] }) }] },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.tooltipDay}>{fullDayLabel(selected.date)}</Text>
            <Text style={styles.tooltipDate}>{formatDate(selected.date)}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.tooltipLabel}>Total Penjualan</Text>
            <Text style={styles.tooltipValue}>{formatRp(selected.total)}</Text>
          </View>
        </Animated.View>
      )}

      {/* Bar chart */}
      <View style={styles.chart}>
        {data.map((s, i) => {
          const isSelected = selectedIdx === i;
          const hasData = s.total > 0;
          const barHeight = animVals.current[i]?.interpolate({
            inputRange: [0, 1],
            outputRange: [hasData ? 6 : 4, 120],
          }) ?? 8;

          return (
            <Pressable
              key={s.date}
              onPress={() => handlePress(i)}
              style={styles.barWrap}
              hitSlop={6}
            >
              {/* Nilai di atas bar saat dipilih */}
              {isSelected && hasData && (
                <Animated.Text
                  style={[styles.barTopValue, { color: c.brand, opacity: tooltipAnim }]}
                  numberOfLines={1}
                >
                  {formatRp(s.total).replace("Rp", "")}
                </Animated.Text>
              )}

              {/* Bar */}
              <Animated.View
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: isSelected ? c.brand : hasData ? "#B0BEC5" : "#CFD8DC",
                    transform: [{ scaleX: isSelected ? 1.15 : 1 }],
                  },
                ]}
              />

              {/* Label hari */}
              <Text
                style={[
                  styles.barLabel,
                  {
                    color: isSelected ? c.brand : c.onSurfaceMuted,
                    fontWeight: isSelected ? "800" : "600",
                  },
                ]}
              >
                {dayLabel(s.date)}
              </Text>

              {/* Dot indikator di bawah label saat dipilih */}
              <View
                style={[
                  styles.barDot,
                  { backgroundColor: isSelected ? c.brand : "transparent" },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Hint text */}
      <Text style={[styles.chartHint, { color: c.onSurfaceMuted }]}>
        {selectedIdx !== null ? "Ketuk bar yang sama untuk menutup" : "Ketuk bar untuk melihat detail"}
      </Text>
    </View>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const c = COLORS.light;
  const { user, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const d = await dashboardSummary();
    setData(d);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <LinearGradient colors={[c.brand, c.brandDark]} style={styles.headerBg} />
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.hi}>Halo, {user?.name ?? "Kasir"} 👋</Text>
            <Text style={styles.subhi}>Cemara Kopi POS</Text>
          </View>
          <Pressable
            testID="dashboard-logout-button"
            onPress={logout}
            style={styles.iconBtn}
            android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
          >
            <MaterialCommunityIcons name="logout" size={20} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        >
          {/* KPI cards */}
          <View style={styles.kpiRow}>
            <KpiCard testID="kpi-today-revenue" icon="cash-multiple"
              label="Pendapatan Hari Ini" value={formatRp(data?.todayRevenue ?? 0)} tint={c.brand} />
            <KpiCard testID="kpi-today-count" icon="receipt"
              label="Transaksi Hari Ini" value={`${data?.todayCount ?? 0}`} tint={c.accent} />
          </View>
          <View style={styles.kpiRow}>
            <KpiCard testID="kpi-week" icon="chart-line"
              label="7 Hari Terakhir" value={formatRp(data?.weekRevenue ?? 0)} tint={c.secondary} />
            <KpiCard testID="kpi-month" icon="calendar-month"
              label="Bulan Ini" value={formatRp(data?.monthRevenue ?? 0)} tint={c.info} />
          </View>

          {/* Quick action */}
          <Pressable
            testID="dashboard-new-transaction"
            android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            onPress={() => router.push("/(app)/cashier")}
            style={[styles.cta, { backgroundColor: c.brand }]}
          >
            <View style={styles.ctaIcon}>
              <MaterialCommunityIcons name="cash-register" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Transaksi Baru</Text>
              <Text style={styles.ctaSub}>Buka halaman kasir untuk mulai melayani</Text>
            </View>
            <MaterialCommunityIcons name="arrow-right" size={22} color="#fff" />
          </Pressable>

          {/* Chart */}
          <Card title="Grafik Penjualan 7 Hari">
            {data && data.salesByDay.length > 0 ? (
              <SalesChart data={data.salesByDay} />
            ) : (
              <EmptyState text="Belum ada transaksi minggu ini" />
            )}
          </Card>

          {/* Top products */}
          <Card title="Produk Terlaris">
            {data && data.topProducts.length > 0 ? (
              data.topProducts.map((p, i) => (
                <View key={p.name} style={styles.row}>
                  <View style={[styles.rank, { backgroundColor: c.brandSoft }]}>
                    <Text style={[styles.rankText, { color: c.brand }]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.rowName, { color: c.onSurface }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.rowQty, { color: c.onSurfaceMuted }]}>{p.qty}x</Text>
                </View>
              ))
            ) : (
              <EmptyState text="Belum ada data" />
            )}
          </Card>

          {/* Low stock */}
          <Card title="Stok Hampir Habis">
            {data && data.lowStock.length > 0 ? (
              data.lowStock.map((p: Product) => (
                <View key={p.id} style={styles.row}>
                  <View style={[styles.rank, { backgroundColor: "#FFEDD5" }]}>
                    <MaterialCommunityIcons name="alert" size={14} color={c.warning} />
                  </View>
                  <Text style={[styles.rowName, { color: c.onSurface }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.rowQty, { color: c.warning }]}>sisa {p.stock}</Text>
                </View>
              ))
            ) : (
              <EmptyState text="Semua stok aman ✅" />
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const KpiCard = ({ icon, label, value, tint, testID }: {
  icon: any; label: string; value: string; tint: string; testID?: string;
}) => {
  const c = COLORS.light;
  return (
    <View testID={testID} style={[styles.kpi, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.kpiIcon, { backgroundColor: tint + "1F" }]}>
        <MaterialCommunityIcons name={icon} size={18} color={tint} />
      </View>
      <Text style={[styles.kpiLabel, { color: c.onSurfaceMuted }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.kpiValue, { color: c.onSurface }]} numberOfLines={1}>{value}</Text>
    </View>
  );
};

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => {
  const c = COLORS.light;
  return (
    <View style={[styles.card, { backgroundColor: c.surfaceSecondary }]}>
      <Text style={[styles.cardTitle, { color: c.onSurface }]}>{title}</Text>
      {children}
    </View>
  );
};

const EmptyState = ({ text }: { text: string }) => {
  const c = COLORS.light;
  return (
    <View style={styles.empty}>
      <Text style={{ color: c.onSurfaceMuted, fontSize: 13 }}>{text}</Text>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.lg,
  },
  hi: { color: "#fff", fontSize: 18, fontWeight: "800" },
  subhi: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  kpiRow: { flexDirection: "row", gap: SPACING.md, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  kpi: { flex: 1, padding: SPACING.md, borderRadius: RADII.md, ...SHADOW.card },
  kpiIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  kpiLabel: { fontSize: 11, fontWeight: "600" },
  kpiValue: { fontSize: FONT.sizes.lg, fontWeight: "800", marginTop: 2 },
  cta: {
    marginHorizontal: SPACING.lg, marginVertical: SPACING.sm, borderRadius: RADII.md,
    padding: SPACING.md, flexDirection: "row", alignItems: "center", gap: SPACING.md,
    overflow: "hidden", ...SHADOW.fab,
  },
  ctaIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center",
  },
  ctaTitle: { color: "#fff", fontWeight: "800", fontSize: 15 },
  ctaSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  card: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, borderRadius: RADII.md, padding: SPACING.lg, ...SHADOW.card },
  cardTitle: { fontSize: 14, fontWeight: "800", marginBottom: SPACING.md },

  // ── Chart ──
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 150,
    marginTop: SPACING.xs,
  },
  barWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    paddingBottom: 2,
  },
  bar: {
    width: 20,
    borderRadius: 6,
    minHeight: 4,
  },
  barLabel: { fontSize: 10 },
  barDot: { width: 5, height: 5, borderRadius: 3 },
  barTopValue: {
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 2,
  },

  // Tooltip panel
  tooltip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOW.fab,
  },
  tooltipDay: { color: "#fff", fontWeight: "800", fontSize: 14 },
  tooltipDate: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 2 },
  tooltipLabel: { color: "rgba(255,255,255,0.8)", fontSize: 11 },
  tooltipValue: { color: "#fff", fontWeight: "800", fontSize: 18, marginTop: 2 },

  chartHint: { fontSize: 10, textAlign: "center", marginTop: SPACING.sm },

  // List rows
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 12 },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rankText: { fontSize: 13, fontWeight: "800" },
  rowName: { flex: 1, fontSize: 14, fontWeight: "600" },
  rowQty: { fontSize: 12, fontWeight: "700" },
  empty: { paddingVertical: 18, alignItems: "center" },
});