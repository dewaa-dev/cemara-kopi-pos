import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, FONT, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import {
  CashFlow,
  CASH_IN_CATEGORIES,
  CASH_OUT_CATEGORIES,
  cashFlowSummary,
  deleteCashFlow,
  listCashFlow,
  upsertCashFlow,
} from "@/src/db/extras";
import { useAuth } from "@/src/contexts/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function CashFlowScreen() {
  const c = COLORS.light;
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<CashFlow[]>([]);
  const [summary, setSummary] = useState({ todayIn: 0, todayOut: 0, totalIn: 0, totalOut: 0, balance: 0 });
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [editing, setEditing] = useState<Partial<CashFlow> | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, s] = await Promise.all([listCashFlow(), cashFlowSummary()]);
    setItems(list);
    setSummary(s);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = items.filter((it) => {
    if (filter !== "all" && it.type !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        it.category.toLowerCase().includes(q) ||
        (it.note ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const onDelete = async (id: string) => {
    await deleteCashFlow(id);
    toast.show("Dihapus", "success");
    load();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Cash Flow" subtitle="Kas Masuk & Keluar" showBack testID="cashflow-header" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Summary cards */}
        <View style={styles.kpiRow}>
          <Kpi label="Kas Masuk" v={formatRp(summary.totalIn)} icon="arrow-down-bold-circle" color={c.success} testID="kpi-in" />
          <Kpi label="Kas Keluar" v={formatRp(summary.totalOut)} icon="arrow-up-bold-circle" color={c.error} testID="kpi-out" />
        </View>
        <View style={[styles.balCard, { backgroundColor: c.brand }]} testID="kpi-balance">
          <View style={{ flex: 1 }}>
            <Text style={styles.balLabel}>Saldo Kas</Text>
            <Text style={styles.balValue}>{formatRp(summary.balance)}</Text>
            <Text style={styles.balSub}>
              Hari ini: +{formatRp(summary.todayIn)}  •  -{formatRp(summary.todayOut)}
            </Text>
          </View>
          <MaterialCommunityIcons name="wallet" size={36} color="rgba(255,255,255,0.85)" />
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            testID="add-cash-in"
            onPress={() => setEditing({ type: "in", category: CASH_IN_CATEGORIES[0], amount: 0 })}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            style={[styles.actionBtn, { backgroundColor: c.success }]}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionText}>Kas Masuk</Text>
          </Pressable>
          <Pressable
            testID="add-cash-out"
            onPress={() => setEditing({ type: "out", category: CASH_OUT_CATEGORIES[0], amount: 0 })}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            style={[styles.actionBtn, { backgroundColor: c.error }]}
          >
            <MaterialCommunityIcons name="minus-circle-outline" size={18} color="#fff" />
            <Text style={styles.actionText}>Kas Keluar</Text>
          </Pressable>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={c.onSurfaceMuted} />
          <TextInput
            testID="cashflow-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Cari kategori atau keterangan"
            placeholderTextColor={c.onSurfaceMuted}
            style={[styles.searchInput, { color: c.onSurface }]}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
          {(["all", "in", "out"] as const).map((f) => (
            <Chip
              key={f}
              label={f === "all" ? "Semua" : f === "in" ? "Masuk" : "Keluar"}
              active={filter === f}
              onPress={() => setFilter(f)}
              testID={`cf-${f}`}
            />
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: 30 }} />
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 50 }}>
            <MaterialCommunityIcons name="cash-remove" size={48} color={c.onSurfaceMuted} />
            <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Belum ada catatan</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: SPACING.lg }}>
            {filtered.map((it) => (
              <View key={it.id} style={[styles.cfRow, { backgroundColor: c.surfaceSecondary }]} testID={`cf-row-${it.id}`}>
                <View style={[styles.cfIcon, { backgroundColor: (it.type === "in" ? c.success : c.error) + "1F" }]}>
                  <MaterialCommunityIcons name={it.type === "in" ? "arrow-down" : "arrow-up"} size={18} color={it.type === "in" ? c.success : c.error} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.onSurface, fontWeight: "700" }}>{it.category}</Text>
                  <Text style={{ color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 }}>
                    {new Date(it.created_at).toLocaleString("id-ID")}
                  </Text>
                  {it.note ? <Text style={{ color: c.onSurfaceMuted, fontSize: 11 }} numberOfLines={2}>{it.note}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: it.type === "in" ? c.success : c.error, fontWeight: "800" }}>
                    {it.type === "in" ? "+" : "-"} {formatRp(it.amount)}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                    <Pressable testID={`cf-edit-${it.id}`} onPress={() => setEditing(it)} hitSlop={6}>
                      <MaterialCommunityIcons name="pencil-outline" size={16} color={c.info} />
                    </Pressable>
                    <Pressable testID={`cf-del-${it.id}`} onPress={() => onDelete(it.id)} hitSlop={6}>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color={c.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <CashForm
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={async (v) => {
            await upsertCashFlow({ ...v, user_id: user?.id, user_name: user?.name });
            setEditing(null);
            toast.show("Tersimpan", "success");
            load();
          }}
        />
      </Modal>
    </View>
  );
}

