/**
 * Cemara Kopi POS - Printer Management Screen
 *
 * Screen untuk manage Bluetooth thermal printer (58mm/80mm)
 * dengan full device discovery, pairing, connection, dan test print functionality.
 *
 * @version 2.1.0
 */

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
  RefreshControl,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { COLORS, RADII, SHADOW, SPACING } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import {
  BluetoothPrinter,
  BTDevice,
  PaperSize,
  SavedPrinter,
} from "@/src/services/bluetoothPrinter";
import { useToast } from "@/src/components/Toast";

// ============================================================================
// TYPES
// ============================================================================

type OperationState =
  | "idle"
  | "scanning"
  | "pairing"
  | "connecting"
  | "testing"
  | "loading";

interface DeviceActionState {
  deviceId: string | null;
  operation: OperationState;
}

// FIX #1: reason tidak boleh undefined di state — pakai string selalu
interface AvailabilityState {
  available: boolean;
  reason: string; // bukan optional, selalu string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAPER_SIZES: PaperSize[] = ["58mm", "80mm"];
const PAPER_LABELS: Record<PaperSize, { columns: number; info: string }> = {
  "58mm": { columns: 32, info: "32 kolom" },
  "80mm": { columns: 48, info: "48 kolom" },
};

const MAX_DEVICES = 50;

// ============================================================================
// PERMISSION HANDLER
// ============================================================================

async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  try {
    const permissions: string[] = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];

    if (Platform.Version >= 31) {
      permissions.push(
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_CONNECT"
      );
    }

    const results = await PermissionsAndroid.requestMultiple(
      permissions as any[]
    );

