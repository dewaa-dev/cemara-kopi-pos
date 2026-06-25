import { getDb } from "./database";

export type User = {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "admin" | "kasir";
};

export type Category = { id: string; name: string; sort_order: number };

export type Product = {
  id: string;
  name: string;
  category_id: string;
  cost_price: number;
  sell_price: number;
  barcode: string | null;
  photo: string | null;
  active: number;
  stock: number;
  min_stock: number;
  is_topping: number;
};

export type Transaction = {
  id: string;
  code: string;
  customer_name: string | null;
  table_no: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change_amount: number;
  payment_method: string;
  cashier_id: string;
  cashier_name: string;
  created_at: string;
};

export type TxItem = {
  id: string;
  transaction_id: string;
  product_id: string;
  product_name: string;
  qty: number;
  price: number;
  subtotal: number;
  parent_item_id: string | null;
  is_topping: number;
};

const uid = () =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

// ----- AUTH -----
export async function findUser(username: string, password: string) {
  const d = await getDb();
  return d.getFirstAsync<User>(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username.trim(), password]
  );
}

// ----- CATEGORIES -----
export async function listCategories(): Promise<Category[]> {
  const d = await getDb();
  return d.getAllAsync<Category>(
    "SELECT * FROM categories ORDER BY sort_order"
  );
}

// ----- PRODUCTS -----
export async function listProducts(opts?: {
  categoryId?: string;
  search?: string;
  includeToppings?: boolean;
}): Promise<Product[]> {
  const d = await getDb();
  const where: string[] = ["active=1"];
  const args: any[] = [];
  if (!opts?.includeToppings) where.push("is_topping=0");
  if (opts?.categoryId && opts.categoryId !== "all") {
    where.push("category_id=?");
    args.push(opts.categoryId);
  }
  if (opts?.search && opts.search.trim()) {
    where.push("(LOWER(name) LIKE ? OR barcode = ?)");
    args.push(`%${opts.search.toLowerCase()}%`, opts.search);
  }
  return d.getAllAsync<Product>(
    `SELECT * FROM products WHERE ${where.join(" AND ")} ORDER BY name`,
    args
  );
}

export async function listToppings(): Promise<Product[]> {
  const d = await getDb();
  return d.getAllAsync<Product>(
    "SELECT * FROM products WHERE is_topping=1 AND active=1 ORDER BY sell_price DESC"
  );
}

export async function getProduct(id: string) {
  const d = await getDb();
  return d.getFirstAsync<Product>("SELECT * FROM products WHERE id=?", [id]);
}

export async function upsertProduct(p: Partial<Product> & { name: string }) {
  const d = await getDb();
  if (p.id) {
    await d.runAsync(
      `UPDATE products SET name=?, category_id=?, cost_price=?, sell_price=?, barcode=?, photo=?, active=?, stock=?, min_stock=?, is_topping=? WHERE id=?`,
      [
        p.name,
        p.category_id ?? "cat_minuman",
        p.cost_price ?? 0,
        p.sell_price ?? 0,
        p.barcode ?? null,
        p.photo ?? null,
        p.active ?? 1,
        p.stock ?? 0,
        p.min_stock ?? 0,
        p.is_topping ?? 0,
        p.id,
      ]
    );
    return p.id;
  }
  const id = `prod_${uid()}`;
  await d.runAsync(
    `INSERT INTO products (id,name,category_id,cost_price,sell_price,barcode,photo,active,stock,min_stock,is_topping,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      p.name,
      p.category_id ?? "cat_minuman",
      p.cost_price ?? 0,
      p.sell_price ?? 0,
      p.barcode ?? null,
      p.photo ?? null,
      p.active ?? 1,
      p.stock ?? 0,
      p.min_stock ?? 0,
      p.is_topping ?? 0,
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function deleteProduct(id: string) {
  const d = await getDb();
  await d.runAsync("DELETE FROM products WHERE id=?", [id]);
}

// ----- SETTINGS -----
export async function getSettings(): Promise<Record<string, string>> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ key: string; value: string }>(
    "SELECT * FROM settings"
  );
  const out: Record<string, string> = {};
  rows.forEach((r) => (out[r.key] = r.value ?? ""));
  return out;
}

export async function setSetting(key: string, value: string) {
  const d = await getDb();
  await d.runAsync(
    "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [key, value]
  );
}

// ----- TRANSACTIONS -----
export type CartLine = {
  productId: string;
  productName: string;
  price: number;
  qty: number;
  toppings: { productId: string; productName: string; price: number; qty: number }[];
};

export async function createTransaction(params: {
  cart: CartLine[];
  customer_name?: string;
  table_no?: string;
  note?: string;
  discount: number;
  tax_percent: number;
  paid: number;
  payment_method: string;
  cashier_id: string;
  cashier_name: string;
}): Promise<{ id: string; code: string; total: number; subtotal: number; tax: number; change: number }> {
  const d = await getDb();
  const id = `tx_${uid()}`;
  const code = `INV-${new Date().getTime().toString().slice(-8)}`;
  let subtotal = 0;
  params.cart.forEach((c) => {
    subtotal += c.price * c.qty;
    c.toppings.forEach((t) => (subtotal += t.price * t.qty * c.qty));
  });
  const afterDisc = Math.max(0, subtotal - params.discount);
  const tax = Math.round((afterDisc * params.tax_percent) / 100);
  const total = afterDisc + tax;
  const change = Math.max(0, params.paid - total);

  await d.withTransactionAsync(async () => {
    await d.runAsync(
      `INSERT INTO transactions (id,code,customer_name,table_no,note,subtotal,discount,tax,total,paid,change_amount,payment_method,cashier_id,cashier_name,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        code,
        params.customer_name ?? null,
        params.table_no ?? null,
        params.note ?? null,
        subtotal,
        params.discount,
        tax,
        total,
        params.paid,
        change,
        params.payment_method,
        params.cashier_id,
        params.cashier_name,
        new Date().toISOString(),
      ]
    );

    for (const c of params.cart) {
      const parentId = `txi_${uid()}`;
      await d.runAsync(
        `INSERT INTO transaction_items (id,transaction_id,product_id,product_name,qty,price,subtotal,parent_item_id,is_topping)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          parentId,
          id,
          c.productId,
          c.productName,
          c.qty,
          c.price,
          c.price * c.qty,
          null,
          0,
        ]
      );
      // Decrement stock
      await d.runAsync(
        "UPDATE products SET stock = stock - ? WHERE id=?",
        [c.qty, c.productId]
      );
      for (const t of c.toppings) {
        await d.runAsync(
          `INSERT INTO transaction_items (id,transaction_id,product_id,product_name,qty,price,subtotal,parent_item_id,is_topping)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            `txi_${uid()}`,
            id,
            t.productId,
            t.productName,
            t.qty * c.qty,
            t.price,
            t.price * t.qty * c.qty,
            parentId,
            1,
          ]
        );
        await d.runAsync(
          "UPDATE products SET stock = stock - ? WHERE id=?",
          [t.qty * c.qty, t.productId]
        );
      }
    }
  });

  return { id, code, total, subtotal, tax, change };
}