const Kpi = ({ label, v, icon, color, testID }: any) => {
  const c = COLORS.light;
  return (
    <View testID={testID} style={[styles.kpi, { backgroundColor: c.surfaceSecondary }]}>
      <View style={[styles.kpiIcon, { backgroundColor: color + "1F" }]}>
        <MaterialCommunityIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.kpiLabel, { color: c.onSurfaceMuted }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: c.onSurface }]} numberOfLines={1}>{v}</Text>
    </View>
  );
};

const Chip = ({ label, active, onPress, testID }: any) => {
  const c = COLORS.light;
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, { backgroundColor: active ? c.brand : c.surfaceSecondary, borderColor: active ? c.brand : c.border }]}>
      <Text style={{ color: active ? "#fff" : c.onSurface, fontWeight: active ? "800" : "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
};

const CashForm = ({ value, onClose, onSaved }: { value: Partial<CashFlow> | null; onClose: () => void; onSaved: (v: any) => void }) => {
  const c = COLORS.light;
  const cats = value?.type === "in" ? CASH_IN_CATEGORIES : CASH_OUT_CATEGORIES;
  const [category, setCategory] = useState(value?.category ?? cats[0]);
  const [amount, setAmount] = useState(String(value?.amount ?? ""));
  const [note, setNote] = useState(value?.note ?? "");

  const save = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    onSaved({ id: value?.id, type: value?.type ?? "in", category, amount: amt, note });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBg}>
      <View style={[styles.modalSheet, { backgroundColor: c.surface }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: c.onSurface }]}>
            {value?.type === "in" ? "Kas Masuk" : "Kas Keluar"} {value?.id ? "(Edit)" : ""}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
          </Pressable>
        </View>

        <Text style={[styles.label, { color: c.onSurfaceMuted }]}>Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
          {cats.map((cat) => (
            <Chip key={cat} label={cat} active={category === cat} onPress={() => setCategory(cat)} testID={`form-cat-${cat}`} />
          ))}
        </ScrollView>

        <Text style={[styles.label, { color: c.onSurfaceMuted }]}>Nominal (Rp)</Text>
        <TextInput
          testID="cf-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={c.onSurfaceMuted}
          style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
        />

        <Text style={[styles.label, { color: c.onSurfaceMuted }]}>Keterangan (opsional)</Text>
        <TextInput
          testID="cf-note"
          value={note ?? ""}
          onChangeText={setNote}
          placeholder="Contoh: bayar listrik bulan ini"
          placeholderTextColor={c.onSurfaceMuted}
          multiline
          style={[styles.input, { borderColor: c.border, color: c.onSurface, minHeight: 60, paddingVertical: 10 }]}
        />

        <Pressable
          testID="cf-save"
          onPress={save}
          android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          style={[styles.modalCta, { backgroundColor: c.brand }]}
        >
          <Text style={styles.modalCtaText}>Simpan</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  kpiRow: { flexDirection: "row", gap: SPACING.md, paddingHorizontal: SPACING.lg, marginTop: SPACING.md },
  kpi: { flex: 1, padding: SPACING.md, borderRadius: RADII.md, ...SHADOW.card },
  kpiIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  kpiLabel: { fontSize: 11, fontWeight: "600" },
  kpiValue: { fontSize: FONT.sizes.lg, fontWeight: "800", marginTop: 2 },
  balCard: { flexDirection: "row", alignItems: "center", margin: SPACING.lg, padding: SPACING.lg, borderRadius: RADII.md, ...SHADOW.fab },
  balLabel: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "700" },
  balValue: { color: "#fff", fontSize: 26, fontWeight: "800", marginTop: 4 },
  balSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, marginTop: 4 },
  actionsRow: { flexDirection: "row", gap: SPACING.md, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  actionBtn: { flex: 1, height: 46, borderRadius: RADII.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, ...SHADOW.card },
  actionText: { color: "#fff", fontWeight: "800" },
  searchWrap: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, height: 44, borderRadius: RADII.pill, gap: SPACING.sm, ...SHADOW.card },
  searchInput: { flex: 1, fontSize: 14 },
  chipsContent: { paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: SPACING.sm },
  chip: { height: 36, flexShrink: 0, paddingHorizontal: 14, borderRadius: RADII.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  cfRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm, ...SHADOW.card },
  cfIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalHandle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: "#D0CCC6", marginBottom: SPACING.md },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalCta: { height: 54, borderRadius: RADII.md, alignItems: "center", justifyContent: "center", marginTop: SPACING.md, overflow: "hidden", ...SHADOW.fab },
  modalCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: SPACING.md, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: SPACING.md, height: 48, fontSize: 14 },
});
