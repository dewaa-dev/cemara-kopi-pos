import * as SQLite from "expo-sqlite";
import { SEED_PRODUCTS, SEED_USERS, SEED_SETTINGS } from "./seed";

let rawDb: SQLite.SQLiteDatabase | null = null;
// ✅ FIX: lacak Promise inisialisasi yang sedang berjalan, bukan cuma hasil
// akhirnya. Tanpa ini, kalau dua bagian UI memanggil getDb() hampir
// bersamaan saat app baru dibuka (misal listProducts + listCategories di
// useFocusEffect yang sama), masing-masing bisa memicu openDatabaseAsync()
// SENDIRI-SENDIRI secara paralel sebelum rawDb ke-set — menghasilkan dua
// handle native yang berebut migrate() & seedIfEmpty() di waktu yang sama.
// Ini salah satu sumber kerusakan handle native yang berujung
// NullPointerException di transaksi/akses berikutnya.
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndPrepare(): Promise<SQLite.SQLiteDatabase> {
  const instance = await SQLite.openDatabaseAsync("cemara_kopi.db");
  await instance.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);
  await migrate(instance);
  await seedIfEmpty(instance);
  return instance;
}

async function getRawDb(): Promise<SQLite.SQLiteDatabase> {
  if (rawDb) return rawDb;
  if (initPromise) return initPromise;

  initPromise = openAndPrepare()
    .then((instance) => {
      rawDb = instance;
      return instance;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

/**
 * ✅ FIX: deteksi error yang menandakan koneksi native sudah rusak/invalid
 * (bukan error query biasa seperti constraint violation atau syntax error).
 * Native SQLite handle yang invalid biasanya melempar NullPointerException
 * atau pesan yang menyebut "NativeDatabase" / "has been rejected" dari sisi
 * Android, karena objek native-nya sudah ter-deallocate tapi referensi JS
 * masih menunjuk ke wrapper lama yang sekarang kosong. Gejala yang muncul
 * di aplikasi: transaksi kedua gagal, menu produk tampil kosong, draft
 * tidak bisa disimpan — semuanya turunan dari handle yang sama rusak.
 */
function isStaleConnectionError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "");
  return (
    msg.includes("NullPointerException") ||
    msg.includes("NativeDatabase") ||
    msg.includes("has been rejected") ||
    msg.includes("database is closed") ||
    msg.includes("Database is closed") ||
    (msg.includes("execAsync") && msg.includes("rejected"))
  );
}

function resetConnection() {
  rawDb = null;
  initPromise = null;
}

// Method-method SQLiteDatabase yang dipakai di seluruh repo.ts / extras.ts
// dan butuh proteksi self-healing.
const GUARDED_METHODS = [
  "execAsync",
  "runAsync",
  "getFirstAsync",
  "getAllAsync",
  "getEachAsync",
  "withTransactionAsync",
] as const;

/**
 * ✅ FIX UTAMA: getDb() sekarang mengembalikan PROXY di atas instance
 * SQLiteDatabase asli. Setiap kali repo.ts/extras.ts memanggil method
 * seperti d.runAsync(...) atau d.getAllAsync(...), proxy ini:
 *   1. Menjalankan method aslinya seperti biasa.
 *   2. Kalau gagal dengan error yang menandakan koneksi native rusak,
 *      otomatis membuka koneksi BARU dan retry method yang sama SEKALI.
 *   3. Kalau retry juga gagal (atau errornya bukan stale-connection),
 *      error asli dilempar ke pemanggil seperti biasa.
 *
 * Keuntungan pendekatan ini: TIDAK PERLU mengubah 28 titik pemanggilan
 * getDb() yang sudah ada di repo.ts/extras.ts — semua otomatis terlindungi
 * karena proxy ini transparan, terlihat seperti SQLiteDatabase biasa.
 */
function wrapWithSelfHealing(instance: SQLite.SQLiteDatabase): SQLite.SQLiteDatabase {
  return new Proxy(instance, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);

      if (
        typeof original === "function" &&
        (GUARDED_METHODS as readonly string[]).includes(prop as string)
      ) {
        return async (...args: any[]) => {
          try {
            return await original.apply(target, args);
          } catch (err) {
            if (!isStaleConnectionError(err)) throw err;

            console.warn(
              `[DB] Koneksi native rusak terdeteksi saat memanggil "${String(prop)}", membuka ulang koneksi...`,
              err
            );
            resetConnection();
            const fresh = await getRawDb();
            // Retry SEKALI dengan koneksi baru. Method yang sama dipanggil
            // ulang lewat instance fresh (bukan proxy, untuk hindari rekursi
            // tak terbatas kalau koneksi baru ternyata juga langsung rusak —
            // dalam kasus itu error akan naik apa adanya ke pemanggil).
            const freshMethod = (fresh as any)[prop];
            return await freshMethod.apply(fresh, args);
          }
        };
      }

      return original;
    },
  });
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  const instance = await getRawDb();
  return wrapWithSelfHealing(instance);
}

