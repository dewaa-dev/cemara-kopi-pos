import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { COLORS, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import {
  Category,
  deleteProduct,
  listCategories,
  listProducts,
  Product,
  upsertProduct,
  listVariants,
  upsertVariants,
  ProductVariant,
} from "@/src/db/repo";
import { useAuth } from "@/src/contexts/AuthContext";
import { useToast } from "@/src/components/Toast";

export default function Products() {
  const c = COLORS.light;
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user?.role === "admin";
  const [cats, setCats] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const debounceRef = useRef<any>(null);

  const load = useCallback(async () => {
    const list = await listProducts({
      categoryId: activeCat,
      search,
      includeToppings: true,
    });
    setItems(list);
    setLoading(false);
  }, [activeCat, search]);

  useFocusEffect(
    useCallback(() => {
      listCategories().then(setCats);
      load();
    }, [load])
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 220);
  }, [search, activeCat, load]);

  const onDelete = async (p: Product) => {
    await deleteProduct(p.id);
    toast.show("Produk dihapus", "success");
    load();
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <LinearGradient colors={[c.brand, c.brandDark]} style={styles.headerBg} />
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Master Produk</Text>
          <Text style={styles.subtitle}>{items.length} produk</Text>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={c.onSurfaceMuted} />
          <TextInput
            testID="products-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama produk"
            placeholderTextColor={c.onSurfaceMuted}
            style={[styles.searchInput, { color: c.onSurface }]}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
          style={styles.chips}
        >
          <Chip label="Semua" active={activeCat === "all"} onPress={() => setActiveCat("all")} testID="pchip-all" />
          {cats.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              active={activeCat === cat.id}
              onPress={() => setActiveCat(cat.id)}
              testID={`pchip-${cat.id}`}
            />
          ))}
        </ScrollView>
      </SafeAreaView>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.brand} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 140 }}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: c.surfaceSecondary }]}>
              <View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}>
                <MaterialCommunityIcons
                  name={
                    item.is_topping
                      ? "shape-plus"
                      : item.category_id === "cat_minuman"
                      ? "coffee"
                      : item.category_id === "cat_camilan"
                      ? "food-drumstick"
                      : "noodles"
                  }
                  size={22}
                  color={c.brand}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.onSurface, fontWeight: "700" }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ color: c.onSurfaceMuted, fontSize: 12, marginTop: 2 }}>
                  Stok {item.stock} • min {item.min_stock}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: c.brand, fontWeight: "800" }}>{formatRp(item.sell_price)}</Text>
                {isAdmin && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    <Pressable
                      testID={`edit-${item.id}`}
                      onPress={() => setEditing(item)}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={c.info} />
                    </Pressable>
                    <Pressable
                      testID={`variant-${item.id}`}
                      onPress={() => setVariantFor(item)}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="format-list-bulleted" size={18} color={c.accent} />
                    </Pressable>
                    <Pressable
                      testID={`delete-${item.id}`}
                      onPress={() => onDelete(item)}
                      hitSlop={6}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={c.error} />
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60 }}>
              <MaterialCommunityIcons name="package-variant" size={48} color={c.onSurfaceMuted} />
              <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Belum ada produk</Text>
            </View>
          }
        />
      )}

      {isAdmin && (
        <Pressable
          testID="add-product-fab"
          onPress={() =>
            setEditing({
              name: "",
              category_id: "cat_minuman",
              cost_price: 0,
              sell_price: 0,
              stock: 0,
              min_stock: 0,
              active: 1,
              is_topping: 0,
            })
          }
          android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
          style={[styles.fab, { backgroundColor: c.brand }]}
        >
          <MaterialCommunityIcons name="plus" size={28} color="#fff" />
        </Pressable>
      )}

      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <ProductForm
          value={editing}
          cats={cats}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            toast.show("Tersimpan", "success");
          }}
        />
      </Modal>

      <Modal
        visible={!!variantFor}
        transparent
        animationType="slide"
        onRequestClose={() => setVariantFor(null)}
      >
        <VariantManager
          product={variantFor}
          onClose={() => setVariantFor(null)}
          onSaved={() => {
            setVariantFor(null);
            toast.show("Varian tersimpan", "success");
          }}
        />
      </Modal>
    </View>
  );
}

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
      android_ripple={{ color: c.brandSoft }}
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
          color: active ? "#fff" : COLORS.light.onSurface,
          fontWeight: active ? "800" : "600",
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const ProductForm = ({
  value,
  cats,
  onClose,
  onSaved,
}: {
  value: Partial<Product> | null;
  cats: Category[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const c = COLORS.light;
  const [name, setName] = useState(value?.name ?? "");
  const [catId, setCatId] = useState(value?.category_id ?? "cat_minuman");
  const [cost, setCost] = useState(String(value?.cost_price ?? 0));
  const [price, setPrice] = useState(String(value?.sell_price ?? 0));
  const [stock, setStock] = useState(String(value?.stock ?? 0));
  const [minStock, setMinStock] = useState(String(value?.min_stock ?? 0));
  const [photo, setPhoto] = useState(value?.photo ?? null);
  const [busy, setBusy] = useState(false);

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? "images" as any,
      base64: true,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets[0].base64) {
      setPhoto(`data:image/jpeg;base64,${res.assets[0].base64}`);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await upsertProduct({
      id: value?.id,
      name: name.trim(),
      category_id: catId,
      cost_price: parseFloat(cost) || 0,
      sell_price: parseFloat(price) || 0,
      stock: parseInt(stock) || 0,
      min_stock: parseInt(minStock) || 0,
      photo,
      active: 1,
      is_topping: catId === "cat_topping" ? 1 : 0,
    });
    setBusy(false);
    onSaved();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.modalBg}
    >
      <View style={[styles.modalSheet, { backgroundColor: c.surface, height: "90%" }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: c.onSurface }]}>
            {value?.id ? "Edit Produk" : "Tambah Produk"}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} testID="form-close">
            <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24, gap: 10 }}>
          <Pressable onPress={pickImage} style={[styles.photoPicker, { borderColor: c.border }]} testID="form-photo">
            {photo ? (
              <View style={[styles.photoPreviewWrap]}>
                <MaterialCommunityIcons name="image-edit-outline" size={18} color="#fff" style={styles.photoEdit} />
              </View>
            ) : (
              <View style={{ alignItems: "center" }}>
                <MaterialCommunityIcons name="camera-plus-outline" size={32} color={c.onSurfaceMuted} />
                <Text style={{ color: c.onSurfaceMuted, fontSize: 12, marginTop: 6 }}>Tambah Foto</Text>
              </View>
            )}
          </Pressable>

          <FieldLabel>Nama Produk</FieldLabel>
          <TextInput
            testID="form-name"
            value={name}
            onChangeText={setName}
            placeholder="Nama produk"
            placeholderTextColor={c.onSurfaceMuted}
            style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
          />

          <FieldLabel>Kategori</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {cats.map((cat) => (
              <Chip
                key={cat.id}
                label={cat.name}
                active={catId === cat.id}
                onPress={() => setCatId(cat.id)}
                testID={`form-cat-${cat.id}`}
              />
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Modal (Rp)</FieldLabel>
              <TextInput
                testID="form-cost"
                value={cost}
                onChangeText={setCost}
                keyboardType="numeric"
                style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Harga Jual (Rp)</FieldLabel>
              <TextInput
                testID="form-price"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: SPACING.sm }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Stok</FieldLabel>
              <TextInput
                testID="form-stock"
                value={stock}
                onChangeText={setStock}
                keyboardType="numeric"
                style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Min Stok</FieldLabel>
              <TextInput
                testID="form-min-stock"
                value={minStock}
                onChangeText={setMinStock}
                keyboardType="numeric"
                style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
              />
            </View>
          </View>
        </ScrollView>

        <Pressable
          testID="form-save"
          onPress={save}
          disabled={busy}
          android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          style={[styles.modalCta, { backgroundColor: c.brand, opacity: busy ? 0.7 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalCtaText}>Simpan</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── VariantManager ───────────────────────────────────────────────────────────
const VariantManager = ({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const c = COLORS.light;
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    listVariants(product.id).then((v) => {
      setVariants(v);
      setLoading(false);
    });
    setNewName("");
  }, [product?.id]);

  if (!product) return null;

  const addVariant = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    // Cek duplikat
    if (variants.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())) return;
    setVariants((prev) => [
      ...prev,
      { id: `temp_${Date.now()}`, product_id: product.id, name: trimmed, sort_order: prev.length },
    ]);
    setNewName("");
  };

  const removeVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const save = async () => {
    setBusy(true);
    try {
      await upsertVariants(product.id, variants.map((v) => v.name));
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  // Preset varian cepat berdasarkan kategori
  const getPresets = () => {
    if (product.category_id === "cat_minuman") {
      return ["Pahit", "Manis", "Biasa", "Extra Manis", "Tanpa Gula"];
    }
    if (product.category_id === "cat_mie") {
      return ["Pedas", "Tidak Pedas", "Extra Pedas", "Kuah", "Goreng"];
    }
    return ["Regular", "Large", "Extra"];
  };

  const addPreset = (name: string) => {
    if (variants.some((v) => v.name.toLowerCase() === name.toLowerCase())) return;
    setVariants((prev) => [
      ...prev,
      { id: `temp_${Date.now()}`, product_id: product.id, name, sort_order: prev.length },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBg}>
      <View style={[styles.modalSheet, { backgroundColor: c.surface, maxHeight: "85%" }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalTitle, { color: c.onSurface }]}>Kelola Varian</Text>
            <Text style={{ color: c.onSurfaceMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {product.name}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
          </Pressable>
        </View>

        {/* Preset cepat */}
        <Text style={[styles.variantLabel, { color: c.onSurfaceMuted }]}>Tambah Cepat</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {getPresets().map((p) => {
            const already = variants.some((v) => v.name.toLowerCase() === p.toLowerCase());
            return (
              <Pressable
                key={p}
                onPress={() => addPreset(p)}
                disabled={already}
                style={[styles.presetChip, {
                  backgroundColor: already ? c.surfaceTertiary : c.brandSoft,
                  borderColor: already ? c.border : c.brand,
                  opacity: already ? 0.5 : 1,
                }]}
              >
                <MaterialCommunityIcons name={already ? "check" : "plus"} size={13} color={already ? c.onSurfaceMuted : c.brand} />
                <Text style={{ color: already ? c.onSurfaceMuted : c.brand, fontSize: 12, fontWeight: "700" }}>{p}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Input manual */}
        <Text style={[styles.variantLabel, { color: c.onSurfaceMuted }]}>Tambah Manual</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Nama varian baru..."
            placeholderTextColor={c.onSurfaceMuted}
            style={[styles.input, { flex: 1, borderColor: c.border, color: c.onSurface, height: 44 }]}
            onSubmitEditing={addVariant}
            returnKeyType="done"
          />
          <Pressable
            onPress={addVariant}
            disabled={!newName.trim()}
            style={[styles.addVarBtn, { backgroundColor: newName.trim() ? c.brand : c.border }]}
          >
            <MaterialCommunityIcons name="plus" size={22} color="#fff" />
          </Pressable>
        </View>

        {/* Daftar varian */}
        <Text style={[styles.variantLabel, { color: c.onSurfaceMuted }]}>
          Varian Aktif ({variants.length})
        </Text>
        {loading ? (
          <ActivityIndicator color={c.brand} style={{ paddingVertical: 20 }} />
        ) : (
          <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
            {variants.length === 0 ? (
              <Text style={{ color: c.onSurfaceMuted, fontSize: 13, textAlign: "center", paddingVertical: 16 }}>
                Belum ada varian — produk ini langsung masuk keranjang
              </Text>
            ) : (
              variants.map((v, i) => (
                <View key={v.id} style={[styles.variantItem, { borderColor: c.border, backgroundColor: c.surfaceSecondary }]}>
                  <View style={[styles.variantBadge, { backgroundColor: c.brandSoft }]}>
                    <Text style={{ color: c.brand, fontSize: 11, fontWeight: "800" }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, color: c.onSurface, fontWeight: "600" }}>{v.name}</Text>
                  <Pressable onPress={() => removeVariant(v.id)} hitSlop={8}>
                    <MaterialCommunityIcons name="close-circle" size={20} color={c.error} />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        )}

        <Pressable
          onPress={save}
          disabled={busy}
          android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          style={[styles.modalCta, { backgroundColor: c.brand, opacity: busy ? 0.7 : 1, marginTop: 12 }]}
        >
          {busy
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.modalCtaText}>Simpan Varian</Text>
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── FieldLabel ───────────────────────────────────────────────────────────────
  // ─── FieldLabel ───────────────────────────────────────────────────────────────
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ color: COLORS.light.onSurfaceMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 6 }}>
    {children}
  </Text>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { position: "absolute", top: 0, left: 0, right: 0, height: 200 },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  searchWrap: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    height: 44,
    borderRadius: RADII.pill,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  searchInput: { flex: 1, fontSize: 14 },
  chips: { marginTop: SPACING.sm },
  chipsContent: { paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: 8 },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: 14,
    borderRadius: RADII.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    bottom: Platform.OS === "ios" ? 100 : 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.fab,
  },
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
    height: 44,
    fontSize: 14,
  },
  photoPicker: {
    alignSelf: "center",
    width: 110,
    height: 110,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  photoPreviewWrap: {
    width: "100%",
    height: "100%",
    borderRadius: RADII.md,
    backgroundColor: COLORS.light.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoEdit: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: COLORS.light.brand,
    padding: 4,
    borderRadius: 12,
  },
  variantLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
  presetChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  addVarBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  variantItem: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  variantBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});