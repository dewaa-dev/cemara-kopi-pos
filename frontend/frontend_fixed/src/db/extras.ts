import { getDb } from "./database";
import * as FS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { listTransactions, getTransactionItems } from "./repo";

const uid = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ============ CASH FLOW ============
export type CashFlow = {
  id: string;
  type: "in" | "out";
  category: string;
  amount: number;
  note: string | null;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
};

export const CASH_OUT_CATEGORIES = [
  "Belanja Bahan Baku",
  "Gas LPG",
  "Listrik",
  "Air",
  "Internet",
  "Gaji",
  "Transportasi",
  "Perawatan",
  "Lainnya",
];

export const CASH_IN_CATEGORIES = [
  "Modal Masuk",
  "Pinjaman",
  "Hibah",
  "Lainnya",
];

export async function listCashFlow(opts?: { from?: string }): Promise<CashFlow[]> {
  const d = await getDb();
  if (opts?.from) {
    return d.getAllAsync<CashFlow>(
      "SELECT * FROM cash_flow WHERE created_at >= ? ORDER BY created_at DESC",
      [opts.from]
    );
  }
  return d.getAllAsync<CashFlow>(
    "SELECT * FROM cash_flow ORDER BY created_at DESC LIMIT 500"
  );
}

export async function upsertCashFlow(c: Partial<CashFlow> & { type: "in" | "out"; category: string; amount: number }) {
  const d = await getDb();
  if (c.id) {
    await d.runAsync(
      `UPDATE cash_flow SET type=?, category=?, amount=?, note=? WHERE id=?`,
      [c.type, c.category, c.amount, c.note ?? null, c.id]
    );
    return c.id;
  }
  const id = `cash_${uid()}`;
  await d.runAsync(
    `INSERT INTO cash_flow (id,type,category,amount,note,user_id,user_name,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [
      id,
      c.type,
      c.category,
      c.amount,
      c.note ?? null,
      c.user_id ?? null,
      c.user_name ?? null,
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function deleteCashFlow(id: string) {
  const d = await getDb();
  await d.runAsync("DELETE FROM cash_flow WHERE id=?", [id]);
}

// FIX BUG: cashFlowSummary todayIn/todayOut menggunakan UTC midnight local (tanpa WIB offset)
// sehingga jam 00:00-07:00 WIB ke-exclude. Fix: gunakan midnight WIB → instant UTC.
export async function cashFlowSummary(): Promise<{
  todayIn: number;
  todayOut: number;
  totalIn: number;
  totalOut: number;
  balance: number;
}> {
  const d = await getDb();
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const now = new Date();
  // tengah malam WIB dalam instant UTC
  const wibWall = new Date(now.getTime() + WIB_OFFSET_MS);
  const startOfDayWIB = new Date(
    Date.UTC(wibWall.getUTCFullYear(), wibWall.getUTCMonth(), wibWall.getUTCDate(), 0, 0, 0)
    - WIB_OFFSET_MS
  ).toISOString();

  const ti = await d.getFirstAsync<{ s: number }>(
    "SELECT COALESCE(SUM(amount),0) s FROM cash_flow WHERE type='in' AND created_at>=?",
    [startOfDayWIB]
  );
  const to = await d.getFirstAsync<{ s: number }>(
    "SELECT COALESCE(SUM(amount),0) s FROM cash_flow WHERE type='out' AND created_at>=?",
    [startOfDayWIB]
  );
  const ai = await d.getFirstAsync<{ s: number }>(
    "SELECT COALESCE(SUM(amount),0) s FROM cash_flow WHERE type='in'"
  );
  const ao = await d.getFirstAsync<{ s: number }>(
    "SELECT COALESCE(SUM(amount),0) s FROM cash_flow WHERE type='out'"
  );
  // Add sales (status NORMAL saja) as cash IN to balance
  const sales = await d.getFirstAsync<{ s: number }>(
    "SELECT COALESCE(SUM(total),0) s FROM transactions WHERE status='NORMAL'"
  );
  const inTot = (ai?.s ?? 0) + (sales?.s ?? 0);
  return {
    todayIn: ti?.s ?? 0,
    todayOut: to?.s ?? 0,
    totalIn: inTot,
    totalOut: ao?.s ?? 0,
    balance: inTot - (ao?.s ?? 0),
  };
}

// ============ DRAFT ORDERS ============
export type DraftOrder = {
  id: string;
  customer_name: string;
  phone: string | null;
  note: string | null;
  total: number;
  status: "draft" | "paid" | "cancelled";
  cart_json: string;
  cashier_id: string | null;
  cashier_name: string | null;
  created_at: string;
};

export async function listDrafts(search?: string): Promise<DraftOrder[]> {
  const d = await getDb();
  if (search?.trim()) {
    return d.getAllAsync<DraftOrder>(
      "SELECT * FROM draft_orders WHERE status='draft' AND LOWER(customer_name) LIKE ? ORDER BY created_at DESC",
      [`%${search.toLowerCase()}%`]
    );
  }
  return d.getAllAsync<DraftOrder>(
    "SELECT * FROM draft_orders WHERE status='draft' ORDER BY created_at DESC"
  );
}

export async function saveDraft(d: Partial<DraftOrder> & {
  customer_name: string;
  cart_json: string;
  total: number;
}) {
  const db = await getDb();
  if (d.id) {
    await db.runAsync(
      `UPDATE draft_orders SET customer_name=?, phone=?, note=?, total=?, cart_json=? WHERE id=?`,
      [d.customer_name, d.phone ?? null, d.note ?? null, d.total, d.cart_json, d.id]
    );
    return d.id;
  }
  const id = `draft_${uid()}`;
  await db.runAsync(
    `INSERT INTO draft_orders (id,customer_name,phone,note,total,status,cart_json,cashier_id,cashier_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      d.customer_name,
      d.phone ?? null,
      d.note ?? null,
      d.total,
      "draft",
      d.cart_json,
      d.cashier_id ?? null,
      d.cashier_name ?? null,
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function deleteDraft(id: string) {
  const d = await getDb();
  await d.runAsync("DELETE FROM draft_orders WHERE id=?", [id]);
}

export async function markDraftPaid(id: string) {
  const d = await getDb();
  await d.runAsync("UPDATE draft_orders SET status='paid' WHERE id=?", [id]);
}

// ============ BACKUP ============
export type BackupItem = {
  id: string;
  file_name: string;
  file_path: string;
  size_bytes: number;
  kind: "manual" | "auto";
  created_at: string;
};

const DB_NAME = "cemara_kopi.db";

async function getDbSourcePath(): Promise<string> {
  return `${FS.documentDirectory}SQLite/${DB_NAME}`;
}

async function getBackupDir(): Promise<string> {
  const dir = `${FS.documentDirectory}backups/`;
  const info = await FS.getInfoAsync(dir);
  if (!info.exists) {
    await FS.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

export async function listBackups(): Promise<BackupItem[]> {
  const d = await getDb();
  return d.getAllAsync<BackupItem>(
    "SELECT * FROM backups ORDER BY created_at DESC"
  );
}

export async function backupSummary(): Promise<{
  lastBackup: string | null;
  count: number;
  totalBytes: number;
  daysSinceLastBackup: number | null;
}> {
  const d = await getDb();
  const last = await d.getFirstAsync<{ created_at: string }>(
    "SELECT created_at FROM backups ORDER BY created_at DESC LIMIT 1"
  );
  const stats = await d.getFirstAsync<{ c: number; s: number }>(
    "SELECT COUNT(*) c, COALESCE(SUM(size_bytes),0) s FROM backups"
  );
  let days: number | null = null;
  if (last?.created_at) {
    days = Math.floor(
      (Date.now() - new Date(last.created_at).getTime()) / 86400000
    );
  }
  return {
    lastBackup: last?.created_at ?? null,
    count: stats?.c ?? 0,
    totalBytes: stats?.s ?? 0,
    daysSinceLastBackup: days,
  };
}

export async function createBackup(
  kind: "manual" | "auto" = "manual"
): Promise<BackupItem> {
  const d = await getDb();
  const src = await getDbSourcePath();
  const dir = await getBackupDir();
  const now = new Date();
  const stamp = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}_${String(now.getDate()).padStart(2, "0")}_${String(
    now.getHours()
  ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(
    now.getSeconds()
  ).padStart(2, "0")}`;
  const fileName = `backup_${stamp}.db`;
  const dest = `${dir}${fileName}`;
  await d.execAsync("PRAGMA wal_checkpoint(FULL);");
  await FS.copyAsync({ from: src, to: dest });
  const info = await FS.getInfoAsync(dest);
  const size = (info as any).size ?? 0;
  const id = `bk_${uid()}`;
  await d.runAsync(
    "INSERT INTO backups (id,file_name,file_path,size_bytes,kind,created_at) VALUES (?,?,?,?,?,?)",
    [id, fileName, dest, size, kind, now.toISOString()]
  );
  return {
    id,
    file_name: fileName,
    file_path: dest,
    size_bytes: size,
    kind,
    created_at: now.toISOString(),
  };
}

export async function deleteBackup(b: BackupItem) {
  const d = await getDb();
  try {
    await FS.deleteAsync(b.file_path, { idempotent: true });
  } catch {}
  await d.runAsync("DELETE FROM backups WHERE id=?", [b.id]);
}

export async function shareBackup(b: BackupItem) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(b.file_path, {
      mimeType: "application/x-sqlite3",
      dialogTitle: "Bagikan File Backup Database",
    });
  }
}

export async function restoreBackup(b: BackupItem) {
  const src = await getDbSourcePath();
  await FS.copyAsync({ from: b.file_path, to: src });
}

export async function maybeAutoBackup() {
  try {
    const d = await getDb();
    const last = await d.getFirstAsync<{ created_at: string }>(
      "SELECT created_at FROM backups ORDER BY created_at DESC LIMIT 1"
    );
    if (!last) {
      await createBackup("auto");
      return;
    }
    const daysSince = Math.floor(
      (Date.now() - new Date(last.created_at).getTime()) / 86400000
    );
    if (daysSince >= 1) await createBackup("auto");
  } catch {}
}

export async function dbHealth(): Promise<{
  ok: boolean;
  tables: string[];
  userCount: number;
  productCount: number;
  txCount: number;
  dbSizeBytes: number;
  integrityOk: boolean;
}> {
  const d = await getDb();
  const tables = await d.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  const users = await d.getFirstAsync<{ c: number }>("SELECT COUNT(*) c FROM users");
  const products = await d.getFirstAsync<{ c: number }>("SELECT COUNT(*) c FROM products");
  const txs = await d.getFirstAsync<{ c: number }>("SELECT COUNT(*) c FROM transactions");
  const integ = await d.getFirstAsync<{ integrity_check: string }>(
    "PRAGMA integrity_check"
  );
  const src = await getDbSourcePath();
  let dbSizeBytes = 0;
  try {
    const info = await FS.getInfoAsync(src);
    dbSizeBytes = (info as any).size ?? 0;
  } catch {}
  return {
    ok: integ?.integrity_check === "ok",
    tables: tables.map((t) => t.name),
    userCount: users?.c ?? 0,
    productCount: products?.c ?? 0,
    txCount: txs?.c ?? 0,
    dbSizeBytes,
    integrityOk: integ?.integrity_check === "ok",
  };
}

// ============ EXPORT (PDF / CSV) ============
const fmtRp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

export async function exportReportPdf(opts: {
  from?: string;
  to?: string;
  periodLabel: string;
  storeName: string;
}) {
  const txs = await listTransactions({ from: opts.from, to: opts.to, limit: 1000 });
  // FIX: hanya hitung transaksi NORMAL untuk total & diskon di PDF laporan
  const normalTxs = txs.filter((t) => t.status === "NORMAL");
  const total = normalTxs.reduce((s, t) => s + t.total, 0);
  const discount = normalTxs.reduce((s, t) => s + t.discount, 0);
  const rows = txs
    .map(
      (t) => `
    <tr style="${t.status === 'VOID' ? 'opacity:0.55;text-decoration:line-through' : ''}">
      <td>${new Date(t.created_at).toLocaleString("id-ID")}</td>
      <td>${t.code}</td>
      <td>${t.cashier_name}</td>
      <td>${t.customer_name ?? "-"}</td>
      <td>${t.payment_method}</td>
      <td style="text-align:right">${t.status === "VOID" ? "<span style='color:#B00020'>VOID</span>" : fmtRp(t.total)}</td>
    </tr>`
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
    <style>
      body { font-family: -apple-system, sans-serif; padding: 24px; color:#1D1B20; }
      h1 { color:#2E7D32; margin:0 }
      .sub { color:#777; margin:4px 0 16px }
      table { width:100%; border-collapse:collapse; margin-top:12px; font-size:12px }
      th { background:#2E7D32; color:#fff; text-align:left; padding:8px }
      td { padding:8px; border-bottom:1px solid #eee }
      .totals { margin-top:18px; text-align:right; font-weight:700 }
      .totals span { color:#2E7D32; font-size:18px }
      .footer { margin-top:24px; text-align:center; color:#999; font-size:11px }
    </style></head><body>
    <h1>${opts.storeName}</h1>
    <div class="sub">Laporan Penjualan • ${opts.periodLabel}</div>
    <div class="sub">Dicetak ${new Date().toLocaleString("id-ID")}</div>
    <table>
      <tr><th>Tanggal</th><th>No</th><th>Kasir</th><th>Pelanggan</th><th>Bayar</th><th style="text-align:right">Total</th></tr>
      ${rows || "<tr><td colspan='6' style='text-align:center;color:#999'>Tidak ada transaksi</td></tr>"}
    </table>
    <div class="totals">
      Transaksi Berhasil: ${normalTxs.length} &nbsp;•&nbsp;
      Diskon: ${fmtRp(discount)} &nbsp;•&nbsp;
      <span>Total Pendapatan: ${fmtRp(total)}</span>
    </div>
    <div class="footer">Dibuat dengan Cemara Kopi POS</div>
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Bagikan Laporan PDF",
    });
  }
}

export async function exportReportCsv(opts: {
  from?: string;
  to?: string;
  periodLabel: string;
}) {
  const txs = await listTransactions({ from: opts.from, to: opts.to, limit: 5000 });
  // FIX: tambah kolom Status di CSV agar VOID transactions tanda terlihat
  const header = [
    "Tanggal",
    "No",
    "Kasir",
    "Pelanggan",
    "Metode",
    "Status",
    "Subtotal",
    "Diskon",
    "Pajak",
    "Total",
  ];
  const rows = txs.map((t) =>
    [
      new Date(t.created_at).toLocaleString("id-ID"),
      t.code,
      t.cashier_name,
      t.customer_name ?? "",
      t.payment_method,
      t.status,
      t.status === "NORMAL" ? t.subtotal : 0,
      t.status === "NORMAL" ? t.discount : 0,
      t.status === "NORMAL" ? t.tax : 0,
      t.status === "NORMAL" ? t.total : 0,
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",")
  );
  // FIX: tambah BOM agar Excel buka UTF-8 dengan benar (karakter Rp, nama produk Indonesia)
  const bom = "\uFEFF";
  const csv = bom + [header.join(","), ...rows].join("\n");
  const safePeriod = opts.periodLabel.replace(/[^a-zA-Z0-9_]/g, "_");
  const fileName = `laporan_${safePeriod}.csv`;
  const dest = `${FS.documentDirectory}${fileName}`;
  await FS.writeAsStringAsync(dest, csv, { encoding: "utf8" as any });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest, {
      mimeType: "text/csv",
      dialogTitle: "Bagikan Laporan CSV (Excel)",
    });
  }
  return dest;
}

// Also expose getTransactionItems for receipt detail
export { getTransactionItems };
