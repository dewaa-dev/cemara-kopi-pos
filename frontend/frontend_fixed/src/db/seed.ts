/** Seed data for Cemara Kopi POS */

export const SEED_USERS = [
  {
    id: "user_admin",
    username: "admin",
    password: "admincemarakopi..",
    name: "Admin Cemara",
    role: "admin",
  },
  {
    id: "user_kasir",
    username: "kasir",
    password: "kasircemarakopi",
    name: "Kasir Cemara",
    role: "kasir",
  },
];

export const SEED_SETTINGS = [
  { key: "store_name", value: "Cemara Kopi" },
  { key: "store_address", value: "Jl. Cemara No. 1" },
  { key: "store_whatsapp", value: "0812-3456-7890" },
  {
    key: "receipt_footer",
    value: "Terima kasih telah berkunjung. Semoga harimu menyenangkan",
  },
  { key: "tax_percent", value: "0" },
  { key: "currency", value: "IDR" },
  { key: "logo", value: "" },
];

type SeedProduct = {
  id: string;
  name: string;
  category_id: string;
  cost_price: number;
  sell_price: number;
  stock: number;
  min_stock: number;
  is_topping?: boolean;
};

const minuman: { name: string; price: number }[] = [
  { name: "Susu Soda Jumbo", price: 10000 },
  { name: "Mega Mendung Ice", price: 10000 },
  { name: "Sweet Kokona", price: 7000 },
  { name: "Dancow", price: 7000 },
  { name: "Susu Jahe", price: 7000 },
  { name: "Kopi Susu Jahe", price: 7000 },
  { name: "Lemon Tea", price: 7000 },
  { name: "Joshua", price: 7000 },
  { name: "Milk Tea", price: 7000 },
  { name: "Thai Tea", price: 7000 },
  { name: "Red Velvet", price: 7000 },
  { name: "Kopi Jahe", price: 6000 },
  { name: "Kopi Susu Racik", price: 6000 },
  { name: "Good Day", price: 6000 },
  { name: "Wedang Uwuh", price: 6000 },
  { name: "Nutrisari", price: 5000 },
  { name: "Kopi Hitam", price: 5000 },
  { name: "Drink Beng-Beng", price: 5000 },
  { name: "Chocolatos", price: 5000 },
  { name: "Pop Ice", price: 5000 },
  { name: "Tora Moka", price: 5000 },
  { name: "Tora Susu", price: 5000 },
  { name: "White Coffee", price: 5000 },
  { name: "Milo", price: 5000 },
  { name: "HiLo", price: 5000 },
  { name: "Teh Jahe", price: 5000 },
  { name: "Es Lemon", price: 5000 },
  { name: "Es Jeruk", price: 5000 },
  { name: "Air Mineral", price: 4000 },
  { name: "Teh Hangat / Es Teh", price: 4000 },
];

const camilan: { name: string; price: number }[] = [
  { name: "Mix Platter", price: 15000 },
  { name: "Lumpia Udang", price: 10000 },
  { name: "Wonton", price: 10000 },
  { name: "Udang Rambutan", price: 10000 },
  { name: "Gyoza", price: 10000 },
  { name: "Sosis Bakar/Goreng", price: 10000 },
  { name: "Chicken Nugget", price: 10000 },
  { name: "Cireng Isi Ayam", price: 10000 },
  { name: "Pisang Coklat Keju", price: 10000 },
  { name: "Kentang Goreng", price: 10000 },
  { name: "Pentol Bakar/Goreng", price: 9000 },
  { name: "Cireng Salju", price: 8000 },
  { name: "Tahu Walik", price: 8000 },
];

const mie: { name: string; price: number }[] = [
  { name: "Pop Mie", price: 8000 },
  { name: "Mie Instan", price: 6000 },
];

const topping: { name: string; price: number }[] = [
  { name: "Sosis", price: 5000 },
  { name: "Telur", price: 3000 },
  { name: "Pentol", price: 2000 },
  { name: "Sayur", price: 1000 },
];

const slug = (n: string) =>
  n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export const SEED_PRODUCTS: SeedProduct[] = [
  ...minuman.map((p) => ({
    id: `prod_min_${slug(p.name)}`,
    name: p.name,
    category_id: "cat_minuman",
    cost_price: Math.round(p.price * 0.5),
    sell_price: p.price,
    stock: 100,
    min_stock: 10,
  })),
  ...camilan.map((p) => ({
    id: `prod_cam_${slug(p.name)}`,
    name: p.name,
    category_id: "cat_camilan",
    cost_price: Math.round(p.price * 0.55),
    sell_price: p.price,
    stock: 50,
    min_stock: 5,
  })),
  ...mie.map((p) => ({
    id: `prod_mie_${slug(p.name)}`,
    name: p.name,
    category_id: "cat_mie",
    cost_price: Math.round(p.price * 0.5),
    sell_price: p.price,
    stock: 50,
    min_stock: 5,
  })),
  ...topping.map((p) => ({
    id: `prod_top_${slug(p.name)}`,
    name: p.name,
    category_id: "cat_topping",
    cost_price: Math.round(p.price * 0.4),
    sell_price: p.price,
    stock: 100,
    min_stock: 10,
    is_topping: true,
  })),
];
