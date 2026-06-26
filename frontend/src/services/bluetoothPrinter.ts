/**
 * Bluetooth Thermal Printer Service — Cemara Kopi POS
 * -------------------------------------------------------
 * ESC/POS implementation untuk 58mm (32 cols) dan 80mm (48 cols)
 * Bluetooth thermal printer via react-native-bluetooth-classic.
 *
 * CARA BUILD APK CUSTOM (EAS):
 *   1. yarn add react-native-bluetooth-classic@1.60.0-rc.7
 *   2. Tambahkan plugin di app.json (lihat README)
 *   3. eas build -p android --profile preview
 *
 * Setelah APK ter-install dari EAS build, isAvailable() akan return true
 * dan semua fitur scan/connect/print akan aktif.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── ESC/POS COMMANDS ────────────────────────────────────────────────────────
const ESC = "\x1B";
const GS  = "\x1D";
const LF  = "\x0A";

export const ESC_POS = {
  INIT:           ESC + "@",
  ALIGN_LEFT:     ESC + "a\x00",
  ALIGN_CENTER:   ESC + "a\x01",
  ALIGN_RIGHT:    ESC + "a\x02",
  BOLD_ON:        ESC + "E\x01",
  BOLD_OFF:       ESC + "E\x00",
  UNDERLINE_ON:   ESC + "-\x01",
  UNDERLINE_OFF:  ESC + "-\x00",
  SIZE_NORMAL:    GS  + "!\x00",
  SIZE_DOUBLE_H:  GS  + "!\x10",
  SIZE_DOUBLE_W:  GS  + "!\x20",
  SIZE_DOUBLE:    GS  + "!\x11",
  FEED:           LF,
  FEED_N: (n: number) =>
    ESC + "d" + String.fromCharCode(Math.max(0, Math.min(255, n))),
  CUT_FULL:       GS + "V\x00",
  CUT_PARTIAL:    GS + "V\x01",
  DRAWER_KICK:    ESC + "p\x00\x19\xFA",
};

// ─── PAPER SIZE ───────────────────────────────────────────────────────────────
export type PaperSize = "58mm" | "80mm";
export const PAPER_COLS: Record<PaperSize, number> = {
  "58mm": 32,
  "80mm": 48,
};

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type BTDevice = {
  id: string;    // MAC address
  name: string;
  bonded?: boolean;
};

export type SavedPrinter = {
  id: string;
  name: string;
  paperSize: PaperSize;
};

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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "ck_default_printer_v1";

// ✅ FIX #2: delay setelah connect sebelum print pertama. Bluetooth Classic
// kadang melaporkan connect sukses sebelum stream benar-benar siap menerima
// data, sehingga write pertama setelah auto-connect bisa gagal/macet.
const POST_CONNECT_DELAY_MS = 300;

// ─── LAZY-LOAD NATIVE MODULE ─────────────────────────────────────────────────
let _module: any = null;
let _attempted = false;

function getNativeModule(): any {
  if (_attempted) return _module;
  _attempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-bluetooth-classic");
    _module = mod?.default ?? mod;
  } catch {
    _module = null;
  }
  return _module;
}

// ─── AVAILABILITY ─────────────────────────────────────────────────────────────
export async function isBluetoothAvailable(): Promise<{
  available: boolean;
  reason?: string;
}> {
  const mod = getNativeModule();

  if (!mod) {
    return {
      available: false,
      reason:
        "Modul Bluetooth belum tersedia. APK perlu di-rebuild via EAS Build " +
        "agar react-native-bluetooth-classic ter-link ke native Android.",
    };
  }

  try {
    const enabled = await mod.isBluetoothEnabled();
    if (!enabled) {
      return {
        available: false,
        reason: "Bluetooth perangkat sedang nonaktif. Aktifkan Bluetooth dulu.",
      };
    }
    return { available: true };
  } catch (e: any) {
    return {
      available: false,
      reason: e?.message ?? "Bluetooth gagal diakses.",
    };
  }
}

export async function requestBluetoothEnable(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    return await mod.requestBluetoothEnabled();
  } catch {
    return false;
  }
}

// ─── DISCOVERY & PAIRING ──────────────────────────────────────────────────────
export async function listBondedDevices(): Promise<BTDevice[]> {
  const mod = getNativeModule();
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

/**
 * Scan perangkat Bluetooth sekitar menggunakan event-based discovery.
 * react-native-bluetooth-classic v1.60 menggunakan onDeviceDiscovered event,
 * bukan return value langsung dari startDiscovery().
 */
