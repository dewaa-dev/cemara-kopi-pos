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

// ✅ FIX TIMEZONE: created_at di DB disimpan sebagai UTC ISO string ("...Z").
// SQLite/JS membandingkan string secara lexicographic, sehingga boundary
// filter HARUS diformat dengan suffix "Z" juga — BUKAN "+07:00".
// String "+07:00" vs "Z" TIDAK sortable terhadap satu sama lain meskipun
// merepresentasikan instant yang sama, sehingga transaksi dini hari
// (00:00–07:00 WIB) bisa ke-exclude secara salah dari filter "from".
//
// Solusi: hitung instant UTC yang setara "tengah malam WIB" pada N hari
// offset dari sekarang, lalu format balik sebagai ISO "Z" standar.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

const wibMidnightToUtcIso = (localNow: Date, daysOffset = 0): string => {
  const wibWallClock = new Date(localNow.getTime() + WIB_OFFSET_MS);
  const y = wibWallClock.getUTCFullYear();
  const m = wibWallClock.getUTCMonth();
  const dd = wibWallClock.getUTCDate() + daysOffset;
  return new Date(Date.UTC(y, m, dd, 0, 0, 0) - WIB_OFFSET_MS).toISOString();
};

const wibMonthStartToUtcIso = (localNow: Date): string => {
  const wibWallClock = new Date(localNow.getTime() + WIB_OFFSET_MS);
  const y = wibWallClock.getUTCFullYear();
  const m = wibWallClock.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0) - WIB_OFFSET_MS).toISOString();
};

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
    if (p === "today") return { from: wibMidnightToUtcIso(now, 0) };
    if (p === "week")  return { from: wibMidnightToUtcIso(now, -6) };
    if (p === "month") return { from: wibMonthStartToUtcIso(now) };
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

  // ── Derived stats ────────────────────────────────────────────────────────────
  const normalTxs = txs.filter((t) => t.status === "NORMAL");
  const voidTxs   = txs.filter((t) => t.status === "VOID");

  const totalRev      = normalTxs.reduce((s, t) => s + t.total, 0);
  const totalDiscount = normalTxs.reduce((s, t) => s + t.discount, 0);
  const totalTax      = normalTxs.reduce((s, t) => s + t.tax, 0);
  const avgTx         = normalTxs.length ? Math.round(totalRev / normalTxs.length) : 0;

  // Rekap per metode bayar
  const payBreakdown: Record<string, number> = {};
  normalTxs.forEach((t) => {
    payBreakdown[t.payment_method] = (payBreakdown[t.payment_method] || 0) + t.total;
  });
  const payMethods = Object.entries(payBreakdown).sort((a, b) => b[1] - a[1]);

  const periodLabel =
    period === "today" ? "Hari Ini" :
    period === "week"  ? "7 Hari Terakhir" :
    period === "month" ? "Bulan Ini" : "Semua Waktu";

  const exportPdf = async () => {
    try {
      setBusy(true);
      const settings = await getSettings();
      await exportReportPdf({ ...periodRange(period), periodLabel, storeName: settings.store_name || "Cemara Kopi" });
      toast.show("PDF dibuat & dibagikan", "success");
    } catch (e: any) {
      toast.show("Gagal export PDF: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  const exportCsv = async () => {
    try {
      setBusy(true);
      await exportReportCsv({ ...periodRange(period), periodLabel });
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
      setVoidFor(null); setVoidReason(""); setDetail(null);
      load();
    } catch (e: any) {
      toast.show("Gagal void: " + (e?.message || ""), "error");
    } finally { setBusy(false); }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Laporan" subtitle="Penjualan & Rekap" showBack testID="reports-header" />

      {/* ── Search ── */}
      <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={c.onSurfaceMuted} />
        <TextInput
          testID="reports-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Cari invoice atau nama pelanggan"
          placeholderTextColor={c.onSurfaceMuted}
          style={[styles.searchInput, { color: c.onSurface }]}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <MaterialCommunityIcons name="close-circle" size={16} color={c.onSurfaceMuted} />
          </Pressable>
        )}
      </View>

      {/* ── Filter chips ── */}
      <View style={styles.filtersWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
          {(["today", "week", "month", "all"] as Period[]).map((p) => (
            <Chip key={p}
              label={p === "today" ? "Hari Ini" : p === "week" ? "7 Hari" : p === "month" ? "Bulan Ini" : "Semua"}
              active={period === p} onPress={() => setPeriod(p)} testID={`r-period-${p}`} />
          ))}
          <View style={styles.chipDivider} />
          {(["all", "NORMAL", "VOID"] as Status[]).map((s) => (
            <Chip key={s}
              label={s === "all" ? "Semua" : s === "NORMAL" ? "Normal" : "Void"}
              active={status === s} onPress={() => setStatus(s)} testID={`r-status-${s}`} danger={s === "VOID"} />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>

        {/* ── Ringkasan Finansial ── */}
        <View style={[styles.summaryCard, { backgroundColor: c.brand }]}>
          <View style={styles.summaryTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryPeriod}>{periodLabel}</Text>
              <Text style={styles.summaryRevenue}>{formatRp(totalRev)}</Text>
              <Text style={styles.summarySub}>{normalTxs.length} transaksi berhasil</Text>
            </View>
            <MaterialCommunityIcons name="chart-areaspline" size={40} color="rgba(255,255,255,0.25)" />
          </View>

          {/* 3 angka sekunder */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Rata-rata</Text>
              <Text style={styles.summaryItemValue}>{formatRp(avgTx)}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Diskon</Text>
              <Text style={styles.summaryItemValue}>{formatRp(totalDiscount)}</Text>
            </View>
            <View style={[styles.summaryDivider]} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Pajak</Text>
              <Text style={styles.summaryItemValue}>{formatRp(totalTax)}</Text>
            </View>
          </View>
        </View>

        {/* ── Rekap Metode Pembayaran ── */}
        {payMethods.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: c.surfaceSecondary }]}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="credit-card-multiple-outline" size={16} color={c.brand} />
              <Text style={[styles.sectionTitle, { color: c.onSurface }]}>Metode Pembayaran</Text>
            </View>
            {payMethods.map(([method, amount]) => {
              const pct = totalRev > 0 ? (amount / totalRev) * 100 : 0;
              const icon =
                method === "Tunai" ? "cash" :
                method === "QRIS" ? "qrcode-scan" :
                method === "Transfer" ? "bank-transfer" : "wallet";
              return (
                <View key={method} style={styles.payRow}>
                  <View style={[styles.payIcon, { backgroundColor: c.brandSoft }]}>
                    <MaterialCommunityIcons name={icon as any} size={16} color={c.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ color: c.onSurface, fontWeight: "700", fontSize: 13 }}>{method}</Text>
                      <Text style={{ color: c.brand, fontWeight: "800", fontSize: 13 }}>{formatRp(amount)}</Text>
                    </View>
                    {/* Progress bar */}
                    <View style={[styles.progressBg, { backgroundColor: c.brandSoft }]}>
                      <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: c.brand }]} />
                    </View>
                    <Text style={{ color: c.onSurfaceMuted, fontSize: 10, marginTop: 3 }}>
                      {pct.toFixed(1)}% dari total
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Void summary (jika ada) ── */}
        {voidTxs.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: c.surfaceSecondary }]}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={c.error} />
              <Text style={[styles.sectionTitle, { color: c.onSurface }]}>Transaksi Dibatalkan</Text>
              <View style={[styles.voidCountBadge, { backgroundColor: c.error }]}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{voidTxs.length}</Text>
              </View>
            </View>
            <Text style={{ color: c.onSurfaceMuted, fontSize: 12 }}>
              Total nilai yang di-void:{" "}
              <Text style={{ color: c.error, fontWeight: "800" }}>
                {formatRp(voidTxs.reduce((s, t) => s + t.total, 0))}
              </Text>
            </Text>
          </View>
        )}

        {/* ── Export buttons ── */}
        <View style={styles.exportRow}>
          <Pressable testID="export-pdf" onPress={exportPdf} disabled={busy}
            android_ripple={{ color: c.brandSoft }}
            style={[styles.exportBtn, { borderColor: c.error, backgroundColor: c.surfaceSecondary }]}>
            <MaterialCommunityIcons name="file-pdf-box" size={18} color={c.error} />
            <Text style={{ color: c.error, fontWeight: "800", fontSize: 12 }}>PDF</Text>
          </Pressable>
          <Pressable testID="export-csv" onPress={exportCsv} disabled={busy}
            android_ripple={{ color: c.brandSoft }}
            style={[styles.exportBtn, { borderColor: c.success, backgroundColor: c.surfaceSecondary }]}>
            <MaterialCommunityIcons name="microsoft-excel" size={18} color={c.success} />
            <Text style={{ color: c.success, fontWeight: "800", fontSize: 12 }}>Excel</Text>
          </Pressable>
        </View>
        {busy && <ActivityIndicator color={c.brand} style={{ paddingVertical: 4 }} />}

        {/* ── Transaction list ── */}
        <View style={styles.listHeader}>
          <Text style={[styles.listTitle, { color: c.onSurface }]}>Daftar Transaksi</Text>
          <Text style={[styles.listCount, { color: c.onSurfaceMuted }]}>{txs.length} data</Text>
        </View>

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={c.brand} /></View>
        ) : txs.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <MaterialCommunityIcons name="receipt" size={48} color={c.onSurfaceMuted} />
            <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Tidak ada transaksi</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: SPACING.lg }}>
            {txs.map((t) => {
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
                  style={[styles.txRow, {
                    backgroundColor: c.surfaceSecondary,
                    opacity: isVoid ? 0.75 : 1,
                    borderLeftWidth: 4,
                    borderLeftColor: isVoid ? c.error : c.brand,
                  }]}
                >
                  <View style={[styles.txIcon, { backgroundColor: isVoid ? "#FFE5E5" : c.brandSoft }]}>
                    <MaterialCommunityIcons
                      name={isVoid ? "close-circle" : "receipt-text"}
                      size={20} color={isVoid ? c.error : c.brand} />
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
                    {t.customer_name
                      ? <Text style={{ color: c.onSurfaceMuted, fontSize: 11 }}>{t.customer_name}</Text>
                      : null}
                  </View>
                  <Text style={{
                    color: isVoid ? c.error : c.brand, fontWeight: "800",
                    textDecorationLine: isVoid ? "line-through" : "none",
                  }}>
                    {formatRp(t.total)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Detail Modal ── */}
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
              {/* Meta info */}
              <View style={[styles.metaBox, { backgroundColor: c.surfaceSecondary }]}>
                <MetaRow icon="calendar" label="Tanggal" value={detail ? new Date(detail.tx.created_at).toLocaleString("id-ID") : ""} />
                <MetaRow icon="account" label="Kasir" value={detail?.tx.cashier_name ?? ""} />
                <MetaRow icon="credit-card" label="Pembayaran" value={detail?.tx.payment_method ?? ""} />
                {detail?.tx.customer_name
                  ? <MetaRow icon="account-circle" label="Pelanggan" value={detail.tx.customer_name} />
                  : null}
              </View>

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

              <Text style={[styles.detailSectionLabel, { color: c.onSurfaceMuted }]}>Item</Text>
              <View style={[styles.itemsBox, { backgroundColor: c.surfaceSecondary }]}>
                {detail?.items.map((it) => (
                  <View key={it.id} style={[styles.itemRow, { borderBottomColor: c.divider }]}>
                    <Text style={{
                      color: it.is_topping ? c.onSurfaceMuted : c.onSurface,
                      flex: 1, fontSize: it.is_topping ? 12 : 14,
                      paddingLeft: it.is_topping ? 12 : 0,
                    }}>
                      {it.is_topping ? "+ " : ""}{it.product_name}
                      <Text style={{ color: c.onSurfaceMuted, fontWeight: "400" }}> ×{it.qty}</Text>
                    </Text>
                    <Text style={{ color: c.onSurface, fontWeight: "700", fontSize: 13 }}>
                      {formatRp(it.subtotal)}
                    </Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.detailSectionLabel, { color: c.onSurfaceMuted }]}>Ringkasan</Text>
              <View style={[styles.itemsBox, { backgroundColor: c.surfaceSecondary }]}>
                {detail && (
                  <>
                    <KV k="Subtotal" v={formatRp(detail.tx.subtotal)} />
                    {detail.tx.discount > 0 && <KV k="Diskon" v={"- " + formatRp(detail.tx.discount)} />}
                    {detail.tx.tax > 0 && <KV k="Pajak" v={formatRp(detail.tx.tax)} />}
                    <View style={[styles.kvDivider, { backgroundColor: c.divider }]} />
                    <KV k="Total" v={formatRp(detail.tx.total)} highlight />
                    <KV k={`Bayar (${detail.tx.payment_method})`} v={formatRp(detail.tx.paid)} />
                    {detail.tx.change_amount > 0 && <KV k="Kembali" v={formatRp(detail.tx.change_amount)} />}
                  </>
                )}
              </View>
            </ScrollView>

            {isAdmin && detail?.tx.status === "NORMAL" && (
              <Pressable testID="void-transaction-btn" onPress={() => setVoidFor(detail.tx)}
                android_ripple={{ color: "rgba(255,255,255,0.18)" }}
                style={[styles.modalCta, { backgroundColor: c.error }]}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#fff" />
                <Text style={[styles.modalCtaText, { marginLeft: 8 }]}>Batalkan (VOID)</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Void Reason Modal ── */}
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
                Transaksi <Text style={{ fontWeight: "800" }}>{voidFor?.code}</Text> akan ditandai VOID. Stok dikembalikan otomatis. Tidak bisa dibatalkan.
              </Text>
            </View>
            <Text style={[styles.sectionLabel, { color: c.onSurfaceMuted }]}>Alasan Pembatalan (wajib)</Text>
            <TextInput
              testID="void-reason" value={voidReason} onChangeText={setVoidReason}
              placeholder="Contoh: salah input, pelanggan batal, dll"
              placeholderTextColor={c.onSurfaceMuted} multiline autoFocus
              style={[styles.input, { borderColor: c.border, color: c.onSurface, minHeight: 80, paddingVertical: 10 }]}
            />
            <Pressable testID="void-confirm" onPress={onConfirmVoid}
              disabled={busy || !voidReason.trim()}
              android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              style={[styles.modalCta, { backgroundColor: c.error, opacity: !voidReason.trim() || busy ? 0.5 : 1 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalCtaText}>Konfirmasi VOID</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const MetaRow = ({ icon, label, value }: { icon: any; label: string; value: string }) => {
  const c = COLORS.light;
  return (
    <View style={styles.metaRow}>
      <MaterialCommunityIcons name={icon} size={14} color={c.onSurfaceMuted} />
      <Text style={{ color: c.onSurfaceMuted, fontSize: 12, width: 72 }}>{label}</Text>
      <Text style={{ color: c.onSurface, fontSize: 12, fontWeight: "700", flex: 1 }}>{value}</Text>
    </View>
  );
};

const KV = ({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) => {
  const c = COLORS.light;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
      <Text style={{ color: highlight ? c.onSurface : c.onSurfaceMuted, fontWeight: highlight ? "800" : "500", fontSize: 13 }}>{k}</Text>
      <Text style={{ color: highlight ? c.brand : c.onSurface, fontWeight: highlight ? "800" : "700", fontSize: highlight ? 16 : 13 }}>{v}</Text>
    </View>
  );
};

const Chip = ({ label, active, onPress, testID, danger }: any) => {
  const c = COLORS.light;
  const activeBg = danger ? c.error : c.brand;
  return (
    <Pressable testID={testID} onPress={onPress}
      style={[styles.chip, {
        backgroundColor: active ? activeBg : c.surfaceSecondary,
        borderColor: active ? activeBg : c.border,
      }]}>
      <Text style={{ color: active ? "#fff" : c.onSurface, fontWeight: active ? "800" : "600", fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  searchWrap: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md, marginBottom: 6,
    flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md,
    height: 42, borderRadius: RADII.pill, gap: SPACING.sm, ...SHADOW.card,
  },
  searchInput: { flex: 1, fontSize: 13 },

  filtersWrap: { marginBottom: 6 },
  chipsContent: { paddingHorizontal: SPACING.lg, paddingVertical: 6, gap: 6, alignItems: "center" },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: RADII.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chipDivider: { width: 1, height: 20, backgroundColor: "#D0CCC6", marginHorizontal: 4, alignSelf: "center" },

  // ── Summary card (header hijau) ──
  summaryCard: {
    marginHorizontal: SPACING.lg, marginBottom: SPACING.md,
    borderRadius: RADII.md, padding: SPACING.lg, ...SHADOW.fab,
  },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: SPACING.md },
  summaryPeriod: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryRevenue: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  summarySub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 4 },
  summaryRow: {
    flexDirection: "row", backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: RADII.sm, padding: SPACING.md,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryItemLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "600" },
  summaryItemValue: { color: "#fff", fontSize: 13, fontWeight: "800", marginTop: 3 },
  summaryDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 4 },

  // ── Section card ──
  sectionCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, borderRadius: RADII.md, padding: SPACING.md, ...SHADOW.card },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: SPACING.md },
  sectionTitle: { fontSize: 13, fontWeight: "800", flex: 1 },
  voidCountBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },

  // ── Payment breakdown ──
  payRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginBottom: SPACING.sm },
  payIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 2 },
  progressBg: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },

  // ── Export ──
  exportRow: { flexDirection: "row", gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  exportBtn: {
    flex: 1, height: 40, borderRadius: RADII.md, borderWidth: 1.5,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },

  // ── List ──
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  listTitle: { fontSize: 13, fontWeight: "800" },
  listCount: { fontSize: 12 },
  loading: { paddingTop: 40, alignItems: "center" },
  txRow: {
    flexDirection: "row", alignItems: "center", padding: SPACING.md,
    gap: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm, ...SHADOW.card,
  },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  voidBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  voidBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },

  // ── Modal detail ──
  metaBox: { borderRadius: RADII.md, padding: SPACING.md, marginBottom: SPACING.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  detailSectionLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: SPACING.sm },
  itemsBox: { borderRadius: RADII.md, padding: SPACING.md, marginBottom: SPACING.sm },
  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1 },
  kvDivider: { height: 1, marginVertical: 6 },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: SPACING.md, marginBottom: 6 },

  // ── Void modal ──
  voidNotice: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderWidth: 1, borderRadius: RADII.md, padding: 10, marginTop: 8 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: "#D0CCC6", marginBottom: SPACING.md },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalCta: { height: 54, borderRadius: RADII.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.md, overflow: "hidden", flexDirection: "row", ...SHADOW.fab },
  modalCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  input: { borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: SPACING.md, fontSize: 14 },
  dashed: { borderTopWidth: 1, borderStyle: "dashed", marginVertical: 10 },
});