    return Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (error) {
    console.error("[Permissions] error:", error);
    return false;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PrinterScreen() {
  const c = COLORS.light;
  const toast = useToast();

  // FIX #1: AvailabilityState — reason selalu string, tidak undefined
  const [availabilityCheck, setAvailabilityCheck] = useState<AvailabilityState>({
    available: false,
    reason: "",
  });

  const [bondedDevices, setBondedDevices] = useState<BTDevice[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<BTDevice[]>([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [defaultPrinter, setDefaultPrinter] = useState<SavedPrinter | null>(null);
  const [selectedPaperSize, setSelectedPaperSize] = useState<PaperSize>("58mm");
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [deviceActionState, setDeviceActionState] = useState<DeviceActionState>({
    deviceId: null,
    operation: "idle",
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ============================================================================
  // REFRESH LOGIC
  // ============================================================================

  const refreshState = useCallback(async () => {
    try {
      const availability = await BluetoothPrinter.isAvailable();

      // FIX #1: normalisasi reason dari undefined → string kosong
      const normalizedAvailability: AvailabilityState = {
        available: availability.available,
        reason: availability.reason ?? "",
      };
      setAvailabilityCheck(normalizedAvailability);

      if (availability.available) {
        const bonded = await BluetoothPrinter.listBondedDevices();
        setBondedDevices(bonded);

        const connectedId = BluetoothPrinter.getConnectedDeviceId();
        setConnectedDeviceId(connectedId);
      }

      const savedDefault = await BluetoothPrinter.getDefault();
      setDefaultPrinter(savedDefault);
      if (savedDefault) {
        setSelectedPaperSize(savedDefault.paperSize);
      }
    } catch (error) {
      console.error("[PrinterScreen] refreshState error:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshState();
    }, [refreshState])
  );

  useEffect(() => {
    const init = async () => {
      const permsOk = await requestBluetoothPermissions();
      setPermissionsGranted(permsOk);
      await refreshState();
    };
    init();
  }, [refreshState]);

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleEnableBluetooth = async () => {
    setDeviceActionState({ deviceId: null, operation: "loading" });
    try {
      const success = await BluetoothPrinter.requestEnable();
      if (success) {
        toast.show("Bluetooth diaktifkan", "success");
        await refreshState();
      } else {
        toast.show("Bluetooth tidak dapat diaktifkan", "error");
      }
    } catch {
      toast.show("Gagal mengaktifkan Bluetooth", "error");
    } finally {
      setDeviceActionState({ deviceId: null, operation: "idle" });
    }
  };

  const handleScanDevices = async () => {
    if (!permissionsGranted) {
      const permsOk = await requestBluetoothPermissions();
      setPermissionsGranted(permsOk);
      if (!permsOk) {
        toast.show("Izin Bluetooth ditolak. Buka pengaturan.", "error");
        Linking.openSettings();
        return;
      }
    }

    setDeviceActionState({ deviceId: null, operation: "scanning" });
    setDiscoveredDevices([]);

    try {
      const devices = await BluetoothPrinter.scanForDevices(12);
      if (!devices || devices.length === 0) {
        toast.show("Tidak ada perangkat Bluetooth ditemukan", "info");
      } else {
        setDiscoveredDevices(devices);
        toast.show(`Ditemukan ${devices.length} perangkat`, "success");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Scan gagal";
      toast.show(`Gagal scan: ${msg}`, "error");
    } finally {
      setDeviceActionState({ deviceId: null, operation: "idle" });
    }
  };

  const handlePairDevice = async (device: BTDevice) => {
    if (device.bonded) {
      toast.show(`${device.name} sudah terpair`, "info");
      return;
    }
    setDeviceActionState({ deviceId: device.id, operation: "pairing" });
    try {
      const success = await BluetoothPrinter.pairDevice(device.id);
      if (success) {
        toast.show(`Pairing berhasil: ${device.name}`, "success");
        await refreshState();
      } else {
        toast.show("Pairing gagal. Coba dari Pengaturan → Bluetooth HP.", "error");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Pairing error";
      toast.show(`Pairing gagal: ${msg}`, "error");
    } finally {
      setDeviceActionState({ deviceId: null, operation: "idle" });
    }
  };

  const handleConnectDevice = async (device: BTDevice) => {
    setDeviceActionState({ deviceId: device.id, operation: "connecting" });
    try {
      const result = await BluetoothPrinter.connect(device.id);
      if (result.ok) {
        setConnectedDeviceId(device.id);
        toast.show(`Terhubung ke ${device.name}`, "success");
      } else {
        toast.show(result.error ?? "Gagal terhubung ke printer", "error");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Koneksi error";
      toast.show(`Koneksi gagal: ${msg}`, "error");
    } finally {
      setDeviceActionState({ deviceId: null, operation: "idle" });
    }
  };

  const handleDisconnectDevice = async () => {
    try {
      await BluetoothPrinter.disconnect();
      setConnectedDeviceId(null);
      toast.show("Printer diputuskan", "info");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Disconnect error";
      toast.show(`Gagal putus: ${msg}`, "error");
    }
  };

  const handleSaveAsDefault = async (device: BTDevice) => {
    try {
      await BluetoothPrinter.saveDefault({
        id: device.id,
        name: device.name,
        paperSize: selectedPaperSize,
      });
      setDefaultPrinter({ id: device.id, name: device.name, paperSize: selectedPaperSize });
      toast.show(`${device.name} disimpan sebagai default`, "success");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Save error";
      toast.show(`Gagal simpan: ${msg}`, "error");
    }
  };

  const handleClearDefault = async () => {
    try {
      await BluetoothPrinter.clearDefault();
      setDefaultPrinter(null);
      toast.show("Default printer dihapus", "info");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Clear error";
      toast.show(`Gagal hapus: ${msg}`, "error");
    }
  };

  const handleTestPrint = async () => {
    if (!connectedDeviceId) {
      toast.show("Hubungkan printer terlebih dahulu", "info");
      return;
    }
    setDeviceActionState({ deviceId: null, operation: "testing" });
    try {
      const result = await BluetoothPrinter.testPrint(selectedPaperSize);
      if (result.ok) {
        toast.show("Tes cetak terkirim ke printer", "success");
      } else {
        toast.show(result.error ?? "Tes cetak gagal", "error");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Test print error";
      toast.show(`Tes cetak gagal: ${msg}`, "error");
    } finally {
      setDeviceActionState({ deviceId: null, operation: "idle" });
    }
  };

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  const allDevices = React.useMemo(() => {
    const merged = [
      ...bondedDevices,
      ...discoveredDevices.filter(
        (d) => !bondedDevices.find((b) => b.id === d.id)
      ),
    ];
    return merged.slice(0, MAX_DEVICES);
  }, [bondedDevices, discoveredDevices]);

  const isLoading =
    deviceActionState.operation === "loading" ||
    deviceActionState.operation === "scanning";
  const isOperating = deviceActionState.operation !== "idle";

  // ============================================================================
  // RENDER METHODS
  // ============================================================================

  const renderStatusCard = () => (
    <View
      style={[
        styles.statusCard,
        { backgroundColor: availabilityCheck.available ? c.brand : c.error },
      ]}
      testID="bluetooth-status-card"
    >
      <MaterialCommunityIcons
        name={availabilityCheck.available ? "bluetooth" : "bluetooth-off"}
        size={28}
        color="#fff"
      />

      <View style={{ flex: 1 }}>
        <Text style={styles.statusText}>
          {availabilityCheck.available
            ? connectedDeviceId
              ? "Terhubung"
              : "Bluetooth Aktif"
            : "Bluetooth Tidak Tersedia"}
        </Text>
        <Text style={styles.statusSubtext}>
          {!availabilityCheck.available && availabilityCheck.reason
            ? availabilityCheck.reason
            : connectedDeviceId
            ? allDevices.find((d) => d.id === connectedDeviceId)?.name ??
              connectedDeviceId
            : "Scan & pair printer untuk mulai cetak"}
        </Text>
      </View>

      {!availabilityCheck.available && (
        <Pressable
          testID="enable-bluetooth-btn"
          onPress={handleEnableBluetooth}
          disabled={isLoading}
          android_ripple={{ color: "rgba(255,255,255,0.18)" }}
          style={styles.statusActionBtn}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.statusActionText}>Aktifkan</Text>
          )}
        </Pressable>
      )}
    </View>
  );

  const renderPaperSizeSelector = () => (
    <View>
      <Text style={[styles.sectionTitle, { color: c.onSurfaceMuted }]}>
        Ukuran Kertas
      </Text>
      <View style={styles.paperSizeRow}>
        {PAPER_SIZES.map((size) => {
          const isSelected = selectedPaperSize === size;
          return (
            <Pressable
              key={size}
              testID={`paper-size-${size}`}
              onPress={() => setSelectedPaperSize(size)}
              android_ripple={{ color: c.brandSoft }}
              style={[
                styles.paperSizeBtn,
                {
                  backgroundColor: isSelected ? c.brand : c.surfaceSecondary,
                  borderColor: isSelected ? c.brand : c.border,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="printer"
                size={24}
                color={isSelected ? "#fff" : c.onSurface}
              />
              <Text
                style={[
                  styles.paperSizeBtnText,
                  { color: isSelected ? "#fff" : c.onSurface },
                ]}
              >
                {size}
              </Text>
              <Text
                style={{
                  color: isSelected ? "rgba(255,255,255,0.85)" : c.onSurfaceMuted,
                  fontSize: 10,
                  marginTop: 2,
                }}
              >
                {PAPER_LABELS[size].info}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderDefaultPrinterCard = () => {
    if (!defaultPrinter) return null;
    return (
      <View
        style={[styles.defaultPrinterCard, { backgroundColor: c.brandSoft }]}
        testID="default-printer-badge"
      >
        <MaterialCommunityIcons name="star" size={20} color={c.brand} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.brand, fontWeight: "800", fontSize: 14 }}>
            {defaultPrinter.name}
          </Text>
          <Text style={{ color: c.brand, fontSize: 11, marginTop: 2 }}>
            Default • {defaultPrinter.paperSize}
          </Text>
        </View>
        <Pressable
          testID="clear-default-btn"
          onPress={handleClearDefault}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="close-circle" size={22} color={c.brand} />
        </Pressable>
      </View>
    );
  };

  const renderActionButtons = () => (
    <View style={styles.actionButtonsRow}>
      {/* Scan Button */}
      <Pressable
        testID="scan-devices-btn"
        onPress={handleScanDevices}
        disabled={!availabilityCheck.available || isOperating}
        android_ripple={{ color: "rgba(255,255,255,0.18)" }}
        style={[
          styles.actionBtn,
          {
            backgroundColor: c.brand,
            opacity: !availabilityCheck.available || isOperating ? 0.6 : 1,
          },
        ]}
      >
        {deviceActionState.operation === "scanning" ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            {/* FIX #2: ganti "bluetooth-search" → "bluetooth-audio" yang valid */}
            <MaterialCommunityIcons
              name="bluetooth-audio"
              size={18}
              color="#fff"
            />
            <Text style={styles.actionBtnText}>Scan</Text>
          </>
        )}
      </Pressable>

      {/* Test Print Button */}
      <Pressable
        testID="test-print-btn"
        onPress={handleTestPrint}
        disabled={!connectedDeviceId || isOperating}
        android_ripple={{ color: "rgba(255,255,255,0.18)" }}
        style={[
          styles.actionBtn,
          {
            backgroundColor: c.accent,
            opacity: !connectedDeviceId || isOperating ? 0.6 : 1,
          },
        ]}
      >
        {deviceActionState.operation === "testing" ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="printer-check" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Tes Cetak</Text>
          </>
        )}
      </Pressable>
    </View>
  );

  const renderDisconnectButton = () => {
    if (!connectedDeviceId) return null;
    return (
      <Pressable
        testID="disconnect-btn"
        onPress={handleDisconnectDevice}
        android_ripple={{ color: "#FFB4AB55" }}
        style={[styles.disconnectBtn, { borderColor: c.error }]}
      >
        <MaterialCommunityIcons name="bluetooth-off" size={18} color={c.error} />
        <Text style={{ color: c.error, fontWeight: "800", fontSize: 13 }}>
          Putuskan Koneksi
        </Text>
      </Pressable>
    );
  };

  const renderDevicesList = () => (
    <View>
      <Text style={[styles.sectionTitle, { color: c.onSurfaceMuted }]}>
        Perangkat ({allDevices.length})
      </Text>

      {allDevices.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="bluetooth-settings"
            size={48}
            color={c.onSurfaceMuted}
          />
          <Text style={[styles.emptyStateText, { color: c.onSurfaceMuted }]}>
            Belum ada perangkat terdeteksi
          </Text>
          <Text style={[styles.emptyStateSubtext, { color: c.onSurfaceMuted }]}>
            Tekan "Scan" untuk mencari printer Bluetooth
          </Text>
        </View>
      ) : (
        allDevices.map((device) => {
          const isConnected = connectedDeviceId === device.id;
          const isDefault = defaultPrinter?.id === device.id;
          const isOperatingThisDevice =
            deviceActionState.deviceId === device.id && isOperating;

          return (
            <View
              key={device.id}
              style={[
                styles.deviceRow,
                {
                  backgroundColor: c.surfaceSecondary,
                  borderColor: isConnected ? c.brand : c.border,
                  borderWidth: isConnected ? 2 : 1,
                },
              ]}
              testID={`device-item-${device.id}`}
            >
              {/* Icon */}
              <View style={[styles.deviceIcon, { backgroundColor: c.brandSoft }]}>
                <MaterialCommunityIcons
                  name={isConnected ? "bluetooth-connect" : "bluetooth"}
                  size={20}
                  color={c.brand}
                />
              </View>

              {/* Info */}
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                    flexWrap: "wrap",
                  }}
                >
                  <Text
                    style={[styles.deviceName, { color: c.onSurface }]}
                    numberOfLines={1}
                  >
                    {device.name}
                  </Text>
                  {isDefault && (
                    <View style={[styles.badge, { backgroundColor: c.accent }]}>
                      <Text style={styles.badgeText}>★ DEFAULT</Text>
                    </View>
                  )}
                  {device.bonded && (
                    <View style={[styles.badge, { backgroundColor: c.success }]}>
                      <Text style={styles.badgeText}>✓ PAIRED</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    color: c.onSurfaceMuted,
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  numberOfLines={1}
                >
                  {device.id}
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.deviceActionsColumn}>
                {!device.bonded && (
                  <Pressable
                    testID={`pair-btn-${device.id}`}
                    onPress={() => handlePairDevice(device)}
                    disabled={isOperatingThisDevice}
                    style={[
                      styles.deviceActionBtn,
                      {
                        backgroundColor: c.info,
                        opacity: isOperatingThisDevice ? 0.5 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.deviceActionBtnText}>Pair</Text>
                  </Pressable>
                )}

                {isConnected ? (
                  <Pressable
                    testID={`disconnect-device-btn-${device.id}`}
                    onPress={handleDisconnectDevice}
                    style={[styles.deviceActionBtn, { backgroundColor: c.error }]}
                  >
                    <Text style={styles.deviceActionBtnText}>Putus</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID={`connect-btn-${device.id}`}
                    onPress={() => handleConnectDevice(device)}
                    disabled={isOperatingThisDevice}
                    style={[
                      styles.deviceActionBtn,
                      {
                        backgroundColor: c.brand,
                        opacity: isOperatingThisDevice ? 0.5 : 1,
                      },
                    ]}
                  >
                    {isOperatingThisDevice &&
                    deviceActionState.operation === "connecting" ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.deviceActionBtnText}>Hubungkan</Text>
                    )}
                  </Pressable>
                )}

                {!isDefault && (
                  <Pressable
                    testID={`set-default-btn-${device.id}`}
                    onPress={() => handleSaveAsDefault(device)}
                    hitSlop={6}
                  >
                    <Text style={styles.setDefaultText}>Jadikan Default</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  const renderInfoNote = () => (
    <View
      style={[styles.infoNote, { backgroundColor: c.surfaceSecondary }]}
      testID="info-note"
    >
      <MaterialCommunityIcons name="information" size={18} color={c.info} />
      <Text style={[styles.infoNoteText, { color: c.onSurfaceMuted }]}>
        Fitur Bluetooth memerlukan{" "}
        <Text style={{ fontWeight: "700", color: c.info }}>
          build APK custom via EAS
        </Text>
        . Jalankan{" "}
        <Text style={{ fontWeight: "800" }}>
          eas build -p android --profile preview
        </Text>{" "}
        dari folder frontend, lalu install APK yang dihasilkan.
      </Text>
    </View>
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <View style={[styles.container, { backgroundColor: c.surface }]}>
      <ScreenHeader
        title="Printer Bluetooth"
        subtitle="Thermal 58mm / 80mm"
        showBack
        testID="printer-screen-header"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              refreshState().finally(() => setIsRefreshing(false));
            }}
            tintColor={c.brand}
          />
        }
      >
        {renderStatusCard()}
        {renderPaperSizeSelector()}
        {renderDefaultPrinterCard()}
        {renderActionButtons()}
        {renderDisconnectButton()}
        {renderDevicesList()}
        {renderInfoNote()}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 120 },

  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.lg,
    ...SHADOW.fab,
  },
  statusText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  statusSubtext: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  statusActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  statusActionText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },

  paperSizeRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  paperSizeBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADII.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.card,
  },
  paperSizeBtnText: { fontWeight: "800", fontSize: 14, marginTop: 6 },

  defaultPrinterCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.lg,
    ...SHADOW.card,
  },

  actionButtonsRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  actionBtn: {
    flex: 1,
    height: 50,
    borderRadius: RADII.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...SHADOW.card,
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  disconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: SPACING.md,
    paddingVertical: 12,
    borderRadius: RADII.md,
    borderWidth: 1.5,
  },

  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyStateText: { fontSize: 14, fontWeight: "600", marginTop: 12 },
  emptyStateSubtext: { fontSize: 12, marginTop: 6, textAlign: "center" },

  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADII.md,
    marginBottom: SPACING.sm,
    ...SHADOW.card,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  deviceName: { fontWeight: "800", fontSize: 14 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  deviceActionsColumn: { gap: 6, alignItems: "flex-end" },
  deviceActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    minWidth: 76,
    alignItems: "center",
  },
  deviceActionBtnText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  setDefaultText: {
    color: COLORS.light.brand,
    fontSize: 10,
    fontWeight: "700",
  },

  infoNote: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: RADII.md,
    marginTop: SPACING.lg,
    alignItems: "flex-start",
  },
  infoNoteText: { flex: 1, fontSize: 12, lineHeight: 18 },
});