export async function scanForDevices(timeoutMs = 12000): Promise<BTDevice[]> {
  const mod = getNativeModule();
  if (!mod) return [];

  const discovered: BTDevice[] = [];
  const seenIds = new Set<string>();
  let subscription: any = null;

  try {
    // Cancel discovery lama jika ada
    try { await mod.cancelDiscovery(); } catch {}

    // Subscribe event sebelum start
    if (typeof mod.onDeviceDiscovered === "function") {
      subscription = mod.onDeviceDiscovered((event: any) => {
        const d = event?.device ?? event;
        const id = d?.address ?? d?.id;
        if (!id || seenIds.has(id)) return;
        seenIds.add(id);
        discovered.push({
          id,
          name: d.name ?? "Unknown",
          bonded: !!d.bonded,
        });
      });
    }

    // Start discovery
    await mod.startDiscovery();

    // Tunggu timeout
    await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  } catch (e) {
    console.error("[BT] scanForDevices error:", e);
  } finally {
    // Cleanup
    try { await mod.cancelDiscovery(); } catch {}
    try { subscription?.remove?.(); } catch {}
  }

  return discovered;
}

export async function pairDevice(deviceId: string): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    await mod.pairDevice(deviceId);
    return true;
  } catch {
    return false;
  }
}

// ─── CONNECTION ───────────────────────────────────────────────────────────────
let _connectedId: string | null = null;

export async function connectPrinter(deviceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const mod = getNativeModule();
  if (!mod) return { ok: false, error: "Modul Bluetooth tidak tersedia." };

  try {
    // Disconnect dari device sebelumnya jika berbeda
    if (_connectedId && _connectedId !== deviceId) {
      try { await mod.disconnectFromDevice(_connectedId); } catch {}
      _connectedId = null;
    }

    const ok = await mod.connectToDevice(deviceId, {
      delimiter: "\n",
      deviceCharset: "ISO-8859-1",
    });

    if (ok) {
      _connectedId = deviceId;
      // ✅ FIX #2: beri jeda singkat agar stream siap sebelum write pertama
      await new Promise((resolve) => setTimeout(resolve, POST_CONNECT_DELAY_MS));
    }
    return { ok: !!ok };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Gagal menghubungkan printer." };
  }
}

export async function disconnectPrinter(): Promise<void> {
  const mod = getNativeModule();
  if (!mod || !_connectedId) return;
  try {
    await mod.disconnectFromDevice(_connectedId);
  } catch {}
  _connectedId = null;
}

export function getConnectedDeviceId(): string | null {
  return _connectedId;
}

// ─── DEFAULT PRINTER STORAGE ──────────────────────────────────────────────────
export async function saveDefaultPrinter(p: SavedPrinter): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export async function getDefaultPrinter(): Promise<SavedPrinter | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearDefaultPrinter(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ─── RAW WRITE (ESC/POS binary-safe) ─────────────────────────────────────────
async function writeRaw(payload: string): Promise<void> {
  const mod = getNativeModule();
  if (!mod)       throw new Error("Modul Bluetooth tidak tersedia.");
  if (!_connectedId) throw new Error("Printer belum terhubung.");

  /**
   * Konversi string ESC/POS ke Uint8Array agar binary command (ESC, GS, dll)
   * tidak rusak saat dikirim. Ini fix utama agar cetak tidak garbled.
   */
  const bytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    bytes[i] = payload.charCodeAt(i) & 0xFF;
  }

  await mod.writeToDevice(_connectedId, bytes);
}

// ─── RECEIPT FORMATTER ────────────────────────────────────────────────────────
const repeat = (s: string, n: number): string =>
  n <= 0 ? "" : new Array(n + 1).join(s);

/**
 * ✅ FIX #1: pad() yang LAMA memotong (truncate) teks yang lebih panjang dari
 * `len` tanpa peringatan — ini menyebabkan nama produk panjang ke-cut diam-diam
 * di struk (terutama di 58mm / 32 kolom yang sangat sempit). Fungsi ini
 * dipertahankan SAMA untuk kasus pad biasa (karena dipakai luas di file ini),
 * tapi sekarang HANYA dipakai untuk string yang sudah dipastikan muat,
 * karena pemanggil item/nama produk sekarang melalui wrapToWidth() dulu
 * (lihat di bawah) sebelum di-pad.
 */
