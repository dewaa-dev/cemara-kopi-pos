import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { COLORS, FONT, RADII, SHADOW, SPACING, formatRp } from "@/src/theme";
import {
  CartLine,
  Category,
  createTransaction,
  getSettings,
  listCategories,
  listProducts,
  listToppings,
  Product,
} from "@/src/db/repo";
import { useAuth } from "@/src/contexts/AuthContext";
import { useToast } from "@/src/components/Toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveDraft, markDraftPaid } from "@/src/db/extras";
import { DRAFT_LOAD_KEY } from "./drafts";
import {
  printReceipt,
  getDefaultPrinter,
  type PaperSize,
} from "@/src/services/bluetoothPrinter";

const PAY_METHODS = [
  { id: "Tunai", icon: "cash" as const },
  { id: "QRIS", icon: "qrcode-scan" as const },
  { id: "Transfer", icon: "bank-transfer" as const },
  { id: "E-Wallet", icon: "wallet" as const },
];

const getCatIcon = (categoryId: string) => {
  if (categoryId === "cat_minuman") return "coffee";
  if (categoryId === "cat_camilan") return "food-drumstick";
  return "noodles";
};

export default function Cashier() {
  const c = COLORS.light;
  const { user } = useAuth();
  const toast = useToast();

  const tabBarHeight = useBottomTabBarHeight();
  const [cats, setCats] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [toppings, setToppings] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [taxPercent, setTaxPercent] = useState(0);
  const [storeName, setStoreName] = useState("Cemara Kopi");

  const [toppingFor, setToppingFor] = useState<Product | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReceipt, setShowReceipt] = useState<any>(null);

  const [discount, setDiscount] = useState("0");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [paid, setPaid] = useState("");
  const [payMethod, setPayMethod] = useState("Tunai");
  const [busy, setBusy] = useState(false);
  const [loadedDraftId, setLoadedDraftId] = useState<string | null>(null);

  // FIX BUG 3: Pakai ref untuk track apakah sudah init, hindari re-run useFocusEffect
  const initializedRef = useRef(false);
  const debounceRef = useRef<any>(null);
  // FIX: refs untuk avoid stale closure di setTimeout callback
  const activeCatRef = useRef<string>("all");
  const searchRef = useRef<string>("");

  // FIX BUG 2: loadProducts dibuat stabil, tidak bergantung pada state yang berubah-ubah
  const loadProducts = useCallback(async (cat: string, q: string) => {
    try {
      const list = await listProducts({ categoryId: cat, search: q });
      setProducts(list);
    } catch (e) {
      console.error("[Cashier] loadProducts error:", e);
    }
  }, []); // deps kosong — fungsi ini stabil

  // FIX BUG 3: useFocusEffect HANYA load data statis (categories, toppings, settings, draft)
  // TIDAK include search/activeCat sebagai deps agar tidak re-run saat user mengetik
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const [cs, tops, sets] = await Promise.all([
            listCategories(),
            listToppings(),
            getSettings(),
          ]);
          if (!active) return;
          setCats(cs);
          setToppings(tops);
          setTaxPercent(parseFloat(sets.tax_percent || "0"));
          setStoreName(sets.store_name || "Cemara Kopi");

          // Load produk hanya saat pertama focus (bukan setiap re-focus)
          if (!initializedRef.current) {
            initializedRef.current = true;
            await loadProducts("all", "");
          }

          // Load draft jika ada
          const raw = await AsyncStorage.getItem(DRAFT_LOAD_KEY);
          if (raw && active) {
            try {
              const d = JSON.parse(raw);
              const cartLoaded = JSON.parse(d.cart_json);
              if (Array.isArray(cartLoaded)) {
                setCart(cartLoaded);
                setCustomerName(d.customer_name ?? "");
                setPhone(d.phone ?? "");
                setLoadedDraftId(d.id);
                toast.show(`Draft ${d.customer_name} dimuat`, "success");
              }
            } catch {}
            await AsyncStorage.removeItem(DRAFT_LOAD_KEY);
          }
        } catch (e) {
          console.error("[Cashier] useFocusEffect error:", e);
        }
      })();

      return () => { active = false; };
    }, [loadProducts, toast]) // FIX: hapus activeCat & search dari deps
  );

  // FIX BUG 3: Debounce search & category change — reload produk saat filter berubah
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      loadProducts(activeCat, search);
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, activeCat, loadProducts]);

  const addToCart = (p: Product) => {
    const isMie = p.id.startsWith("prod_mie_");
    if (isMie) {
      setToppingFor(p);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id && l.toppings.length === 0);
      if (idx >= 0) {
        const c2 = [...prev];
        c2[idx] = { ...c2[idx], qty: c2[idx].qty + 1 };
        return c2;
      }
      return [
        ...prev,
        { productId: p.id, productName: p.name, price: p.sell_price, qty: 1, toppings: [] },
      ];
    });
    toast.show(`+ ${p.name}`, "success");
  };

  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    cart.forEach((l) => { map[l.productId] = (map[l.productId] || 0) + l.qty; });
    return map;
  }, [cart]);

  const subtotal = useMemo(() => {
    let s = 0;
    cart.forEach((l) => {
      s += l.price * l.qty;
      l.toppings.forEach((t) => (s += t.price * t.qty * l.qty));
    });
    return s;
  }, [cart]);

  const discountVal = Math.max(0, parseFloat(discount) || 0);
  const afterDisc   = Math.max(0, subtotal - discountVal);
  const taxVal      = Math.round((afterDisc * taxPercent) / 100);
  const total       = afterDisc + taxVal;
  const paidVal     = parseFloat(paid) || 0;
  const change      = Math.max(0, paidVal - total);
  const totalItems  = cart.reduce((s, l) => s + l.qty, 0);

  // Sync refs saat state berubah
  useEffect(() => { activeCatRef.current = activeCat; }, [activeCat]);
  useEffect(() => { searchRef.current = search; }, [search]);

  const removeLine = (idx: number) => setCart((p) => p.filter((_, i) => i !== idx));
  const incLine    = (idx: number) => setCart((p) => p.map((l, i) => (i === idx ? { ...l, qty: l.qty + 1 } : l)));
  const decLine    = (idx: number) =>
    setCart((p) =>
      p.map((l, i) => (i === idx ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0)
    );

  // FIX BUG 1: onSaveDraft sekarang memberi feedback jelas kenapa tidak bisa dipencet
  const onSaveDraft = async () => {
    if (!cart.length) {
      toast.show("Keranjang kosong", "error");
      return;
    }
    // FIX: tunjukkan alert yang jelas, bukan diam-diam return
    if (!customerName.trim()) {
      Alert.alert(
        "Nama Pelanggan Kosong",
        "Isi nama pelanggan dulu sebelum menyimpan draft.",
        [{ text: "OK", style: "default" }]
      );
      return;
    }
    setBusy(true);
    try {
      await saveDraft({
        id: loadedDraftId ?? undefined,
        customer_name: customerName.trim(),
        phone: phone || undefined,
        total,
        cart_json: JSON.stringify(cart),
        cashier_id: user?.id,
        cashier_name: user?.name,
      });
      setCart([]); setDiscount("0"); setCustomerName(""); setPhone("");
      setLoadedDraftId(null); setShowCheckout(false);
      toast.show("Draft tersimpan", "success");
    } catch (e: any) {
      toast.show("Gagal simpan draft: " + (e?.message || ""), "error");
    } finally {
      setBusy(false);
    }
  };

  // FIX BUG 2: submitOrder dengan error handling yang lebih robust
  const submitOrder = async () => {
    if (!cart.length) return;
    if (payMethod === "Tunai" && paidVal < total) {
      toast.show("Nominal pembayaran kurang", "error");
      return;
    }
    setBusy(true);
    try {
      const finalPaid = payMethod === "Tunai" ? paidVal : total;
      const finalChange = Math.max(0, finalPaid - total);

      // FIX BUG 2: Snapshot cart SEBELUM di-clear, hindari race condition
      const cartSnapshot = [...cart];
      const subtotalSnapshot = subtotal;
      const taxSnapshot = taxVal;
      const totalSnapshot = total;

      const res = await createTransaction({
        cart: cartSnapshot,
        discount: discountVal,
        tax_percent: taxPercent,
        paid: finalPaid,
        payment_method: payMethod,
        customer_name: customerName || undefined,
        cashier_id: user!.id,
        cashier_name: user!.name,
      });

      // Clear form DULU sebelum set receipt
      setCart([]);
      setDiscount("0");
      setCustomerName("");
      setPhone("");
      setPaid("");
      setShowCheckout(false);

      if (loadedDraftId) {
        await markDraftPaid(loadedDraftId);
        setLoadedDraftId(null);
      }

      // Set receipt SETELAH clear agar tidak ada state conflict
      setShowReceipt({
        code:           res.code,
        store:          storeName,
        cashier:        user!.name,
        date:           new Date(),
        customer_name:  customerName || "",
        payment_method: payMethod,
        paymentMethod:  payMethod,
        cart:           cartSnapshot,
        subtotal:       subtotalSnapshot,
        discount:       discountVal,
        tax:            taxSnapshot,
        total:          totalSnapshot,
        paid:           finalPaid,
        change:         finalChange,
      });

      toast.show("Transaksi sukses", "success");

      // FIX BUG 2: Reload produk setelah transaksi untuk update stok
      // Delay sedikit agar DB selesai commit dulu
      setTimeout(() => {
        loadProducts(activeCatRef.current, searchRef.current);
      }, 500);

    } catch (e: any) {
      console.error("[Cashier] submitOrder error:", e);
      toast.show("Gagal: " + (e?.message || "error"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <LinearGradient colors={[c.brand, c.brandDark]} style={styles.headerBg} />
      <SafeAreaView edges={["top"]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Kasir</Text>
            <Text style={styles.subtitle}>{storeName}</Text>
          </View>
          {cart.length > 0 && (
            <Pressable
              onPress={() => setShowCheckout(true)}
              style={styles.headerCartBtn}
              android_ripple={{ color: "rgba(255,255,255,0.2)" }}
            >
              <MaterialCommunityIcons name="cart-outline" size={22} color="#fff" />
              <View style={styles.headerCartBadge}>
                <Text style={styles.headerCartBadgeText}>{totalItems}</Text>
              </View>
            </Pressable>
          )}
        </View>

        <View style={[styles.searchWrap, { backgroundColor: c.surfaceSecondary }]}>
          <MaterialCommunityIcons name="magnify" size={18} color={c.onSurfaceMuted} />
          <TextInput
            testID="cashier-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Cari produk..."
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
          style={styles.chips}
        >
          <Chip label="Semua" active={activeCat === "all"} onPress={() => setActiveCat("all")} testID="chip-all" />
          {cats.filter((cat) => cat.id !== "cat_topping").map((cat) => (
            <Chip key={cat.id} label={cat.name} active={activeCat === cat.id}
              onPress={() => setActiveCat(cat.id)} testID={`chip-${cat.id}`} />
          ))}
        </ScrollView>
      </SafeAreaView>

      <FlatList
        data={products}
        numColumns={2}
        keyExtractor={(it) => it.id}
        columnWrapperStyle={{ gap: SPACING.md }}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        // FIX BUG 3: removeClippedSubviews false agar tidak ada item hilang saat scroll
        removeClippedSubviews={false}
        renderItem={({ item }) => {
          const qtyInCart = cartQtyMap[item.id] || 0;
          return (
            <ProductCard item={item} qtyInCart={qtyInCart} onPress={() => addToCart(item)} />
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <MaterialCommunityIcons name="package-variant" size={48} color={c.onSurfaceMuted} />
            <Text style={{ color: c.onSurfaceMuted, marginTop: 8 }}>Tidak ada produk</Text>
          </View>
        }
      />

      {cart.length > 0 && (
        <Pressable
          testID="cart-summary-bar"
          onPress={() => setShowCheckout(true)}
          style={[styles.cartBar, { backgroundColor: c.brand, bottom: tabBarHeight + 10 }]}
          android_ripple={{ color: "rgba(255,255,255,0.18)" }}
        >
          <View style={styles.cartBubble}>
            <Text style={styles.cartBubbleText}>{totalItems}</Text>
          </View>
          <Text style={styles.cartBarText}>Lihat Keranjang</Text>
          <Text style={styles.cartBarTotal}>{formatRp(total)}</Text>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#fff" />
        </Pressable>
      )}

      {/* Topping modal */}
      <Modal visible={!!toppingFor} animationType="slide" transparent onRequestClose={() => setToppingFor(null)}>
        <ToppingPicker
          product={toppingFor}
          toppings={toppings}
          onClose={() => setToppingFor(null)}
          onAdd={(qty, sel) => {
            if (!toppingFor) return;
            setCart((prev) => [...prev, {
              productId: toppingFor.id, productName: toppingFor.name,
              price: toppingFor.sell_price, qty, toppings: sel,
            }]);
            setToppingFor(null);
            toast.show(`+ ${toppingFor.name}`, "success");
          }}
        />
      </Modal>

      {/* Checkout modal */}
      <Modal visible={showCheckout} animationType="slide" transparent onRequestClose={() => setShowCheckout(false)}>
        <CheckoutSheet
          cart={cart} subtotal={subtotal} discount={discount} setDiscount={setDiscount}
          customerName={customerName} setCustomerName={setCustomerName}
          phone={phone} setPhone={setPhone} paid={paid} setPaid={setPaid}
          payMethod={payMethod} setPayMethod={setPayMethod}
          tax={taxVal} total={total} change={change} busy={busy} loadedDraftId={loadedDraftId}
          onClose={() => setShowCheckout(false)} onSubmit={submitOrder} onSaveDraft={onSaveDraft}
          incLine={incLine} decLine={decLine} removeLine={removeLine}
        />
      </Modal>

      {/* Receipt modal */}
      <Modal visible={!!showReceipt} animationType="fade" transparent onRequestClose={() => setShowReceipt(null)}>
        <ReceiptView data={showReceipt} onClose={() => setShowReceipt(null)} />
      </Modal>
    </View>
  );
}

// ─── ProductCard ─────────────────────────────────────────────────────────────
const ProductCard = React.memo(({ item, qtyInCart, onPress }: {
  item: Product; qtyInCart: number; onPress: () => void;
}) => {
  const c = COLORS.light;
  const isLowStock = item.stock <= item.min_stock;
  return (
    <Pressable
      testID={`product-card-${item.id}`}
      onPress={onPress}
      android_ripple={{ color: c.brandSoft }}
      style={[styles.productCard, { backgroundColor: c.surfaceSecondary }]}
    >
      {qtyInCart > 0 && (
        <View style={[styles.qtyBadge, { backgroundColor: c.brand }]}>
          <Text style={styles.qtyBadgeText}>{qtyInCart}</Text>
        </View>
      )}
      {isLowStock && (
        <View style={styles.stockBadge}>
          <Text style={styles.stockBadgeText}>Stok {item.stock}</Text>
        </View>
      )}
      <View style={[styles.thumb, { backgroundColor: qtyInCart > 0 ? c.brandSoft : c.surfaceTertiary }]}>
        <MaterialCommunityIcons
          name={getCatIcon(item.category_id)}
          size={32}
          color={qtyInCart > 0 ? c.brand : c.onSurfaceMuted}
        />
      </View>
      <Text style={[styles.prodName, { color: c.onSurface }]} numberOfLines={2}>{item.name}</Text>
      <Text style={[styles.prodPrice, { color: c.brand }]}>{formatRp(item.sell_price)}</Text>
      <View style={[styles.addBtn, { backgroundColor: qtyInCart > 0 ? c.brand : c.brandSoft }]}>
        <MaterialCommunityIcons name="plus" size={16} color={qtyInCart > 0 ? "#fff" : c.brand} />
        <Text style={[styles.addBtnText, { color: qtyInCart > 0 ? "#fff" : c.brand }]}>
          {qtyInCart > 0 ? "Tambah lagi" : "Tambah"}
        </Text>
      </View>
    </Pressable>
  );
});

// ─── Chip ─────────────────────────────────────────────────────────────────────
const Chip = ({ label, active, onPress, testID }: {
  label: string; active: boolean; onPress: () => void; testID?: string;
}) => {
  const c = COLORS.light;
  return (
    <Pressable testID={testID} onPress={onPress} android_ripple={{ color: c.brandSoft }}
      style={[styles.chip, { backgroundColor: active ? c.brand : c.surfaceSecondary, borderColor: active ? c.brand : c.border }]}
    >
      <Text style={[styles.chipText, { color: active ? "#fff" : c.onSurface, fontWeight: active ? "800" : "600" }]}>
        {label}
      </Text>
    </Pressable>
  );
};

// ─── ToppingPicker ────────────────────────────────────────────────────────────
const ToppingPicker = ({ product, toppings, onClose, onAdd }: {
  product: Product | null;
  toppings: Product[];
  onClose: () => void;
  onAdd: (qty: number, sel: { productId: string; productName: string; price: number; qty: number }[]) => void;
}) => {
  const c = COLORS.light;
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState<Record<string, number>>({});

  useEffect(() => { setQty(1); setSel({}); }, [product?.id]);
  if (!product) return null;

  const setTopQty = (id: string, q: number) => {
    setSel((s) => { const n = { ...s }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  };

  const toppingsTotal = toppings.reduce((s, t) => s + (sel[t.id] || 0) * t.sell_price, 0);
  const lineTotal = (product.sell_price + toppingsTotal) * qty;

  return (
    <View style={styles.modalBg}>
      <View style={[styles.modalSheet, { backgroundColor: c.surface, maxHeight: "80%" }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: c.onSurface }]}>{product.name}</Text>
          <Pressable onPress={onClose} hitSlop={10} testID="topping-close">
            <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
          </Pressable>
        </View>
        <Text style={[styles.modalSub, { color: c.onSurfaceMuted }]}>Pilih topping (opsional)</Text>
        <ScrollView style={{ marginTop: SPACING.md }}>
          {toppings.map((t) => {
            const cur = sel[t.id] || 0;
            return (
              <View key={t.id} style={[styles.topRow, { borderColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.onSurface, fontWeight: "700" }}>{t.name}</Text>
                  <Text style={{ color: c.brand, fontWeight: "700", fontSize: 12, marginTop: 2 }}>
                    +{formatRp(t.sell_price)}
                  </Text>
                </View>
                <Stepper value={cur} onChange={(v) => setTopQty(t.id, v)} />
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.qtyBlock, { borderColor: c.border }]}>
          <Text style={{ color: c.onSurface, fontWeight: "700" }}>Jumlah</Text>
          <Stepper value={qty} onChange={(v) => setQty(Math.max(1, v))} />
        </View>
        <Pressable
          testID="topping-add-button"
          onPress={() => onAdd(qty, toppings.filter((t) => sel[t.id]).map((t) => ({
            productId: t.id, productName: t.name, price: t.sell_price, qty: sel[t.id],
          })))}
          android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          style={[styles.modalCta, { backgroundColor: c.brand }]}
        >
          <Text style={styles.modalCtaText}>Tambahkan • {formatRp(lineTotal)}</Text>
        </Pressable>
      </View>
    </View>
  );
};

// ─── Stepper ──────────────────────────────────────────────────────────────────
const Stepper = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
  const c = COLORS.light;
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(value - 1)}
        style={[styles.stepperBtn, { backgroundColor: c.surfaceTertiary }]} hitSlop={6}>
        <MaterialCommunityIcons name="minus" size={16} color={c.onSurface} />
      </Pressable>
      <Text style={[styles.stepperValue, { color: c.onSurface }]}>{value}</Text>
      <Pressable onPress={() => onChange(value + 1)}
        style={[styles.stepperBtn, { backgroundColor: c.brand }]} hitSlop={6}>
        <MaterialCommunityIcons name="plus" size={16} color="#fff" />
      </Pressable>
    </View>
  );
};

// ─── CheckoutSheet ────────────────────────────────────────────────────────────
const CheckoutSheet = (props: any) => {
  const c = COLORS.light;
  const {
    cart, subtotal, discount, setDiscount, customerName, setCustomerName,
    phone, setPhone, paid, setPaid, payMethod, setPayMethod,
    tax, total, change, busy, loadedDraftId,
    onClose, onSubmit, onSaveDraft, incLine, decLine, removeLine,
  } = props;

  // FIX BUG 1: draft button hanya disabled kalau busy atau cart kosong
  // Validasi nama pelanggan dipindah ke dalam onSaveDraft dengan Alert
  const draftDisabled = busy || cart.length === 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBg}>
      <View style={[styles.modalSheet, { backgroundColor: c.surface, height: "92%" }]}>
        <View style={styles.modalHandle} />
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: c.onSurface }]}>Keranjang</Text>
          <Pressable onPress={onClose} hitSlop={10} testID="checkout-close">
            <MaterialCommunityIcons name="close" size={22} color={c.onSurface} />
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          {cart.map((l: CartLine, i: number) => (
            <View key={i} style={[styles.cartItem, { borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.onSurface, fontWeight: "700" }}>{l.productName}</Text>
                <Text style={{ color: c.brand, fontWeight: "700", fontSize: 12, marginTop: 2 }}>
                  {formatRp(l.price)}
                </Text>
                {l.toppings.map((t) => (
                  <Text key={t.productId} style={{ color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 }}>
                    + {t.productName} x{t.qty} ({formatRp(t.price * t.qty)})
                  </Text>
                ))}
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Pressable onPress={() => removeLine(i)} hitSlop={6}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={c.error} />
                </Pressable>
                <Stepper value={l.qty} onChange={(v) => (v > l.qty ? incLine(i) : decLine(i))} />
              </View>
            </View>
          ))}

          {/* FIX BUG 1: Hint nama pelanggan wajib untuk draft */}
          <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Detail Pelanggan</Text>
          <TextInput
            testID="checkout-customer-name" value={customerName} onChangeText={setCustomerName}
            placeholder="Nama pelanggan (wajib untuk simpan draft)"
            placeholderTextColor={c.onSurfaceMuted}
            style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
          />
          <TextInput
            testID="checkout-customer-phone" value={phone} onChangeText={setPhone}
            placeholder="No HP (opsional)" placeholderTextColor={c.onSurfaceMuted}
            keyboardType="phone-pad"
            style={[styles.input, { borderColor: c.border, color: c.onSurface, marginTop: 8 }]}
          />

          <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Metode Pembayaran</Text>
          <View style={styles.payRow}>
            {PAY_METHODS.map((p) => (
              <Pressable key={p.id} testID={`pay-${p.id}`} onPress={() => setPayMethod(p.id)}
                style={[styles.payBtn, {
                  borderColor: payMethod === p.id ? c.brand : c.border,
                  backgroundColor: payMethod === p.id ? c.brandSoft : c.surfaceSecondary,
                }]}
              >
                <MaterialCommunityIcons name={p.icon} size={18} color={payMethod === p.id ? c.brand : c.onSurfaceMuted} />
                <Text style={{ color: payMethod === p.id ? c.brand : c.onSurface, fontSize: 11, fontWeight: "700", marginTop: 2 }}>
                  {p.id}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Diskon (Rp)</Text>
              <TextInput
                testID="checkout-discount" value={discount} onChangeText={setDiscount}
                placeholder="0" keyboardType="numeric" placeholderTextColor={c.onSurfaceMuted}
                style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
              />
            </View>
            {payMethod === "Tunai" && (
              <View style={{ flex: 1 }}>
                <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Bayar (Rp)</Text>
                <TextInput
                  testID="checkout-paid" value={paid} onChangeText={setPaid}
                  placeholder="0" keyboardType="numeric" placeholderTextColor={c.onSurfaceMuted}
                  style={[styles.input, { borderColor: c.border, color: c.onSurface }]}
                />
              </View>
            )}
          </View>

          <View style={[styles.totalsCard, { backgroundColor: c.surfaceSecondary }]}>
            <RowKV k="Subtotal" v={formatRp(subtotal)} />
            <RowKV k="Diskon" v={"- " + formatRp(parseFloat(discount) || 0)} />
            {tax > 0 && <RowKV k="Pajak" v={formatRp(tax)} />}
            <View style={[styles.divider, { backgroundColor: c.divider }]} />
            <RowKV k="Total" v={formatRp(total)} highlight />
            {payMethod === "Tunai" && <RowKV k="Kembalian" v={formatRp(change)} />}
          </View>
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {/* FIX BUG 1: disabled hanya saat busy/kosong, bukan saat nama kosong */}
          <Pressable
            testID="checkout-save-draft"
            disabled={draftDisabled}
            onPress={onSaveDraft}
            android_ripple={{ color: c.brandSoft }}
            style={[styles.modalCta, {
              flex: 1,
              backgroundColor: c.surfaceSecondary,
              borderWidth: 1.5,
              borderColor: c.brand,
              opacity: draftDisabled ? 0.6 : 1,
            }]}
          >
            {busy ? (
              <ActivityIndicator color={c.brand} size="small" />
            ) : (
              <Text style={[styles.modalCtaText, { color: c.brand }]}>
                {loadedDraftId ? "Update Draft" : "Simpan Draft"}
              </Text>
            )}
          </Pressable>
          <Pressable
            testID="checkout-pay-button"
            disabled={busy || cart.length === 0}
            onPress={onSubmit}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            style={[styles.modalCta, {
              flex: 1.4,
              backgroundColor: c.brand,
              opacity: busy || cart.length === 0 ? 0.6 : 1,
            }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalCtaText} numberOfLines={1}>
                Bayar • {formatRp(total)}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── RowKV ────────────────────────────────────────────────────────────────────
const RowKV = ({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) => {
  const c = COLORS.light;
  return (
    <View style={styles.kvRow}>
      <Text style={{ color: highlight ? c.onSurface : c.onSurfaceMuted, fontWeight: highlight ? "800" : "500" }}>{k}</Text>
      <Text style={{ color: highlight ? c.brand : c.onSurface, fontWeight: highlight ? "800" : "700", fontSize: highlight ? 18 : 14 }}>
        {v}
      </Text>
    </View>
  );
};

// ─── ReceiptView ──────────────────────────────────────────────────────────────
const ReceiptView = ({ data, onClose }: { data: any; onClose: () => void }) => {
  const c = COLORS.light;
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [hasPrintedOnce, setHasPrintedOnce] = useState(false);

  if (!data) return null;

  const onPrint = async () => {
    setPrinting(true);
    setPrintError(null);
    try {
      const def = await getDefaultPrinter();
      const paper: PaperSize = def?.paperSize ?? "58mm";
      const result = await printReceipt({
        storeName:     data.store,
        invoiceCode:   data.code,
        dateTime:      new Date(data.date).toLocaleString("id-ID"),
        cashierName:   data.cashier,
        customerName:  data.customer_name,
        paymentMethod: data.paymentMethod,
        lines: data.cart.map((l: CartLine) => ({
          productName: l.productName,
          qty:         l.qty,
          price:       l.price,
          toppings:    l.toppings.map((t) => ({
            productName: t.productName, qty: t.qty, price: t.price,
          })),
        })),
        subtotal: data.subtotal,
        discount: data.discount,
        tax:      data.tax,
        total:    data.total,
        paid:     data.paid,
        change:   data.change,
        footer:   "Terima kasih telah berkunjung. Semoga harimu menyenangkan",
      }, paper);

      if (result.ok) {
        toast.show("Struk dicetak", "success");
        setHasPrintedOnce(true);
        setPrintError(null);
      } else {
        const msg = result.error ?? "Gagal cetak";
        toast.show(msg, "error");
        setPrintError(msg);
      }
    } catch (e: any) {
      const msg = "Gagal cetak: " + (e?.message || "");
      toast.show(msg, "error");
      setPrintError(msg);
    } finally {
      setPrinting(false);
    }
  };

  const onRequestClose = () => {
    if (hasPrintedOnce) { onClose(); return; }
    Alert.alert(
      "Belum cetak struk?",
      "Struk belum berhasil dicetak. Tutup tanpa cetak?",
      [
        { text: "Cetak Dulu", style: "cancel" },
        { text: "Tutup", style: "destructive", onPress: onClose },
      ]
    );
  };

  return (
    <View style={styles.modalBg}>
      <View style={[styles.modalSheet, { backgroundColor: c.surface, maxHeight: "92%" }]}>
        <View style={styles.modalHandle} />
        <ScrollView>
          <View style={[styles.receiptInner, { backgroundColor: c.surfaceSecondary }]}>
            <Text style={[styles.rTitle, { color: c.onSurface }]}>{data.store}</Text>
            <Text style={[styles.rSub, { color: c.onSurfaceMuted }]}>{new Date(data.date).toLocaleString("id-ID")}</Text>
            <Text style={[styles.rSub, { color: c.onSurfaceMuted }]}>Kasir: {data.cashier}</Text>
            <Text style={[styles.rSub, { color: c.onSurfaceMuted }]}>No: {data.code}</Text>
            {data.customer_name ? <Text style={[styles.rSub, { color: c.onSurfaceMuted }]}>Pelanggan: {data.customer_name}</Text> : null}
            <View style={[styles.dashed, { borderColor: c.border }]} />
            {data.cart.map((l: CartLine, i: number) => (
              <View key={i} style={{ marginBottom: 6 }}>
                <View style={styles.rRow}>
                  <Text style={{ color: c.onSurface, flex: 1 }} numberOfLines={1}>{l.productName}</Text>
                  <Text style={{ color: c.onSurface }}>x{l.qty}</Text>
                  <Text style={{ color: c.onSurface, width: 80, textAlign: "right" }}>{formatRp(l.price * l.qty)}</Text>
                </View>
                {l.toppings.map((t) => (
                  <View key={t.productId} style={styles.rRow}>
                    <Text style={{ color: c.onSurfaceMuted, flex: 1, fontSize: 12 }}>+ {t.productName} x{t.qty}</Text>
                    <Text style={{ color: c.onSurfaceMuted, width: 80, textAlign: "right", fontSize: 12 }}>
                      {formatRp(t.price * t.qty * l.qty)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={[styles.dashed, { borderColor: c.border }]} />
            <RowKV k="Subtotal" v={formatRp(data.subtotal)} />
            {data.discount > 0 && <RowKV k="Diskon" v={"- " + formatRp(data.discount)} />}
            {data.tax > 0 && <RowKV k="Pajak" v={formatRp(data.tax)} />}
            <RowKV k="Total" v={formatRp(data.total)} highlight />
            <RowKV k={data.payment_method} v={formatRp(data.paid)} />
            {data.change > 0 && <RowKV k="Kembali" v={formatRp(data.change)} />}
            <View style={[styles.dashed, { borderColor: c.border }]} />
            <Text style={{ color: c.onSurfaceMuted, textAlign: "center", fontSize: 12, marginTop: 6 }}>
              Terima kasih telah berkunjung.{"\n"}Semoga harimu menyenangkan ☕
            </Text>
          </View>
        </ScrollView>

        {printError && (
          <View style={[styles.printErrorBanner, { borderColor: c.error, backgroundColor: c.error + "14" }]}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={c.error} />
            <Text style={{ color: c.error, fontSize: 12, flex: 1, fontWeight: "600" }}>{printError}</Text>
          </View>
        )}
        {hasPrintedOnce && !printError && (
          <View style={[styles.printOkBanner, { backgroundColor: c.success + "14" }]}>
            <MaterialCommunityIcons name="check-circle" size={18} color={c.success} />
            <Text style={{ color: c.success, fontSize: 12, flex: 1, fontWeight: "600" }}>Struk sudah dicetak</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 8, marginTop: SPACING.md }}>
          <Pressable testID="receipt-print" onPress={onPrint} disabled={printing}
            style={[styles.modalCta, { flex: 1, backgroundColor: c.accent, opacity: printing ? 0.6 : 1 }]}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          >
            {printing ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <MaterialCommunityIcons name="printer" size={18} color="#fff" />
                <Text style={styles.modalCtaText}>{hasPrintedOnce ? "Cetak Ulang" : "Cetak"}</Text>
              </View>
            )}
          </Pressable>
          <Pressable testID="receipt-close" onPress={onRequestClose}
            style={[styles.modalCta, { flex: 1.4, backgroundColor: c.brand }]}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          >
            <Text style={styles.modalCtaText}>Selesai</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBg: { position: "absolute", top: 0, left: 0, right: 0, height: 200 },
  header: {
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: 4,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  headerCartBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  headerCartBadge: {
    position: "absolute", top: 4, right: 4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  headerCartBadgeText: { fontSize: 9, fontWeight: "800", color: COLORS.light.brand },
  searchWrap: {
    marginHorizontal: SPACING.lg, marginTop: SPACING.md,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACING.md, height: 44,
    borderRadius: RADII.pill, gap: SPACING.sm, ...SHADOW.card,
  },
  searchInput: { flex: 1, fontSize: 14 },
  chips: { marginTop: SPACING.sm },
  chipsContent: { paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: 8 },
  chip: {
    height: 34, flexShrink: 0, paddingHorizontal: 14,
    borderRadius: RADII.pill, borderWidth: 1, alignItems: "center", justifyContent: "center",
  },
  chipText: { fontSize: 13 },
  gridContent: { padding: SPACING.lg, paddingBottom: 140, gap: SPACING.md },
  productCard: { flex: 1, borderRadius: RADII.md, padding: SPACING.md, ...SHADOW.card, overflow: "hidden" },
  qtyBadge: {
    position: "absolute", top: 8, left: 8,
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 5, zIndex: 2,
  },
  qtyBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  stockBadge: {
    position: "absolute", top: 8, right: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: "#FFEDD5", borderRadius: 6, zIndex: 2,
  },
  stockBadgeText: { fontSize: 10, color: "#B26A00", fontWeight: "700" },
  thumb: {
    width: "100%", height: 72, borderRadius: RADII.sm,
    alignItems: "center", justifyContent: "center",
    marginBottom: SPACING.sm, marginTop: SPACING.xs,
  },
  prodName: { fontSize: 13, fontWeight: "700", lineHeight: 18, minHeight: 36 },
  prodPrice: { fontSize: FONT.sizes.md, fontWeight: "800", marginTop: 2, marginBottom: SPACING.sm },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 4, borderRadius: RADII.sm, paddingVertical: 7, marginTop: 2,
  },
  addBtnText: { fontSize: 12, fontWeight: "700" },
  cartBar: {
    position: "absolute",
    left: SPACING.lg, right: SPACING.lg,
    height: 56, borderRadius: RADII.pill,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACING.lg, gap: SPACING.md, ...SHADOW.fab,
  },
  cartBubble: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  cartBubbleText: { color: "#fff", fontWeight: "800" },
  cartBarText: { color: "#fff", flex: 1, fontWeight: "700" },
  cartBarTotal: { color: "#fff", fontWeight: "800", fontSize: 15 },
  emptyList: { paddingVertical: 60, alignItems: "center" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg },
  modalHandle: {
    alignSelf: "center", width: 44, height: 4, borderRadius: 2,
    backgroundColor: "#D0CCC6", marginBottom: SPACING.md,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 18, fontWeight: "800" },
  modalSub: { fontSize: 12, marginTop: 2 },
  topRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: SPACING.md },
  qtyBlock: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, borderTopWidth: 1, marginTop: 8,
  },
  modalCta: {
    height: 54, borderRadius: RADII.md, alignItems: "center", justifyContent: "center",
    overflow: "hidden", ...SHADOW.fab,
  },
  modalCtaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  stepperValue: { minWidth: 22, textAlign: "center", fontWeight: "800" },
  cartItem: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, gap: SPACING.md },
  section: {
    fontSize: 11, fontWeight: "700", textTransform: "uppercase",
    marginTop: SPACING.md, marginBottom: 6, letterSpacing: 0.4,
  },
  input: { borderWidth: 1, borderRadius: RADII.md, paddingHorizontal: SPACING.md, height: 44, fontSize: 14 },
  payRow: { flexDirection: "row", gap: 8 },
  payBtn: { flex: 1, borderWidth: 1, borderRadius: RADII.md, paddingVertical: 12, alignItems: "center" },
  totalsCard: { borderRadius: RADII.md, padding: SPACING.md, marginTop: SPACING.lg, gap: 6, ...SHADOW.card },
  kvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  divider: { height: 1, marginVertical: 6 },
  receiptInner: { padding: SPACING.lg, borderRadius: RADII.md, ...SHADOW.card },
  rTitle: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  rSub: { fontSize: 12, textAlign: "center" },
  dashed: { borderTopWidth: 1, borderStyle: "dashed", marginVertical: 8 },
  rRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  printErrorBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    borderWidth: 1, borderRadius: RADII.md, padding: 10, marginTop: SPACING.md,
  },
  printOkBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: RADII.md, padding: 10, marginTop: SPACING.md,
  },
});