# Cemara Kopi POS - PRD

## Overview
Offline-first Android POS for "Cemara Kopi" — kiosk Minuman, Camilan, Mie & Topping. Built with Expo + SQLite. All data lives on device.

## Tech Stack
- Expo SDK 54 + expo-router (Tabs with hidden routes for sub-screens)
- expo-sqlite (local DB + seed)
- expo-file-system/legacy (backup/restore)
- expo-print + expo-sharing (PDF/CSV export)
- expo-image-picker (foto produk)
- @gorhom/bottom-sheet, expo-linear-gradient
- AsyncStorage (session persistence)

## Brand Palette
- Primary `#2E7D32` · Secondary `#4E342E` · Accent `#D4A017` · Background `#F7F7F7`

## Roles
- **Admin** (admin/admin123) — full access including backup/restore, DB health, settings
- **Kasir** (kasir/kasir123) — transaksi, lihat produk, laporan, cashflow, draft

## Features (v1.1)
### Core (MVP iter 1)
- **Login** — username/password dengan session persist
- **Dashboard** — KPI hari/minggu/bulan, grafik penjualan, top product, low stock
- **Kasir** — search, kategori chips, grid produk, topping picker (Pop Mie/Mie Instan), 4 metode bayar, struk preview
- **Master Produk** — CRUD + upload foto + seed semua menu Cemara Kopi
- **Lainnya (Hub)** — 2-column grid menuju semua menu lainnya

### v1.1 (iter 2)
- **Cash Flow** — kas masuk & keluar dengan 9 kategori pengeluaran (Belanja Bahan Baku, Gas LPG, Listrik, Air, Internet, Gaji, Transportasi, Perawatan, Lainnya), filter, search, CRUD
- **Draft Order** — simpan pesanan per nama pelanggan, lanjut bayar dari draft, otomatis tandai paid setelah transaksi sukses
- **Backup & Restore** — manual backup, auto backup harian (saat aplikasi dibuka jika last > 1 hari), share file backup, restore dengan replace SQLite
- **Database Health Monitoring** — status normal/warning/critical, statistik produk/kategori/transaksi/draft/user/cashflow, ukuran DB, warning jika backup > 3-7 hari
- **Laporan + Export PDF/Excel** — filter periode (today/week/month/all), export PDF via expo-print, export CSV via expo-sharing
- **Pengaturan Toko** — nama toko, alamat, WhatsApp, pajak %, footer struk

### Enkripsi
- Database tersimpan di internal Android storage (per-app sandbox)
- Architecture siap di-upgrade dengan SQLCipher pada build kustom

## Roadmap
- Cetak struk Bluetooth thermal 58/80mm (perlu device fisik)
- Sinkronisasi cloud (Google Drive)
- SQLCipher native build
- Combo suggestion (Mie + Topping bundle)