async function migrate(d: SQLite.SQLiteDatabase) {
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL,
      barcode TEXT,
      photo TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      stock INTEGER NOT NULL DEFAULT 0,
      min_stock INTEGER NOT NULL DEFAULT 0,
      is_topping INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      table_no TEXT,
      note TEXT,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      paid REAL NOT NULL,
      change_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      cashier_id TEXT NOT NULL,
      cashier_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NORMAL',
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_items (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      subtotal REAL NOT NULL,
      parent_item_id TEXT,
      is_topping INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS cash_flow (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      user_id TEXT,
      user_name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS draft_orders (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT,
      note TEXT,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      cart_json TEXT NOT NULL,
      cashier_id TEXT,
      cashier_name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_tx_items_tx ON transaction_items(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_cash_created ON cash_flow(created_at);
    CREATE INDEX IF NOT EXISTS idx_drafts_status ON draft_orders(status);

    CREATE TABLE IF NOT EXISTS invoice_counters (
      date TEXT PRIMARY KEY,
      seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
  `);

  // ALTER TABLE migrations for existing databases (idempotent)
  const altered = async (sql: string) => {
    try {
      await d.execAsync(sql);
    } catch {}
  };
  await altered(`ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'NORMAL'`);
  await altered(`ALTER TABLE transactions ADD COLUMN voided_at TEXT`);
  await altered(`ALTER TABLE transactions ADD COLUMN voided_by TEXT`);
  await altered(`ALTER TABLE transactions ADD COLUMN void_reason TEXT`);
}

async function seedIfEmpty(d: SQLite.SQLiteDatabase) {
  const userCount = await d.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM users"
  );
  if ((userCount?.c ?? 0) === 0) {
    for (const u of SEED_USERS) {
      await d.runAsync(
        "INSERT INTO users (id,username,password,name,role,created_at) VALUES (?,?,?,?,?,?)",
        [u.id, u.username, u.password, u.name, u.role, new Date().toISOString()]
      );
    }
  }

  const catCount = await d.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM categories"
  );
  if ((catCount?.c ?? 0) === 0) {
    const cats = [
      { id: "cat_minuman", name: "Minuman", sort: 1 },
      { id: "cat_camilan", name: "Camilan", sort: 2 },
      { id: "cat_mie", name: "Mie", sort: 3 },
      { id: "cat_topping", name: "Topping", sort: 4 },
    ];
    for (const c of cats) {
      await d.runAsync(
        "INSERT INTO categories (id,name,sort_order) VALUES (?,?,?)",
        [c.id, c.name, c.sort]
      );
    }
  }

  const prodCount = await d.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM products"
  );
  if ((prodCount?.c ?? 0) === 0) {
    for (const p of SEED_PRODUCTS) {
      await d.runAsync(
        "INSERT INTO products (id,name,category_id,cost_price,sell_price,barcode,photo,active,stock,min_stock,is_topping,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          p.id,
          p.name,
          p.category_id,
          p.cost_price,
          p.sell_price,
          null,
          null,
          1,
          p.stock,
          p.min_stock,
          p.is_topping ? 1 : 0,
          new Date().toISOString(),
        ]
      );
    }
  }

  const settingsCount = await d.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM settings"
  );
  if ((settingsCount?.c ?? 0) === 0) {
    for (const s of SEED_SETTINGS) {
      await d.runAsync("INSERT INTO settings (key,value) VALUES (?,?)", [
        s.key,
        s.value,
      ]);
    }
  }
}