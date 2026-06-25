/**
 * Bluetooth Thermal Printer Service
 * ----------------------------------
 * Production-ready ESC/POS implementation for 58mm (384 dots, 32 cols) and 80mm
 * (576 dots, 48 cols) Bluetooth thermal printers.
 *
 * NATIVE MODULE: This service uses `react-native-bluetooth-classic` at runtime
 * via dynamic require. The package is loaded lazily so the JS bundle still
 * compiles inside Expo Go (which lacks native modules). To enable real printing:
 *
 *   1. From the project root run:
 *        yarn add react-native-bluetooth-classic
 *   2. From the Emergent panel press Publish to create a custom Android build
 *      (Expo Go cannot load custom native modules — a dev/production build is
 *      required for Bluetooth Classic SPP support).
 *   3. The runtime `isAvailable()` check below will then return `true` and
 *      scanning / connecting / printing will work against any ESC/POS-capable
 *      Bluetooth thermal printer (RPP02N, Xprinter XP-58/80, Eppos EP58/80, etc.).
 *
 * On Expo Go (no native module), every method returns a clear "Bluetooth tidak
 * tersedia di Expo Go" error so the UI can guide the user gracefully.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// -------- ESC/POS COMMAND CONSTANTS --------
const ESC = "\x1B";
const GS = "\x1D";
const LF = "\x0A";

export const ESC_POS = {
  INIT: ESC + "@",
  RESET: ESC + "@",
  ALIGN_LEFT: ESC + "a" + "\x00",
  ALIGN_CENTER: ESC + "a" + "\x01",
  ALIGN_RIGHT: ESC + "a" + "\x02",
  BOLD_ON: ESC + "E" + "\x01",
  BOLD_OFF: ESC + "E" + "\x00",
  UNDERLINE_ON: ESC + "-" + "\x01",
  UNDERLINE_OFF: ESC + "-" + "\x00",
  SIZE_NORMAL: GS + "!" + "\x00",
  SIZE_DOUBLE_H: GS + "!" + "\x10",
  SIZE_DOUBLE_W: GS + "!" + "\x20",
  SIZE_DOUBLE: GS + "!" + "\x11",
  FEED: LF,
  FEED_N: (n: number) => ESC + "d" + String.fromCharCode(Math.max(0, Math.min(255, n))),
  CUT_FULL: GS + "V" + "\x00",
  CUT_PARTIAL: GS + "V" + "\x01",
  DRAWER_KICK: ESC + "p" + "\x00" + "\x19" + "\xFA",
};

// -------- PAPER WIDTHS --------
export type PaperSize = "58mm" | "80mm";
export const PAPER_COLS: Record<PaperSize, number> = {
  "58mm": 32,
  "80mm": 48,
};

// -------- TYPES --------
export type BTDevice = {
  id: string; // MAC address
  name: string;
  bonded?: boolean;
};

export type SavedPrinter = {
  id: string;
  name: string;
  paperSize: PaperSize;
};

const STORAGE_KEY_DEFAULT_PRINTER = "ck_default_printer_v1";

// -------- LAZY-LOAD NATIVE MODULE --------
let RNBluetoothClassic: any = null;
let nativeLoadAttempted = false;

function loadNativeModule(): any {
  if (nativeLoadAttempted) return RNBluetoothClassic;
  nativeLoadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-bluetooth-classic");
    RNBluetoothClassic = mod?.default ?? mod;
  } catch {
    RNBluetoothClassic = null;
  }
  return RNBluetoothClassic;
}

// -------- AVAILABILITY --------
export async function isBluetoothAvailable(): Promise<{
  available: boolean;
  reason?: string;
}> {
  const mod = loadNativeModule();
  if (!mod) {
    return {
      available: false,
      reason:
        "Modul Bluetooth belum tersedia. Install `react-native-bluetooth-classic` lalu build APK custom (Expo Go tidak mendukung Bluetooth Classic).",
    };
  }
  try {
    const enabled = await mod.isBluetoothEnabled();
    if (!enabled)
      return {
        available: false,
        reason: "Bluetooth perangkat sedang nonaktif. Aktifkan Bluetooth dulu.",
      };
    return { available: true };
  } catch (e: any) {
    return { available: false, reason: e?.message ?? "Bluetooth gagal diakses." };
  }
}

export async function requestBluetoothEnable(): Promise<boolean> {
  const mod = loadNativeModule();
  if (!mod) return false;
  try {
    return await mod.requestBluetoothEnabled();
  } catch {
    return false;
  }
}

// -------- DISCOVERY & PAIRING --------
export async function listBondedDevices(): Promise<BTDevice[]> {
  const mod = loadNativeModule();
  if (!mod) return [];
  try {
    const list = await mod.getBondedDevices();
    return (list ?? []).map((d: any) => ({
      id: d.address ?? d.id,
      name: d.name ?? "Unknown",
      bonded: true,
    }));
  } catch {
    return [];
  }
}

export async function scanForDevices(timeoutMs = 12000): Promise<BTDevice[]> {
  const mod = loadNativeModule();
  if (!mod) return [];
  try {
    const list = await mod.startDiscovery();
    // Auto-stop after timeoutMs (safety)
    setTimeout(() => {
      try { mod.cancelDiscovery?.(); } catch {}
    }, timeoutMs);
    return (list ?? []).map((d: any) => ({
      id: d.address ?? d.id,
      name: d.name ?? "Unknown",
      bonded: !!d.bonded,
    }));
  } catch {
    return [];
  }
}

export async function pairDevice(deviceId: string): Promise<boolean> {
  const mod = loadNativeModule();
  if (!mod) return false;
  try {
    await mod.pairDevice(deviceId);
    return true;
  } catch {
    return false;
  }
}

// -------- CONNECTION --------
let connectedDeviceId: string | null = null;

export async function connectPrinter(deviceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const mod = loadNativeModule();
  if (!mod) return { ok: false, error: "Modul Bluetooth tidak tersedia." };
  try {
    // Disconnect previous if any
    if (connectedDeviceId && connectedDeviceId !== deviceId) {
      try { await mod.disconnectFromDevice(connectedDeviceId); } catch {}
    }
    const ok = await mod.connectToDevice(deviceId, {
      delimiter: "\n",
      deviceCharset: "ISO-8859-1",
    });
    if (ok) connectedDeviceId = deviceId;
    return { ok: !!ok };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Gagal menghubungkan printer." };
  }
}

export async function disconnectPrinter(): Promise<void> {
  const mod = loadNativeModule();
  if (!mod || !connectedDeviceId) return;
  try {
    await mod.disconnectFromDevice(connectedDeviceId);
  } catch {}
  connectedDeviceId = null;
}

export function getConnectedDeviceId(): string | null {
  return connectedDeviceId;
}

// -------- DEFAULT PRINTER STORAGE --------
export async function saveDefaultPrinter(p: SavedPrinter): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_DEFAULT_PRINTER, JSON.stringify(p));
}

export async function getDefaultPrinter(): Promise<SavedPrinter | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY_DEFAULT_PRINTER);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function clearDefaultPrinter(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_DEFAULT_PRINTER);
}

// -------- RAW WRITE --------
async function writeRaw(payload: string): Promise<void> {
  const mod = loadNativeModule();
  if (!mod) throw new Error("Modul Bluetooth tidak tersedia.");
  if (!connectedDeviceId) throw new Error("Printer belum terhubung.");
  await mod.writeToDevice(connectedDeviceId, payload, "ISO-8859-1");
}

// -------- RECEIPT FORMATTER --------
const repeat = (s: string, n: number) => new Array(Math.max(0, n) + 1).join(s);

const pad = (s: string, len: number, side: "L" | "R" | "C" = "L") => {
  s = String(s ?? "");
  if (s.length >= len) return s.substring(0, len);
  const gap = len - s.length;
  if (side === "R") return repeat(" ", gap) + s;
  if (side === "C") {
    const l = Math.floor(gap / 2);
    const r = gap - l;
    return repeat(" ", l) + s + repeat(" ", r);
  }
  return s + repeat(" ", gap);
};

const formatRp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

export type ReceiptLine = {
  productName: string;
  qty: number;
  price: number;
  toppings: { productName: string; qty: number; price: number }[];
};

export type ReceiptData = {
  storeName: string;
  storeAddress?: string;
  storeWhatsapp?: string;
  invoiceCode: string;
  dateTime: string;
  cashierName: string;
  customerName?: string;
  paymentMethod: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  footer?: string;
  isVoid?: boolean;
  voidReason?: string;
};

/**
 * Build ESC/POS receipt string for a given paper size.
 * 58mm = 32 cols, 80mm = 48 cols (using Font A, standard width).
 */