const pad = (
  s: string,
  len: number,
  side: "L" | "R" | "C" = "L"
): string => {
  s = String(s ?? "");
  if (s.length >= len) return s.substring(0, len);
  const gap = len - s.length;
  if (side === "R") return repeat(" ", gap) + s;
  if (side === "C") {
    const l = Math.floor(gap / 2);
    return repeat(" ", l) + s + repeat(" ", gap - l);
  }
  return s + repeat(" ", gap);
};

/**
 * ✅ FIX #1: Pecah teks panjang menjadi beberapa baris sepanjang `width`,
 * wrap per-kata (tidak memotong kata di tengah selama kata itu sendiri
 * tidak lebih panjang dari width). Dipakai untuk nama produk/topping yang
 * bisa lebih panjang dari sisa kolom yang tersedia.
 */
function wrapToWidth(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    // Kata itu sendiri lebih panjang dari width → potong paksa per-segmen
    if (word.length > safeWidth) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let remaining = word;
      while (remaining.length > safeWidth) {
        lines.push(remaining.slice(0, safeWidth));
        remaining = remaining.slice(safeWidth);
      }
      current = remaining;
      continue;
    }

    const candidate = current ? current + " " + word : word;
    if (candidate.length > safeWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

const formatRp = (n: number): string =>
  "Rp" + Math.round(n).toLocaleString("id-ID");

/**
 * Build ESC/POS receipt string.
 * 58mm = 32 cols, 80mm = 48 cols.
 */
export function buildReceipt(data: ReceiptData, paper: PaperSize): string {
  const COLS = PAPER_COLS[paper];
  let s = ESC_POS.INIT;

  // ── Header ──
  s += ESC_POS.ALIGN_CENTER + ESC_POS.SIZE_DOUBLE + ESC_POS.BOLD_ON;
  s += data.storeName + LF;
  s += ESC_POS.SIZE_NORMAL + ESC_POS.BOLD_OFF;
  if (data.storeAddress)  s += data.storeAddress + LF;
  if (data.storeWhatsapp) s += "WA: " + data.storeWhatsapp + LF;
  s += repeat("-", COLS) + LF;
  s += ESC_POS.ALIGN_LEFT;

  // ── Meta ──
  const meta = (k: string, v: string) => {
    const kLen = Math.floor(COLS * 0.4);
    const vLen = COLS - kLen;
    // Nilai meta (misal nama pelanggan panjang) juga di-wrap, bukan dipotong
    const vLines = wrapToWidth(v, vLen);
    let out = pad(k, kLen) + pad(vLines[0], vLen) + LF;
    for (let i = 1; i < vLines.length; i++) {
      out += pad("", kLen) + pad(vLines[i], vLen) + LF;
    }
    return out;
  };
  s += meta("No.", data.invoiceCode);
  s += meta("Tanggal", data.dateTime);
  s += meta("Kasir", data.cashierName);
  if (data.customerName) s += meta("Pelanggan", data.customerName);
  s += repeat("-", COLS) + LF;

  // ── VOID Banner ──
  if (data.isVoid) {
    s += ESC_POS.ALIGN_CENTER + ESC_POS.BOLD_ON + ESC_POS.SIZE_DOUBLE_H;
    s += "*** VOID ***" + LF;
    s += ESC_POS.SIZE_NORMAL + ESC_POS.BOLD_OFF + ESC_POS.ALIGN_LEFT;
    if (data.voidReason) s += "Alasan: " + data.voidReason + LF;
    s += repeat("-", COLS) + LF;
  }

  // ── Items ──
  // ✅ FIX #1: nama produk/topping yang lebih panjang dari sisa kolom sekarang
  // di-WRAP ke baris baru (sejajar, harga tetap di kanan baris pertama),
  // bukan dipotong diam-diam seperti sebelumnya.
  for (const ln of data.lines) {
    const lineTotal = ln.price * ln.qty;
    const totalStr  = formatRp(lineTotal);
    const nameLen   = Math.max(1, COLS - totalStr.length - 1);

    const nameLines = wrapToWidth(ln.productName, nameLen);
    // Baris pertama: nama + harga sejajar kanan
    s += pad(nameLines[0], nameLen) + " " + totalStr + LF;
    // Baris lanjutan nama (jika wrap): rata kiri penuh, tanpa harga
    for (let i = 1; i < nameLines.length; i++) {
      s += nameLines[i] + LF;
    }

    s += "  " + pad(`${ln.qty}x @ ${formatRp(ln.price)}`, COLS - 2) + LF;

    for (const t of ln.toppings) {
      const tTotal = t.price * t.qty * ln.qty;
      const tStr   = formatRp(tTotal);
      const tPrefix = "  + ";
      const tNameLen = Math.max(1, COLS - tStr.length - tPrefix.length - 1);
      const tNameLines = wrapToWidth(t.productName + ` x${t.qty}`, tNameLen);

      s += pad(tPrefix + tNameLines[0], COLS - tStr.length) + " " + tStr + LF;
      for (let i = 1; i < tNameLines.length; i++) {
        s += "    " + tNameLines[i] + LF;
      }
    }
  }

  s += repeat("-", COLS) + LF;

  // ── Totals ──
  const row = (k: string, v: string, bold = false): string => {
    const line = pad(k, COLS - v.length) + pad(v, v.length, "R") + LF;
    return bold
      ? ESC_POS.BOLD_ON + line + ESC_POS.BOLD_OFF
      : line;
  };
  s += row("Subtotal", formatRp(data.subtotal));
  if (data.discount > 0) s += row("Diskon", "-" + formatRp(data.discount));
  if (data.tax > 0)      s += row("Pajak",  formatRp(data.tax));
  s += row("TOTAL", formatRp(data.total), true);
  s += row(data.paymentMethod, formatRp(data.paid));
  if (data.change > 0)   s += row("Kembali", formatRp(data.change));
  s += repeat("-", COLS) + LF;

  // ── Footer ──
  s += ESC_POS.ALIGN_CENTER;
  if (data.footer) {
    const footerLines = wrapToWidth(data.footer, COLS);
    for (const line of footerLines) s += line + LF;
  }
  s += LF + "-- Cemara Kopi POS --" + LF;
  s += ESC_POS.FEED_N(4);
  s += ESC_POS.CUT_PARTIAL;
  return s;
}

// ─── HIGH-LEVEL PRINT ─────────────────────────────────────────────────────────
export async function printReceipt(
  data: ReceiptData,
  paper: PaperSize
): Promise<{ ok: boolean; error?: string }> {
  try {
    const avail = await isBluetoothAvailable();
    if (!avail.available) return { ok: false, error: avail.reason };

    if (!_connectedId) {
      const def = await getDefaultPrinter();
      if (!def)
        return {
          ok: false,
          error: "Belum ada printer default. Atur dulu di menu Printer.",
        };
      const r = await connectPrinter(def.id);
      if (!r.ok)
        return { ok: false, error: r.error ?? "Gagal menghubungkan printer default." };
    }

    await writeRaw(buildReceipt(data, paper));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Gagal mencetak." };
  }
}

export async function testPrint(
  paper: PaperSize
): Promise<{ ok: boolean; error?: string }> {
  return printReceipt(
    {
      storeName:     "Cemara Kopi",
      storeAddress:  "Jl. Contoh No. 1",
      storeWhatsapp: "08123456789",
      invoiceCode:   "TEST-001",
      dateTime:      new Date().toLocaleString("id-ID"),
      cashierName:   "Admin",
      paymentMethod: "Tunai",
      lines: [
        {
          productName: "Kopi Susu",
          qty: 1,
          price: 15000,
          toppings: [],
        },
        {
          productName: "Pop Mie",
          qty: 1,
          price: 8000,
          toppings: [{ productName: "Telur", qty: 1, price: 3000 }],
        },
      ],
      subtotal: 26000,
      discount: 0,
      tax:      0,
      total:    26000,
      paid:     30000,
      change:   4000,
      footer:   "Terima kasih telah berkunjung! Semoga harimu menyenangkan :)",
    },
    paper
  );
}

// ─── FACADE OBJECT (dipakai oleh PrinterScreen) ───────────────────────────────
/**
 * BluetoothPrinter — unified interface untuk semua operasi printer.
 * Import: import { BluetoothPrinter } from "@/src/services/bluetoothPrinter";
 */
export const BluetoothPrinter = {
  isAvailable:        isBluetoothAvailable,
  requestEnable:      requestBluetoothEnable,
  listBondedDevices,
  /** timeoutSeconds — default 12 detik */
  scanForDevices: (timeoutSeconds = 12) => scanForDevices(timeoutSeconds * 1000),
  pairDevice,
  connect:            connectPrinter,
  disconnect:         disconnectPrinter,
  getConnectedDeviceId,
  saveDefault:        saveDefaultPrinter,
  getDefault:         getDefaultPrinter,
  clearDefault:       clearDefaultPrinter,
  buildReceipt,
  printReceipt,
  testPrint,
} as const;