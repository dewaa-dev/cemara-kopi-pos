# Cemara Kopi POS - PRD

## Overview
Offline-first Android POS (Point of Sale) mobile app for "Cemara Kopi" — a kiosk selling drinks, snacks, and noodles. Built with Expo (React Native). All data stored locally in SQLite (expo-sqlite). No backend required.

## Tech Stack
- Expo SDK 54 + expo-router (file-based routing)
- expo-sqlite (local DB + seed)
- @gorhom/bottom-sheet, expo-linear-gradient, expo-image-picker
- AsyncStorage (session persistence)

## Brand Palette
- Primary `#2E7D32` (green) · Secondary `#4E342E` (brown) · Accent `#D4A017` (gold) · Background `#F7F7F7`

## Roles
- **Admin** — full access (CRUD produk, ubah pengaturan, lihat laporan)
- **Kasir** — transaksi, lihat produk, lihat laporan

## Features (MVP)
- **Login** — username/password (admin/admin123, kasir/kasir123)
- **Dashboard** — KPI hari ini (pendapatan, transaksi), grafik 7 hari, produk terlaris, stok hampir habis
- **Kasir** — search debounce, kategori chips (Minuman/Camilan/Mie), grid produk, sticky cart bar, topping picker untuk Pop Mie / Mie Instan, diskon, pajak (jika diset), 4 metode pembayaran (Tunai/QRIS/Transfer/E-Wallet), struk preview
- **Master Produk** — list semua menu Cemara Kopi yang sudah di-seed, CRUD untuk admin, upload foto via galeri, atur stok & min stok
- **Lainnya → Laporan** — filter periode (hari ini, 7 hari, bulan ini, semua), KPI total pendapatan/transaksi/diskon, detail tiap transaksi
- **Lainnya → Pengaturan** — Nama toko, alamat, WhatsApp, pajak, footer struk (admin only)

## Roadmap (Iterasi Berikutnya)
1. Cetak struk Bluetooth thermal 58/80mm (perlu test di device fisik)
2. Export laporan PDF/Excel
3. Cash Flow (kas masuk/keluar)
4. Draft Order per nama pelanggan
5. Backup/Restore + auto backup harian
6. DB Health Monitoring
7. SQLCipher encryption layer