export function buildReceipt(data: ReceiptData, paper: PaperSize): string {
  const COLS = PAPER_COLS[paper];
  let s = ESC_POS.INIT;

  // Header
  s += ESC_POS.ALIGN_CENTER + ESC_POS.SIZE_DOUBLE + ESC_POS.BOLD_ON;
  s += data.storeName + LF;
  s += ESC_POS.SIZE_NORMAL + ESC_POS.BOLD_OFF;
  if (data.storeAddress) s += data.storeAddress + LF;
  if (data.storeWhatsapp) s += "WA: " + data.storeWhatsapp + LF;
  s += repeat("-", COLS) + LF;
  s += ESC_POS.ALIGN_LEFT;

  // Meta
  const metaLeft = (k: string, v: string) =>
    pad(k, Math.floor(COLS * 0.4)) + pad(v, COLS - Math.floor(COLS * 0.4), "L") + LF;
  s += metaLeft("No.", data.invoiceCode);
  s += metaLeft("Tanggal", data.dateTime);
  s += metaLeft("Kasir", data.cashierName);
  if (data.customerName) s += metaLeft("Pelanggan", data.customerName);
  s += repeat("-", COLS) + LF;

  // VOID banner
  if (data.isVoid) {
    s += ESC_POS.ALIGN_CENTER + ESC_POS.BOLD_ON + ESC_POS.SIZE_DOUBLE_H;
    s += "*** VOID ***" + LF;
    s += ESC_POS.SIZE_NORMAL + ESC_POS.BOLD_OFF + ESC_POS.ALIGN_LEFT;
    if (data.voidReason) s += "Alasan: " + data.voidReason + LF;
    s += repeat("-", COLS) + LF;
  }

  // Items
  for (const ln of data.lines) {
    // Product line
    const lineTotal = ln.price * ln.qty;
    const qtyStr = `${ln.qty}x`;
    const priceStr = formatRp(ln.price);
    const totalStr = formatRp(lineTotal);
    const nameLen = COLS - totalStr.length - 1;
    s += pad(ln.productName, nameLen) + " " + pad(totalStr, totalStr.length, "R") + LF;
    s += "  " + pad(qtyStr + " @ " + priceStr, COLS - 2) + LF;
    // Toppings
    for (const t of ln.toppings) {
      const tTotal = t.price * t.qty * ln.qty;
      const tStr = formatRp(tTotal);
      const tName = "  + " + t.productName + " x" + t.qty;
      s += pad(tName, COLS - tStr.length) + pad(tStr, tStr.length, "R") + LF;
    }
  }

  s += repeat("-", COLS) + LF;

  // Totals
  const totalRow = (k: string, v: string, bold = false) => {
    let line = pad(k, COLS - v.length) + pad(v, v.length, "R") + LF;
    if (bold) line = ESC_POS.BOLD_ON + line + ESC_POS.BOLD_OFF;
    return line;
  };
  s += totalRow("Subtotal", formatRp(data.subtotal));
  if (data.discount > 0) s += totalRow("Diskon", "-" + formatRp(data.discount));
  if (data.tax > 0) s += totalRow("Pajak", formatRp(data.tax));
  s += totalRow("TOTAL", formatRp(data.total), true);
  s += totalRow(data.paymentMethod, formatRp(data.paid));
  if (data.change > 0) s += totalRow("Kembali", formatRp(data.change));
  s += repeat("-", COLS) + LF;

  // Footer
  s += ESC_POS.ALIGN_CENTER;
  if (data.footer) {
    // Word-wrap footer
    const words = data.footer.split(/\s+/);
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > COLS) {
        s += line + LF;
        line = w;
      } else {
        line = line ? line + " " + w : w;
      }
    }
    if (line) s += line + LF;
  }
  s += LF;
  s += "-- Cemara Kopi POS --" + LF;
  s += ESC_POS.FEED_N(3);
  s += ESC_POS.CUT_PARTIAL;
  return s;
}