export async function listTransactions(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<Transaction[]> {
  const d = await getDb();
  const where: string[] = [];
  const args: any[] = [];
  if (opts?.from) {
    where.push("created_at >= ?");
    args.push(opts.from);
  }
  if (opts?.to) {
    where.push("created_at <= ?");
    args.push(opts.to);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return d.getAllAsync<Transaction>(
    `SELECT * FROM transactions ${w} ORDER BY created_at DESC LIMIT ?`,
    [...args, opts?.limit ?? 500]
  );
}

export async function getTransactionItems(txId: string): Promise<TxItem[]> {
  const d = await getDb();
  return d.getAllAsync<TxItem>(
    "SELECT * FROM transaction_items WHERE transaction_id=? ORDER BY is_topping",
    [txId]
  );
}

export async function dashboardSummary(): Promise<{
  todayCount: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  topProducts: { name: string; qty: number }[];
  lowStock: Product[];
  salesByDay: { date: string; total: number }[];
}> {
  const d = await getDb();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 6 * 86400000);
  const startOf7 = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const today = await d.getFirstAsync<{ c: number; rev: number }>(
    "SELECT COUNT(*) c, COALESCE(SUM(total),0) rev FROM transactions WHERE created_at >= ?",
    [startOfDay]
  );
  const week = await d.getFirstAsync<{ rev: number }>(
    "SELECT COALESCE(SUM(total),0) rev FROM transactions WHERE created_at >= ?",
    [startOf7]
  );
  const month = await d.getFirstAsync<{ rev: number }>(
    "SELECT COALESCE(SUM(total),0) rev FROM transactions WHERE created_at >= ?",
    [startOfMonth]
  );
  const top = await d.getAllAsync<{ name: string; qty: number }>(
    `SELECT product_name as name, SUM(qty) as qty
     FROM transaction_items
     WHERE is_topping = 0
     GROUP BY product_id
     ORDER BY qty DESC
     LIMIT 5`
  );
  const low = await d.getAllAsync<Product>(
    "SELECT * FROM products WHERE active=1 AND stock <= min_stock ORDER BY stock ASC LIMIT 5"
  );
  const daily = await d.getAllAsync<{ date: string; total: number }>(
    `SELECT substr(created_at,1,10) as date, SUM(total) as total
     FROM transactions
     WHERE created_at >= ?
     GROUP BY substr(created_at,1,10)
     ORDER BY date ASC`,
    [startOf7]
  );

  return {
    todayCount: today?.c ?? 0,
    todayRevenue: today?.rev ?? 0,
    weekRevenue: week?.rev ?? 0,
    monthRevenue: month?.rev ?? 0,
    topProducts: top ?? [],
    lowStock: low ?? [],
    salesByDay: daily ?? [],
  };
}
