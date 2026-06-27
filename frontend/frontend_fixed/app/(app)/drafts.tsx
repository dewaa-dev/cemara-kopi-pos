import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { COLORS, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { DraftOrder, deleteDraft, listDrafts } from "@/src/db/extras";
import { useToast } from "@/src/components/Toast";

export const DRAFT_LOAD_KEY = "ck_load_draft_v1";

export default function Drafts() {
  const c = COLORS.light;
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<DraftOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await listDrafts(search);
    setItems(list);
    setLoading(false);
  }, [search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onContinue = async (d: DraftOrder) => {
    await AsyncStorage.setItem(DRAFT_LOAD_KEY, JSON.stringify(d));
    router.push("/(app)/cashier");
  };

  const onDelete = async (id: string) => {
    await deleteDraft(id);
    toast.show("Draft dihapus", "success");
    load();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Draft Order" subtitle={`${items.length} pesanan tertunda`} showBack testID="drafts-header" />

      <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={c.onSurfaceMuted} />
        <TextInput
          testID="draft-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama pelanggan"
          placeholderTextColor={c.onSurfaceMuted}
          onSubmitEditing={() => load()}
          style={[styles.searchInput, { color: c.onSurface }]}
        />
        <Pressable onPress={() => load()} hitSlop={10}>
          <MaterialCommunityIcons name="filter" size={18} color={c.brand} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={c.brand} style={{ marginTop: 30 }} />
      ) : items.length === 0 ? (
        <View style={{ alignItems: "center", paddingTop: 50 }}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={c.onSurfaceMuted} />
          <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Belum ada draft order</Text>
          <Text style={{ color: c.onSurfaceMuted, fontSize: 12, marginTop: 4 }}>
            Simpan dari halaman kasir
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
          {items.map((d) => {
            let lineCount = 0;
            try {
              const cart = JSON.parse(d.cart_json);
              lineCount = Array.isArray(cart) ? cart.length : 0;
            } catch {}
            return (
              <View key={d.id} style={[styles.draftCard, { backgroundColor: c.surfaceSecondary }]} testID={`draft-${d.id}`}>
                <View style={[styles.draftIcon, { backgroundColor: c.brandSoft }]}>
                  <MaterialCommunityIcons name="account-circle" size={26} color={c.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.onSurface, fontWeight: "800" }}>{d.customer_name}</Text>
                  {d.phone ? <Text style={{ color: c.onSurfaceMuted, fontSize: 11 }}>{d.phone}</Text> : null}
                  <Text style={{ color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 }}>
                    {lineCount} item • {new Date(d.created_at).toLocaleString("id-ID")}
                  </Text>
                  {d.note ? <Text style={{ color: c.onSurfaceMuted, fontSize: 11 }} numberOfLines={1}>📝 {d.note}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Text style={{ color: c.brand, fontWeight: "800" }}>{formatRp(d.total)}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable testID={`draft-continue-${d.id}`} onPress={() => onContinue(d)} style={[styles.miniBtn, { backgroundColor: c.brand }]}>
                      <MaterialCommunityIcons name="cash-fast" size={14} color="#fff" />
                      <Text style={styles.miniBtnText}>Bayar</Text>
                    </Pressable>
                    <Pressable testID={`draft-delete-${d.id}`} onPress={() => onDelete(d.id)} hitSlop={4}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={c.error} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, height: 44, borderRadius: RADII.pill, gap: SPACING.sm, ...SHADOW.card },
  searchInput: { flex: 1, fontSize: 14 },
  draftCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm, ...SHADOW.card },
  draftIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  miniBtnText: { color: "#fff", fontWeight: "700", fontSize: 11 },
});