// -------- HIGH-LEVEL PRINT --------
export async function printReceipt(
  data: ReceiptData,
  paper: PaperSize
): Promise<{ ok: boolean; error?: string }> {
  try {
    const avail = await isBluetoothAvailable();
    if (!avail.available) return { ok: false, error: avail.reason };
    if (!connectedDeviceId) {
      // Auto-connect to default printer if set
      const def = await getDefaultPrinter();
      if (!def) return { ok: false, error: "Belum ada printer default. Atur dulu di menu Printer." };
      const r = await connectPrinter(def.id);
      if (!r.ok) return { ok: false, error: r.error ?? "Gagal menghubungkan printer default." };
    }
    const payload = buildReceipt(data, paper);
    await writeRaw(payload);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Gagal mencetak." };
  }
}

export async function testPrint(paper: PaperSize): Promise<{ ok: boolean; error?: string }> {
  return printReceipt(
    {
      storeName: "Cemara Kopi",
      storeAddress: "Test Print",
      invoiceCode: "TEST-PRINT",
      dateTime: new Date().toLocaleString("id-ID"),
      cashierName: "Admin",
      paymentMethod: "Tunai",
      lines: [
        { productName: "Kopi Hitam", qty: 1, price: 5000, toppings: [] },
        {
          productName: "Pop Mie",
          qty: 1,
          price: 8000,
          toppings: [{ productName: "Telur", qty: 1, price: 3000 }],
        },
      ],
      subtotal: 16000,
      discount: 0,
      tax: 0,
      total: 16000,
      paid: 20000,
      change: 4000,
      footer:
        "Terima kasih telah berkunjung. Semoga harimu menyenangkan",
    },
    paper
  );
}
