import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Linking,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, RADII, SHADOW, SPACING } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import {
  BTDevice,
  clearDefaultPrinter,
  connectPrinter,
  disconnectPrinter,
  getConnectedDeviceId,
  getDefaultPrinter,
  isBluetoothAvailable,
  listBondedDevices,
  PaperSize,
  pairDevice,
  requestBluetoothEnable,
  SavedPrinter,
  saveDefaultPrinter,
  scanForDevices,
  testPrint,
} from "@/src/services/bluetoothPrinter";
import { useToast } from "@/src/components/Toast";

const PAPER_SIZES: PaperSize[] = ["58mm", "80mm"];

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const perms: any[] = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];
    if (Platform.Version >= 31) {
      perms.push(
        "android.permission.BLUETOOTH_SCAN" as any,
        "android.permission.BLUETOOTH_CONNECT" as any
      );
    }
    const res = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

export default function Printer() {
  const c = COLORS.light;
  const toast = useToast();
  const [available, setAvailable] = useState<{ available: boolean; reason?: string }>({ available: false });
  const [bonded, setBonded] = useState<BTDevice[]>([]);
  const [discovered, setDiscovered] = useState<BTDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [defaultPrinter, setDefaultPrinter] = useState<SavedPrinter | null>(null);
  const [paper, setPaper] = useState<PaperSize>("58mm");
  const [permGranted, setPermGranted] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const a = await isBluetoothAvailable();
    setAvailable(a);
    setConnectedId(getConnectedDeviceId());
    const def = await getDefaultPrinter();
    setDefaultPrinter(def);
    if (def) setPaper(def.paperSize);
    if (a.available) {
      const list = await listBondedDevices();
      setBonded(list);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    (async () => {
      const ok = await requestPermissions();
      setPermGranted(ok);
      refresh();
    })();
  }, [refresh]);

  const onEnableBT = async () => {
    const ok = await requestBluetoothEnable();
    if (ok) {
      toast.show("Bluetooth diaktifkan", "success");
      refresh();
    } else {
      toast.show("Bluetooth tidak dapat diaktifkan", "error");
    }
  };

  const onScan = async () => {
    if (!permGranted) {
      const ok = await requestPermissions();
      setPermGranted(ok);
      if (!ok) {
        toast.show("Izin Bluetooth ditolak. Buka pengaturan.", "error");
        Linking.openSettings();
        return;
      }
    }
    setScanning(true);
    setDiscovered([]);
    try {
      const list = await scanForDevices();
      setDiscovered(list);
      toast.show(`${list.length} perangkat ditemukan`, list.length ? "success" : "info");
    } catch (e: any) {
      toast.show("Gagal scan: " + (e?.message || ""), "error");
    } finally {
      setScanning(false);
    }
  };

  const onPair = async (d: BTDevice) => {
    setBusy(true);
    const ok = await pairDevice(d.id);
    setBusy(false);
    if (ok) {
      toast.show("Pairing berhasil", "success");
      refresh();
    } else {
      toast.show("Pairing gagal. Coba dari pengaturan Bluetooth HP.", "error");
    }
  };

  const onConnect = async (d: BTDevice) => {
    setConnectingId(d.id);
    const r = await connectPrinter(d.id);
    setConnectingId(null);
    if (r.ok) {
      setConnectedId(d.id);
      toast.show(`Terhubung ke ${d.name}`, "success");
    } else {
      toast.show(r.error ?? "Gagal terhubung", "error");
    }
  };

  const onDisconnect = async () => {
    await disconnectPrinter();
    setConnectedId(null);
    toast.show("Diputuskan", "info");
  };

  const onSaveDefault = async (d: BTDevice) => {
    await saveDefaultPrinter({ id: d.id, name: d.name, paperSize: paper });
    toast.show("Disimpan sebagai printer default", "success");
    refresh();
  };

  const onClearDefault = async () => {
    await clearDefaultPrinter();
    setDefaultPrinter(null);
    toast.show("Default dihapus", "info");
  };

  const onTestPrint = async () => {
    setBusy(true);
    const r = await testPrint(paper);
    setBusy(false);
    if (r.ok) toast.show("Tes cetak terkirim", "success");
    else toast.show(r.error ?? "Gagal cetak", "error");
  };

  const allDevices = [
    ...bonded,
    ...discovered.filter((d) => !bonded.find((b) => b.id === d.id)),
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader title="Printer Bluetooth" subtitle="Thermal 58mm / 80mm" showBack testID="printer-header" />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 120 }}>
        {/* Status card */}
        <View
          style={[
            styles.statusCard,
            { backgroundColor: available.available ? c.brand : c.warning },
          ]}
          testID="printer-status"
        >
          <MaterialCommunityIcons
            name={available.available ? "bluetooth" : "bluetooth-off"}
            size={28}
            color="#fff"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusText}>
              {available.available
                ? connectedId
                  ? "Terhubung"
                  : "Bluetooth Aktif"
                : "Bluetooth Tidak Tersedia"}
            </Text>
            {!available.available && available.reason ? (
              <Text style={styles.statusSub}>{available.reason}</Text>
            ) : connectedId ? (
              <Text style={styles.statusSub}>
                {allDevices.find((d) => d.id === connectedId)?.name ?? connectedId}
              </Text>
            ) : (
              <Text style={styles.statusSub}>Scan & pairing printer untuk mulai cetak</Text>
            )}
          </View>
          {!available.available && (
            <Pressable
              testID="enable-bt"
              onPress={onEnableBT}
              android_ripple={{ color: "rgba(255,255,255,0.18)" }}
              style={styles.smallBtn}
            >
              <Text style={styles.smallBtnText}>Aktifkan</Text>
            </Pressable>
          )}
        </View>

        {/* Paper size */}
        <Text style={[styles.section, { color: c.onSurfaceMuted }]}>Ukuran Kertas</Text>
        <View style={styles.paperRow}>
          {PAPER_SIZES.map((p) => (
            <Pressable
              key={p}
              testID={`paper-${p}`}
              onPress={() => setPaper(p)}
              android_ripple={{ color: c.brandSoft }}
              style={[
                styles.paperBtn,
                {
                  backgroundColor: paper === p ? c.brand : c.surfaceSecondary,
                  borderColor: paper === p ? c.brand : c.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="printer"
                size={24}
                color={paper === p ? "#fff" : c.onSurface}
              />
              <Text
                style={{
                  color: paper === p ? "#fff" : c.onSurface,
                  fontWeight: "800",
                  marginTop: 4,
                }}
              >
                {p}
              </Text>
              <Text
                style={{
                  color: paper === p ? "rgba(255,255,255,0.85)" : c.onSurfaceMuted,
                  fontSize: 10,
                  marginTop: 2,
                }}
              >
                {p === "58mm" ? "32 kolom" : "48 kolom"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Default printer card */}
        {defaultPrinter ? (
          <View style={[styles.defaultCard, { backgroundColor: c.brandSoft }]} testID="default-printer">
            <MaterialCommunityIcons name="star" size={20} color={c.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.brand, fontWeight: "800" }}>{defaultPrinter.name}</Text>
              <Text style={{ color: c.brand, fontSize: 11 }}>
                Default • {defaultPrinter.paperSize} • {defaultPrinter.id}
              </Text>
            </View>
            <Pressable testID="clear-default" onPress={onClearDefault} hitSlop={6}>
              <MaterialCommunityIcons name="close-circle" size={20} color={c.brand} />
            </Pressable>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            testID="scan-btn"
            onPress={onScan}
            disabled={scanning || !available.available}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            style={[
              styles.actionBtn,
              {
                backgroundColor: c.brand,
                opacity: scanning || !available.available ? 0.6 : 1,
              },
            ]}
          >
            {scanning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="bluetooth-search" size={20} color="#fff" />
                <Text style={styles.actionText}>Scan</Text>
              </>
            )}
          </Pressable>
          <Pressable
            testID="test-print-btn"
            onPress={onTestPrint}
            disabled={busy || !connectedId}
            android_ripple={{ color: "rgba(255,255,255,0.18)" }}
            style={[
              styles.actionBtn,
              {
                backgroundColor: c.accent,
                opacity: busy || !connectedId ? 0.6 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="printer-check" size={20} color="#fff" />
                <Text style={styles.actionText}>Tes Cetak</Text>
              </>
            )}
          </Pressable>
        </View>

        {connectedId && (
          <Pressable
            testID="disconnect-btn"
            onPress={onDisconnect}
            android_ripple={{ color: "#FFB4AB55" }}
            style={[styles.disconnectBtn, { borderColor: c.error }]}
          >
            <MaterialCommunityIcons name="bluetooth-off" size={18} color={c.error} />
            <Text style={{ color: c.error, fontWeight: "800" }}>Putuskan Koneksi</Text>
          </Pressable>
        )}

        {/* Devices list */}
        <Text style={[styles.section, { color: c.onSurfaceMuted }]}>
          Perangkat ({allDevices.length})
        </Text>
        {allDevices.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <MaterialCommunityIcons name="bluetooth-settings" size={42} color={c.onSurfaceMuted} />
            <Text style={{ color: c.onSurfaceMuted, marginTop: 8, fontSize: 13 }}>
              Belum ada perangkat. Tekan Scan untuk mulai mencari.
            </Text>
          </View>
        ) : (
          allDevices.map((d) => {
            const isConnected = connectedId === d.id;
            const isDefault = defaultPrinter?.id === d.id;
            return (
              <View
                key={d.id}
                style={[
                  styles.devRow,
                  {
                    backgroundColor: c.surfaceSecondary,
                    borderColor: isConnected ? c.brand : c.border,
                    borderWidth: isConnected ? 1.5 : 1,
                  },
                ]}
                testID={`dev-${d.id}`}
              >
                <View style={[styles.devIcon, { backgroundColor: c.brandSoft }]}>
                  <MaterialCommunityIcons
                    name={isConnected ? "bluetooth-connect" : "bluetooth"}
                    size={20}
                    color={c.brand}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: c.onSurface, fontWeight: "800" }} numberOfLines={1}>
                      {d.name}
                    </Text>
                    {isDefault && (
                      <View style={[styles.badge, { backgroundColor: c.accent }]}>
                        <Text style={styles.badgeText}>DEFAULT</Text>
                      </View>
                    )}
                    {d.bonded && (
                      <View style={[styles.badge, { backgroundColor: c.success }]}>
                        <Text style={styles.badgeText}>PAIRED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: c.onSurfaceMuted, fontSize: 11, marginTop: 2 }}>{d.id}</Text>
                </View>
                <View style={{ gap: 6, alignItems: "flex-end" }}>
                  {!d.bonded && (
                    <Pressable
                      testID={`pair-${d.id}`}
                      onPress={() => onPair(d)}
                      style={[styles.miniBtn, { backgroundColor: c.info }]}
                    >
                      <Text style={styles.miniBtnText}>Pair</Text>
                    </Pressable>
                  )}
                  {isConnected ? (
                    <Pressable
                      testID={`connect-${d.id}`}
                      onPress={onDisconnect}
                      style={[styles.miniBtn, { backgroundColor: c.error }]}
                    >
                      <Text style={styles.miniBtnText}>Putus</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      testID={`connect-${d.id}`}
                      onPress={() => onConnect(d)}
                      disabled={connectingId === d.id}
                      style={[styles.miniBtn, { backgroundColor: c.brand, opacity: connectingId === d.id ? 0.5 : 1 }]}
                    >
                      {connectingId === d.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.miniBtnText}>Hubungkan</Text>
                      )}
                    </Pressable>
                  )}
                  {!isDefault && (
                    <Pressable
                      testID={`default-${d.id}`}
                      onPress={() => onSaveDefault(d)}
                      hitSlop={4}
                    >
                      <Text style={{ color: c.brand, fontSize: 11, fontWeight: "700" }}>
                        Jadikan Default
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}

        {/* Info note */}
        <View style={[styles.note, { backgroundColor: c.surfaceSecondary }]}>
          <MaterialCommunityIcons name="information" size={18} color={c.info} />
          <Text style={[styles.noteText, { color: c.onSurfaceMuted }]}>
            Fitur Bluetooth memerlukan build APK custom. Pada Expo Go, modul native Bluetooth Classic tidak tersedia. Untuk mengaktifkan: tekan tombol <Text style={{ fontWeight: "800" }}>Publish</Text> di panel Emergent untuk generate APK Android. Setelah terpasang, fitur scan/pair/print akan berfungsi penuh dengan printer thermal ESC/POS standar.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    ...SHADOW.fab,
  },
  statusText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  statusSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 2 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)" },
  smallBtnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  section: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: SPACING.lg, marginBottom: SPACING.sm },
  paperRow: { flexDirection: "row", gap: SPACING.md },
  paperBtn: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    alignItems: "center",
    ...SHADOW.card,
  },
  defaultCard: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADII.md, marginTop: SPACING.md },
  actionsRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.md },
  actionBtn: { flex: 1, height: 50, borderRadius: RADII.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, ...SHADOW.card },
  actionText: { color: "#fff", fontWeight: "800" },
  disconnectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: SPACING.sm, padding: 12, borderRadius: RADII.md, borderWidth: 1.5 },
  devRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADII.md, marginBottom: SPACING.sm },
  devIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  badgeText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, minWidth: 80, alignItems: "center" },
  miniBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  note: { flexDirection: "row", gap: 8, padding: 12, borderRadius: RADII.md, marginTop: SPACING.lg, alignItems: "flex-start" },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
