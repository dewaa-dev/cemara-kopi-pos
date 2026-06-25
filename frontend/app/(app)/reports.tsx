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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, FONT, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { exportReportCsv, exportReportPdf, getTransactionItems } from "@/src/db/extras";
import {
  getSettings,
  listTransactions,
  Transaction,
  TxItem,
  voidTransaction,
} from "@/src/db/repo";
import { useAuth } from "@/src/contexts/AuthContext";
import { useToast } from "@/src/components/Toast";

type Period = "today" | "week" | "month" | "all";
type Status = "all" | "NORMAL" | "VOID";

export default function Reports() {
  const c = COLORS.light;
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [period, setPeriod] = useState<Period>("today");
  const [status, setStatus] = useState<Status>("all");
  const [search, setSearch] = useState("");
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ tx: Transaction; items: TxItem[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [voidFor, setVoidFor] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const periodRange = useCallback((p: Period) => {
    const now = new Date();
    if (p === "today") return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() };
    if (p === "week") {
      const s = new Date(now.getTime() - 6 * 86400000);
      return { from: new Date(s.getFullYear(), s.getMonth(), s.getDate()).toISOString() };
    }
    if (p === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    return {};
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await listTransactions({
      ...periodRange(period),
      limit: 500,
      status,
      search,
    });
    setTxs(list);
    setLoading(false);
  }, [period, periodRange, status, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Only count NORMAL for revenue
  const normalTxs = txs.filter((t) => t.status === "NORMAL");
  const totalRev = normalTxs.reduce((s, t) => s + t.total, 0);
  const voidCount = txs.filter((t) => t.status === "VOID").length;
  const label = period === "today" ? "Hari Ini" : period === "week" ? "7 Hari" : period === "month" ? "Bulan Ini" : "Semua Waktu";

  const exportPdf = async () => {
    try {
      setBusy(true);
      const settings = await getSettings();
      await exportReportPdf({ ...periodRange(period), periodLabel: label, storeName: settings.store_name || "Cemara Kopi" });
      toast.show("PDF dibuat & dibagikan", "success");
    } catch (e: any) {
      toast.show("Gagal export PDF: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  const exportCsv = async () => {
    try {
      setBusy(true);
      await exportReportCsv({ ...periodRange(period), periodLabel: label });
      toast.show("Excel/CSV dibuat & dibagikan", "success");
    } catch (e: any) {
      toast.show("Gagal export: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  const onConfirmVoid = async () => {
    if (!voidFor || !voidReason.trim() || !user) return;
    setBusy(true);
    try {
      await voidTransaction({
        transactionId: voidFor.id,
        reason: voidReason.trim(),
        voidedBy: user.id,
        voidedByName: user.name,
      });
      toast.show("Transaksi di-VOID", "success");
      setVoidFor(null);
      setVoidReason("");
      setDetail(null);
      load();
    } catch (e: any) {
      toast.show("Gagal void: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Laporan" subtitle="Penjualan & Rekap" showBack testID="reports-header" />

      <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={c.onSurfaceMuted} />
        <TextInput
          testID="reports-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nomor invoice (CK-YYYYMMDD-XXXX) atau pelanggan"
          placeholderTextColor={c.onSurfaceMuted}
          style={[styles.searchInput, { color: c.onSurface }]}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <MaterialCommunityIcons name="close-circle" size={16} color={c.onSurfaceMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
      >
        {(["today", "week", "month", "all"] as Period[]).map((p) => (
          <Chip
            key={p}
            label={p === "today" ? "Hari Ini" : p === "week" ? "7 Hari" : p === "month" ? "Bulan Ini" : "Semua"}
            active={period === p}
            onPress={() => setPeriod(p)}
            testID={`r-period-${p}`}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
      >
        {(["all", "NORMAL", "VOID"] as Status[]).map((s) => (
          <Chip
            key={s}
            label={s === "all" ? "Semua Status" : s === "NORMAL" ? "Normal" : "Void"}
            active={status === s}
            onPress={() => setStatus(s)}
            testID={`r-status-${s}`}
            danger={s === "VOID"}
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
          <Text style={[styles.kpiValue, { color: c.onSurface }]}>{normalTxs.length}</Text>
        </View>
        <View style={[styles.divVert, { backgroundColor: c.divider }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.kpiLabel, { color: c.onSurfaceMuted }]}>Void</Text>
          <Text style={[styles.kpiValue, { color: c.error }]}>{voidCount}</Text>
        </View>
      </View>

      <View style={styles.exportRow}>
        <Pressable
          testID="export-pdf"
          onPress={exportPdf}
          disabled={busy}
          android_ripple={{ color: c.brandSoft }}
          style={[styles.exportBtn, { borderColor: c.error, backgroundColor: c.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="file-pdf-box" size={20} color={c.error} />
          <Text style={{ color: c.error, fontWeight: "800", fontSize: 13 }}>Export PDF</Text>
        </Pressable>
        <Pressable
          testID="export-csv"
          onPress={exportCsv}
          disabled={busy}
          android_ripple={{ color: c.brandSoft }}
          style={[styles.exportBtn, { borderColor: c.success, backgroundColor: c.surfaceSecondary }]}
        >
          <MaterialCommunityIcons name="microsoft-excel" size={20} color={c.success} />
          <Text style={{ color: c.success, fontWeight: "800", fontSize: 13 }}>Export Excel</Text>
        </Pressable>
      </View>

      {busy && <ActivityIndicator color={c.brand} style={{ paddingVertical: 6 }} />}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={c.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}>
          {txs.length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 50 }}>
              <MaterialCommunityIcons name="receipt" size={48} color={c.onSurfaceMuted} />
              <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Tidak ada transaksi</Text>
            </View>
          ) : (
            txs.map((t) => {
              const isVoid = t.status === "VOID";
              return (
                <Pressable
                  testID={`r-tx-${t.id}`}
                  key={t.id}
                  onPress={async () => {
                    const items = await getTransactionItems(t.id);
                    setDetail({ tx: t, items });
                  }}
                  android_ripple={{ color: c.brandSoft }}
                  style={[
                    styles.txRow,
                    {
                      backgroundColor: c.surfaceSecondary,
                      opacity: isVoid ? 0.7 : 1,
                      borderLeftWidth: 4,
                      borderLeftColor: isVoid ? c.error : c.brand,
                    },
                  ]}
                >
                  <View style={[styles.txIcon, { backgroundColor: isVoid ? "#FFE5E5" : c.brandSoft }]}>
                    <MaterialCommunityIcons name={isVoid ? "close-circle" : "receipt-text"} size={20} color={isVoid ? c.error : c.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ color: c.onSurface, fontWeight: "800", fontSize: 13 }}>{t.code}</Text>
                      {isVoid && (
                        <View style={[styles.voidBadge, { backgroundColor: c.error }]}>
                          <Text style={styles.voidBadgeText}>VOID</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 }}>
                      {new Date(t.created_at).toLocaleString("id-ID")} • {t.payment_method}
                    </Text>
                    {t.customer_name ? (
                      <Text style={{ color: c.onSurfaceMuted, fontSize: 11 }}>{t.customer_name}</Text>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      color: isVoid ? c.error : c.brand,
                      fontWeight: "800",
                      textDecorationLine: isVoid ? "line-through" : "none",
                    }}
                  >
                    {formatRp(t.total)}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalBg}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface, maxHeight: "92%" }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: c.onSurface }]}>{detail?.tx.code}</Text>
                {detail?.tx.status === "VOID" && (
                  <View style={[styles.voidBadge, { backgroundColor: c.error, marginTop: 4, alignSelf: "flex-start" }]}>
                    <Text style={styles.voidBadgeText}>VOID</Text>
                  </View>
                )}
              </View>
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
              {detail?.tx.status === "VOID" && (
                <View style={[styles.voidNotice, { borderColor: c.error, backgroundColor: c.error + "11" }]}>
                  <MaterialCommunityIcons name="alert-circle" size={16} color={c.error} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.error, fontWeight: "800", fontSize: 12 }}>
                      Di-VOID oleh {detail.tx.voided_by}
                    </Text>
                    <Text style={{ color: c.error, fontSize: 11, marginTop: 2 }}>
                      {detail.tx.voided_at && new Date(detail.tx.voided_at).toLocaleString("id-ID")}
                    </Text>
                    <Text style={{ color: c.error, fontSize: 11, marginTop: 4, fontStyle: "italic" }}>
                      &quot;{detail.tx.void_reason}&quot;
                    </Text>
                  </View>
                </View>
              )}
              <View style={[styles.dashed, { borderColor: c.border }]} />
              {detail?.items.map((it) => (
                <View key={it.id} style={{ flexDirection: "row", paddingVertical: 4 }}>
                  <Text style={{ color: it.is_topping ? c.onSurfaceMuted : c.onSurface, flex: 1, fontSize: it.is_topping ? 12 : 14 }}>
                    {it.is_topping ? "+ " : ""}{it.product_name} x{it.qty}
                  </Text>
                  <Text style={{ color: c.onSurface, fontWeight: "600" }}>{formatRp(it.subtotal)}</Text>
                </View>
              ))}
              <View style={[styles.dashed, { borderColor: c.border }]} />
              {detail && (
                <>
                  <KV k="Subtotal" v={formatRp(detail.tx.subtotal)} />
                  {detail.tx.discount > 0 && <KV k="Diskon" v={"- " + formatRp(detail.tx.discount)} />}
                  {detail.tx.tax > 0 && <KV k="Pajak" v={formatRp(detail.tx.tax)} />}
                  <KV k="Total" v={formatRp(detail.tx.total)} highlight />
                  <KV k="Bayar" v={formatRp(detail.tx.paid)} />
                  {detail.tx.change_amount > 0 && <KV k="Kembali" v={formatRp(detail.tx.change_amount)} />}
                </>
              )}
            </ScrollView>
            {isAdmin && detail?.tx.status === "NORMAL" && (
              <Pressable
                testID="void-transaction-btn"
                onPress={() => setVoidFor(detail.tx)}
                android_ripple={{ color: "rgba(255,255,255,0.18)" }}
                style={[styles.modalCta, { backgroundColor: c.error }]}
              >
                <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                <Text style={[styles.modalCtaText, { marginLeft: 8 }]}>Batalkan (VOID)</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* Void Reason Modal */}
      <Modal visible={!!voidFor} transparent animationType="slide" onRequestClose={() => setVoidFor(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBg}>
          <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: c.onSurface }]}>VOID Transaksi</Text>
              <Pressable onPress={() => setVoidFor(null)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
              </Pressable>
            </View>
            <View style={[styles.voidNotice, { borderColor: c.error, backgroundColor: c.error + "11", marginTop: SPACING.md }]}>
              <MaterialCommunityIcons name="alert-circle" size={16} color={c.error} />
              <Text style={{ color: c.error, fontSize: 12, flex: 1 }}>
                Transaksi <Text style={{ fontWeight: "800" }}>{voidFor?.code}</Text> akan ditandai VOID. Stok akan dikembalikan otomatis. Tidak bisa dibatalkan.
              </Text>
            </View>
            <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Alasan Pembatalan (wajib)</Text>
            <TextInput
              testID="void-reason"
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="Contoh: salah input, pelanggan batal, dll"
              placeholderTextColor={c.onSurfaceMuted}
              multiline
              autoFocus
              style={[styles.input, { borderColor: c.border, color: c.onSurface, minHeight: 80, paddingVertical: 10 }]}
            />
            <Pressable
              testID="void-confirm"
              onPress={onConfirmVoid}
              disabled={busy || !voidReason.trim()}
              android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              style={[styles.modalCta, { backgroundColor: c.error, opacity: !voidReason.trim() || busy ? 0.5 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalCtaText}>Konfirmasi VOID</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const KV = ({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) => {
  const c = COLORS.light;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color: highlight ? c.onSurface : c.onSurfaceMuted, fontWeight: highlight ? "800" : "500" }}>{k}</Text>
      <Text style={{ color: highlight ? c.brand : c.onSurface, fontWeight: highlight ? "800" : "700", fontSize: highlight ? 16 : 14 }}>{v}</Text>
    </View>
  );
};

const Chip = ({ label, active, onPress, testID, danger }: any) => {
  const c = COLORS.light;
  const activeBg = danger ? c.error : c.brand;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? activeBg : c.surfaceSecondary,
          borderColor: active ? activeBg : c.border,
        },
      ]}
    >
      <Text style={{ color: active ? "#fff" : c.onSurface, fontWeight: active ? "800" : "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, height: 44, borderRadius: RADII.pill, gap: SPACING.sm, ...SHADOW.card },
  searchInput: { flex: 1, fontSize: 13 },
  chipsContent: { paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: SPACING.sm },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: RADII.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  kpiCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, borderRadius: RADII.md, padding: SPACING.md, flexDirection: "row", alignItems: "center", ...SHADOW.card },
  kpiLabel: { fontSize: 11, fontWeight: "600" },
  kpiValue: { fontSize: FONT.sizes.lg, fontWeight: "800", marginTop: 2 },
  divVert: { width: 1, height: 32, marginHorizontal: 12 },
  exportRow: { flexDirection: "row", gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  exportBtn: { flex: 1, height: 44, borderRadius: RADII.md, borderWidth: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  txRow: { flexDirection: "row", alignItems: "center", padding: SPACING.md, gap: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm, ...SHADOW.card },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  voidBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  voidBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  voidNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: RADII.md, padding: 10, marginTop: 8 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: "#D0CCC6", marginBottom: SPACING.md },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalCta: { height: 54, borderRadius: RADII.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.md, overflow: "hidden", flexDirection: "row", ...SHADOW.fab },
  modalCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  section: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: SPACING.md, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: SPACING.md, fontSize: 14, paddingVertical: 10 },
  dashed: { borderTopWidth: 1, borderStyle: "dashed", marginVertical: 10 },
});
