# KasirPro

Aplikasi POS (Point of Sale) kasir *fullstack* berbasis **Next.js 14 (App Router)** dan **Electron**. Dibangun khusus untuk skenario offline-first dengan sistem aktivasi lisensi berbasis Hardware ID (HWID).

## Fitur Utama

- **Offline-First**: Semua transaksi dan produk disimpan secara lokal di browser/perangkat menggunakan [Dexie.js](https://dexie.org/) (IndexedDB). Aplikasi bisa berjalan sepenuhnya tanpa internet.
- **Hardware-Locking**: Lisensi diikat ke identitas fisik perangkat (Motherboard/BIOS UUID) via `node-machine-id` saat berjalan di Electron. Mencegah duplikasi atau pencurian lisensi dengan cara *copy-paste* folder aplikasi.
- **Cloud Sync**: Sinkronisasi latar belakang otomatis ke Supabase (PostgreSQL) saat perangkat kembali *online*.
- **Role-Based Access (RLS)**:
  - **Super Admin**: Mengatur stok lisensi, memantau *partner*, dan merekap keuangan.
  - **Partner (Toko Komputer)**: Membeli kuota lisensi dari admin, mengaktifkan lisensi untuk pembeli, dan mengelola toko pelanggan.
  - **Kasir (Client)**: Menggunakan aplikasi murni secara *offline*, diaktivasi menggunakan *Serial Key*.
- **Dukungan Printer Thermal 58mm**: Mencetak struk lokal melalui `node-thermal-printer` menggunakan protokol ESC/POS langsung dari Electron, atau melalui fitur *print browser* (fallback).

---

## Prasyarat

- **Node.js**: `v18.17.0` atau yang lebih baru (disarankan `v20`).
- **Supabase**: Proyek Supabase aktif (untuk sinkronisasi *cloud* dan autentikasi admin/partner).

---

## Konfigurasi Lingkungan

Aplikasi ini membutuhkan dua jenis berkas `.env` karena arsitektur Next.js Standalone + Electron.

### 1. `.env.local` (Digunakan saat masa pengembangan - `npm run dev`)
Buat berkas `.env.local` di *root* proyek (atau cukup ubah nama `.env.example` lalu isi nilainya):

```ini
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5c...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5c...
```

### 2. `.env.production` (Digunakan di paket produksi - `KasirPro.exe`)
Buat berkas `.env.production` dengan format yang sama seperti `.env.local`. Berkas ini **harus** ada sebelum menjalankan `npm run build:exe`. Skrip pembangunan (*build*) akan menyertakan berkas ini ke dalam bundel `.exe` agar *main process* Electron dapat membaca `SUPABASE_SERVICE_ROLE_KEY` pada *runtime*.

---

## Inisialisasi Database (Supabase)

1. Buka *dashboard* Supabase proyek Anda.
2. Masuk ke menu **SQL Editor**.
3. Buka dan salin seluruh isi berkas `supabase/schema.sql` dari *repository* ini.
4. Jalankan (*Run*) kueri tersebut. Kueri ini sepenuhnya *idempotent* (aman dijalankan ulang) dan akan membuat semua tabel, indeks, kebijakan RLS, serta fungsi RPC yang dibutuhkan KasirPro.

### Membuat Akun Super Admin

Setelah skema dibuat, Anda perlu mempromosikan pengguna pertama menjadi Super Admin:
1. Daftar (*Sign Up*) melalui halaman `/login` aplikasi KasirPro, **ATAU** buat *user* baru melalui *dashboard* Supabase Auth.
2. Di SQL Editor Supabase, jalankan:
   ```sql
   UPDATE public.profiles
   SET role = 'super_admin'
   WHERE email = 'email-anda@domain.com';
   ```

---

## Skrip yang Tersedia

### Masa Pengembangan (*Development*)

```bash
# Menjalankan Next.js saja di browser (Mode Web)
npm run dev

# Menjalankan Next.js + jendela Electron (Mode Desktop)
npm run electron:dev
```
> *Catatan: Akses fitur `node-machine-id` (pembacaan HWID asli) dan `node-thermal-printer` (cetak ESC/POS) hanya berfungsi saat menjalankan `npm run electron:dev`.*

### Pemaketan Produksi (*Build*)

```bash
# Membuat installer KasirPro-Setup.exe (Windows)
npm run build:exe

# Membuat executable AppImage (Linux)
npm run build:linux
```
**Perhatian:** 
Proses `build:exe` secara otomatis akan menjalankan `next build` (menghasilkan bundel *standalone*), menjalankan skrip `prepare-standalone.mjs`, lalu mengemasnya menggunakan `electron-builder`. 

Hasil pemaketan akan disimpan di folder `release/`.

---

## Arsitektur & Sinkronisasi

1. **Pembuatan Transaksi (Offline)**
   Setiap kali transaksi baru selesai, transaksi tersebut ditulis terlebih dulu ke dalam `dexie` (`kasirpro_local`) dengan penanda `_dirty = 1`.
2. **Mesin Sinkronisasi**
   Setiap 30 detik (atau ketika koneksi jaringan pulih), *sync engine* akan:
   - Mengambil data transaksi dengan `_dirty = 1` dari basis data lokal.
   - Mengirimkannya ke titik akhir `/api/pos/sync` bersama dengan `Serial Key` dan `HWID`.
   - Mengubah tanda `_dirty = 0` apabila pengiriman berhasil.
3. **Verifikasi perangkat**
   Jika `HWID` yang dikirimkan oleh klien tidak cocok dengan `hwid_locked` yang ada di Supabase, *server* akan menolak sinkronisasi (mencegah *clone* instalasi). Lisensi harus diputuskan (*Deactivate*) lebih dulu melalui panel Super Admin atau Partner agar perangkat baru dapat memakai `Serial Key` tersebut.

---

## Mengelola Tipe Data (*Typings*) Supabase

Setiap kali Anda mengubah skema basis data di Supabase secara mandiri, jangan lupa memperbarui berkas *typing* agar TypeScript tetap sejalan:
```bash
npm run supabase:types
```
*(Pastikan URL dan Kunci anon Supabase sudah diset pada `.env.local`)*

---

## Hak Cipta
Copyright © 2026 KasirPro. All rights reserved.
