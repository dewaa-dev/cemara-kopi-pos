import * as SQLite from "expo-sqlite";
import { SEED_PRODUCTS, SEED_USERS, SEED_SETTINGS } from "./seed";

let rawDb: SQLite.SQLiteDatabase | null = null;

// FIX RACE CONDITION: initPromise TIDAK di-reset ke null setelah selesai.
// Sebelumnya, .finally(() => { initPromise = null }) menyebabkan panggilan
// getDb() berikutnya dari screen berbeda bisa membuat openDatabaseAsync() kedua
// saat rawDb belum ter-set (window ~1ms) → dua koneksi native berebut migrate().
// Sekarang: initPromise hanya di-null-kan JIKA gagal (agar bisa retry),
// tapi kalau sukses dibiarkan sebagai resolved Promise selamanya (memory minimal).
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
    .catch((err) => {
      // Hanya reset kalau gagal, agar bisa retry
      initPromise = null;
      rawDb = null;
      throw err;
    });

  return initPromise;
}

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

const GUARDED_METHODS = [
  "execAsync",
  "runAsync",
  "getFirstAsync",
  "getAllAsync",
  "getEachAsync",
  "withTransactionAsync",
] as const;

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
              `[DB] Koneksi native rusak saat "${String(prop)}", membuka ulang...`,
              err
            );
            resetConnection();
            const fresh = await getRawDb();
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
