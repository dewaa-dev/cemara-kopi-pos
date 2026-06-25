import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, FONT, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import {
  exportReportCsv,
  exportReportPdf,
  getTransactionItems,
} from "@/src/db/extras";
import {
  getSettings,
  listTransactions,
  Transaction,
  TxItem,
} from "@/src/db/repo";
import { useToast } from "@/src/components/Toast";

type Period = "today" | "week" | "month" | "all";

export default function Reports() {
  const c = COLORS.light;
  const toast = useToast();
  const [period, setPeriod] = useState<Period>("today");
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ tx: Transaction; items: TxItem[] } | null>(null);
  const [busy, setBusy] = useState(false);

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
    const list = await listTransactions({ ...periodRange(period), limit: 500 });
    setTxs(list);
    setLoading(false);
  }, [period, periodRange]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalRev = txs.reduce((s, t) => s + t.total, 0);
  const totalDisc = txs.reduce((s, t) => s + t.discount, 0);
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

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Laporan" subtitle="Penjualan & Rekap" showBack testID="reports-header" />
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

      {busy && (
        <View style={{ paddingVertical: 8 }}>
          <ActivityIndicator color={c.brand} />
        </View>
      )}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={c.brand} /></View>
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
                testID={`r-tx-${t.id}`}
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
                    <Text style={{ color: c.onSurfaceMuted, fontSize: 11 }}>{t.customer_name}</Text>
                  ) : null}
                </View>
                <Text style={{ color: c.brand, fontWeight: "800" }}>{formatRp(t.total)}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
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
          </View>
        </View>
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

const Chip = ({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) => {
  const c = COLORS.light;
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, { backgroundColor: active ? c.brand : c.surfaceSecondary, borderColor: active ? c.brand : c.border }]}>
      <Text style={{ color: active ? "#fff" : c.onSurface, fontWeight: active ? "800" : "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  chipsContent: { paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: SPACING.md },
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
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: "#D0CCC6", marginBottom: SPACING.md },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  dashed: { borderTopWidth: 1, borderStyle: "dashed", marginVertical: 10 },
});
