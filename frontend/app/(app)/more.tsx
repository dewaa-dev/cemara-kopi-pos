import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { COLORS, FONT, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import {
  getSettings,
  getTransactionItems,
  listTransactions,
  setSetting,
  Transaction,
  TxItem,
} from "@/src/db/repo";
import { useAuth } from "@/src/contexts/AuthContext";
import { useToast } from "@/src/components/Toast";

type Period = "today" | "week" | "month" | "all";

export default function More() {
  const c = COLORS.light;
  const { user, logout } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";

  const [tab, setTab] = useState<"laporan" | "pengaturan">("laporan");
  const [period, setPeriod] = useState<Period>("today");
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ tx: Transaction; items: TxItem[] } | null>(null);

  // Settings state
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ key: string; label: string; value: string } | null>(null);

  const periodRange = useCallback((p: Period) => {
    const now = new Date();
    if (p === "today") {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from: s.toISOString(), to: undefined };
    }
    if (p === "week") {
      const s = new Date(now.getTime() - 6 * 86400000);
      const start = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      return { from: start.toISOString(), to: undefined };
    }
    if (p === "month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: s.toISOString(), to: undefined };
    }
    return { from: undefined, to: undefined };
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { from, to } = periodRange(period);
    const list = await listTransactions({ from, to, limit: 500 });
    setTxs(list);
    setLoading(false);
  }, [period, periodRange]);

  const loadSettings = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadReports();
      loadSettings();
    }, [loadReports, loadSettings])
  );

  const totalRev = txs.reduce((s, t) => s + t.total, 0);
  const totalDisc = txs.reduce((s, t) => s + t.discount, 0);

  const onSaveSetting = async () => {
    if (!editing) return;
    await setSetting(editing.key, editing.value);
    toast.show("Tersimpan", "success");
    setEditing(null);
    loadSettings();
  };

  const SETTING_FIELDS: { key: string; label: string; icon: any; adminOnly?: boolean }[] = [
    { key: "store_name", label: "Nama Toko", icon: "store-outline" },
    { key: "store_address", label: "Alamat", icon: "map-marker-outline" },
    { key: "store_whatsapp", label: "WhatsApp", icon: "whatsapp" },
    { key: "tax_percent", label: "Pajak (%)", icon: "percent-outline", adminOnly: true },
    { key: "receipt_footer", label: "Footer Struk", icon: "format-text" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <LinearGradient colors={[c.brand, c.brandDark]} style={styles.headerBg} />
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Lainnya</Text>
          <Text style={styles.subtitle}>Laporan & Pengaturan</Text>
        </View>

        <View style={styles.tabs}>
          <TabBtn label="Laporan" active={tab === "laporan"} onPress={() => setTab("laporan")} testID="tab-laporan" />
          <TabBtn label="Pengaturan" active={tab === "pengaturan"} onPress={() => setTab("pengaturan")} testID="tab-pengaturan" />
        </View>
      </SafeAreaView>

      {tab === "laporan" ? (
        <View style={{ flex: 1 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
          >
            {(["today", "week", "month", "all"] as Period[]).map((p) => (
              <Chip
                key={p}
                label={
                  p === "today" ? "Hari Ini" : p === "week" ? "7 Hari" : p === "month" ? "Bulan Ini" : "Semua"
                }
                active={period === p}
                onPress={() => setPeriod(p)}
                testID={`period-${p}`}
              />
            ))}
          </ScrollView>

          <View style={[styles.kpiCard, { backgroundColor: c.surfaceSecondary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kpiLabel, { color: c.onSurfaceMuted }]}>Pendapatan</Text>
              <Text style={[styles.kpiValue, { color: c.brand }]}>{formatRp(totalRev)}</Text>
            </View>
            <View style={[styles.divVert, { backgroundColor: c.divider }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.kpiLabel, { color: c.onSurfaceMuted }]}>Transaksi</Text>
              <Text style={[styles.kpiValue, { color: c.onSurface }]}>{txs.length}</Text>
            </View>
            <View style={[styles.divVert, { backgroundColor: c.divider }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.kpiLabel, { color: c.onSurfaceMuted }]}>Diskon</Text>
              <Text style={[styles.kpiValue, { color: c.warning }]}>{formatRp(totalDisc)}</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={c.brand} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}>
              {txs.length === 0 ? (
                <View style={{ alignItems: "center", paddingTop: 50 }}>
                  <MaterialCommunityIcons name="receipt" size={48} color={c.onSurfaceMuted} />
                  <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Belum ada transaksi</Text>
                </View>
              ) : (
                txs.map((t) => (
                  <Pressable
                    testID={`tx-${t.id}`}
                    key={t.id}
                    onPress={async () => {
                      const items = await getTransactionItems(t.id);
                      setDetail({ tx: t, items });
                    }}
                    android_ripple={{ color: c.brandSoft }}
                    style={[styles.txRow, { backgroundColor: c.surfaceSecondary }]}
                  >
                    <View style={[styles.txIcon, { backgroundColor: c.brandSoft }]}>
                      <MaterialCommunityIcons name="receipt-text" size={20} color={c.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.onSurface, fontWeight: "700" }}>{t.code}</Text>
                      <Text style={{ color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 }}>
                        {new Date(t.created_at).toLocaleString("id-ID")} • {t.payment_method}
                      </Text>
                      {t.customer_name ? (
                        <Text style={{ color: c.onSurfaceMuted, fontSize: 11 }}>
                          {t.customer_name}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ color: c.brand, fontWeight: "800" }}>{formatRp(t.total)}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}>
          <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Identitas Toko</Text>
          {SETTING_FIELDS.filter((f) => isAdmin || !f.adminOnly).map((f) => (
            <Pressable
              key={f.key}
              testID={`setting-${f.key}`}
              onPress={() =>
                isAdmin
                  ? setEditing({ key: f.key, label: f.label, value: settings[f.key] ?? "" })
                  : toast.show("Hanya admin yang bisa mengubah", "error")
              }
              android_ripple={{ color: c.brandSoft }}
              style={[styles.settingRow, { backgroundColor: c.surfaceSecondary }]}
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
              {isAdmin && <MaterialCommunityIcons name="chevron-right" size={20} color={c.onSurfaceMuted} />}
            </Pressable>
          ))}

          <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Akun</Text>
          <View style={[styles.settingRow, { backgroundColor: c.surfaceSecondary }]}>
            <View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}>
              <MaterialCommunityIcons name="account-circle" size={22} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.onSurface, fontWeight: "700" }}>{user?.name}</Text>
              <Text style={{ color: c.onSurfaceMuted, fontSize: 12, marginTop: 2 }}>
                {user?.role === "admin" ? "Administrator" : "Kasir"}
              </Text>
            </View>
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

          <Text style={[styles.versionTxt, { color: c.onSurfaceMuted }]}>
            Cemara Kopi POS v1.0 • 100% Offline
          </Text>
        </ScrollView>
      )}

      {/* Edit setting modal */}
      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBg}
        >
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
              value={editing?.value ?? ""}
              onChangeText={(v) => editing && setEditing({ ...editing, value: v })}
              placeholder={editing?.label}
              placeholderTextColor={c.onSurfaceMuted}
              style={[styles.input, { borderColor: c.border, color: c.onSurface, marginTop: SPACING.md }]}
              keyboardType={editing?.key === "tax_percent" ? "numeric" : "default"}
            />
            <Pressable
              testID="setting-save"
              onPress={onSaveSetting}
              android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              style={[styles.modalCta, { backgroundColor: c.brand }]}
            >
              <Text style={styles.modalCtaText}>Simpan</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Transaction detail */}
      <Modal
        visible={!!detail}
        transparent
        animationType="slide"
        onRequestClose={() => setDetail(null)}
      >
        <View style={styles.modalBg}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface, maxHeight: "88%" }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.onSurface }]}>{detail?.tx.code}</Text>
              <Pressable onPress={() => setDetail(null)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
              </Pressable>
            </View>
            <ScrollView style={{ marginTop: SPACING.md }}>
              <Text style={{ color: c.onSurfaceMuted, fontSize: 12 }}>
                {detail && new Date(detail.tx.created_at).toLocaleString("id-ID")}
              </Text>
              <Text style={{ color: c.onSurfaceMuted, fontSize: 12 }}>
                Kasir: {detail?.tx.cashier_name} • {detail?.tx.payment_method}
              </Text>
              {detail?.tx.customer_name && (
                <Text style={{ color: c.onSurfaceMuted, fontSize: 12 }}>
                  Pelanggan: {detail.tx.customer_name}
                </Text>
              )}
              <View style={[styles.dashed, { borderColor: c.border }]} />
              {detail?.items.map((it) => (
                <View key={it.id} style={{ flexDirection: "row", paddingVertical: 4 }}>
                  <Text
                    style={{
                      color: it.is_topping ? c.onSurfaceMuted : c.onSurface,
                      flex: 1,
                      fontSize: it.is_topping ? 12 : 14,
                    }}
                  >
                    {it.is_topping ? "+ " : ""}
                    {it.product_name} x{it.qty}
                  </Text>
                  <Text style={{ color: c.onSurface, fontWeight: "600" }}>
                    {formatRp(it.subtotal)}
                  </Text>
                </View>
              ))}
              <View style={[styles.dashed, { borderColor: c.border }]} />
              {detail && (
                <>
                  <Row k="Subtotal" v={formatRp(detail.tx.subtotal)} />
                  {detail.tx.discount > 0 && (
                    <Row k="Diskon" v={"- " + formatRp(detail.tx.discount)} />
                  )}
                  {detail.tx.tax > 0 && <Row k="Pajak" v={formatRp(detail.tx.tax)} />}
                  <Row k="Total" v={formatRp(detail.tx.total)} highlight />
                  <Row k="Bayar" v={formatRp(detail.tx.paid)} />
                  {detail.tx.change_amount > 0 && (
                    <Row k="Kembali" v={formatRp(detail.tx.change_amount)} />
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const Row = ({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) => {
  const c = COLORS.light;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color: highlight ? c.onSurface : c.onSurfaceMuted, fontWeight: highlight ? "800" : "500" }}>
        {k}
      </Text>
      <Text
        style={{
          color: highlight ? c.brand : c.onSurface,
          fontWeight: highlight ? "800" : "700",
          fontSize: highlight ? 16 : 14,
        }}
      >
        {v}
      </Text>
    </View>
  );
};

const TabBtn = ({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    android_ripple={{ color: "rgba(255,255,255,0.2)" }}
    style={[
      styles.tabBtn,
      {
        backgroundColor: active ? "rgba(255,255,255,0.25)" : "transparent",
        borderColor: "rgba(255,255,255,0.3)",
      },
    ]}
  >
    <Text style={{ color: "#fff", fontWeight: active ? "800" : "600" }}>{label}</Text>
  </Pressable>
);

const Chip = ({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) => {
  const c = COLORS.light;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? c.brand : c.surfaceSecondary,
          borderColor: active ? c.brand : c.border,
        },
      ]}
    >
      <Text
        style={{
          color: active ? "#fff" : c.onSurface,
          fontWeight: active ? "800" : "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { position: "absolute", top: 0, left: 0, right: 0, height: 180 },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  tabs: {
    flexDirection: "row",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  tabBtn: {
    paddingHorizontal: SPACING.lg,
    height: 40,
    borderRadius: RADII.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipsContent: { paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: SPACING.md },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: 14,
    borderRadius: RADII.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: RADII.md,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    ...SHADOW.card,
  },
  kpiLabel: { fontSize: 11, fontWeight: "600" },
  kpiValue: { fontSize: FONT.sizes.lg, fontWeight: "800", marginTop: 2 },
  divVert: { width: 1, height: 32, marginHorizontal: 12 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
    marginTop: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  logoutBtn: {
    marginTop: SPACING.lg,
    height: 50,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  versionTxt: { textAlign: "center", marginTop: SPACING.lg, fontSize: 11 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D0CCC6",
    marginBottom: SPACING.md,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalCta: {
    height: 54,
    borderRadius: RADII.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.md,
    overflow: "hidden",
    ...SHADOW.fab,
  },
  modalCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  input: {
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    height: 48,
    fontSize: 14,
  },
  dashed: { borderTopWidth: 1, borderStyle: "dashed", marginVertical: 10 },
});
