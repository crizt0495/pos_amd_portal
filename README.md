# KasirPro — Monorepo

Dua produk yang **sengaja dipisah total**. Tidak ada satu baris kode pun yang dipakai
bersama antara keduanya.

| Project | Stack | Untuk siapa | Data |
| --- | --- | --- | --- |
| [`portal/`](./portal) | Next.js 14 (App Router) + Supabase + Tailwind + PWA, deploy **Vercel** | **Operator toko** (pembeli Serial Key) | PostgreSQL **Supabase** (cloud) |
| [`desktop/`](./desktop) | Electron + React + Vite + **better-sqlite3**, build **.exe NSIS** | **Pembeli akhir** (pemilik toko yang pakai kasir) | **SQLite lokal, 100% offline** |

```
pos_amd/
├── portal/                # PWA operator  -> generate serial key, komisi, profil
│   ├── src/app/           # (login) (app) api/activate api/licenses api/profile
│   ├── supabase/          # schema.sql (wajib) + seed.sql (opsional)
│   ├── scripts/           # check-supabase.mjs, create-demo-user.mjs
│   └── .env.example
├── desktop/               # Aplikasi kasir offline -> SQLite, aktivasi 1x online
│   ├── electron/          # main.js preload.js ipc.js db.js license.js hwid.js thermal.js config.js
│   ├── src/screens/       # Activation Kasir Produk Laporan
│   └── .env.example
├── tools/test/            # seluruh skrip uji (dijalankan dengan `npm test`)
└── package.json           # helper script monorepo
```

Pemisahannya tegas: **tidak ada fitur yang bercampur.**

- Portal **tidak** tahu apa itu kasir, keranjang, struk, atau produk.
- Desktop **tidak** tahu apa itu komisi, tier, dashboard, atau partner. Desktop hanya
  mengirim `serial_key` + `hwid` ke `POST /api/activate` milik portal.
- Satu-satunya jembatan keduanya adalah **satu endpoint HTTP** (lihat [Kontrak API](#3-kontrak-api-aktivasi)).

---

## Daftar isi

1. [Portal (PWA di Vercel)](#1-portal-pwa-di-vercel)
2. [Desktop (Aplikasi Kasir Offline)](#2-desktop-aplikasi-kasir-offline)
3. [Kontrak API aktivasi](#3-kontrak-api-aktivasi)
4. [Perintah monorepo](#4-perintah-monorepo-dari-root)
5. [Uji seluruh aplikasi](#5-uji-seluruh-aplikasi)
6. [Cara deploy](#6-cara-deploy)
7. [Alur bisnis singkat](#7-alur-bisnis-singkat)
8. [Status verifikasi](#8-status-verifikasi)
9. [Catatan keamanan](#9-catatan-keamanan)

---

## 1. Portal (PWA di Vercel)

PWA **mobile only**: `max-w-[430px]` di tengah, background putih, Bottom Nav tetap
3 menu: **Home | Aktivasi | Profile**.

### 1.1 Yang bisa dilakukan operator

| Menu | Isi |
| --- | --- |
| **Home** | Header `Home` + `Nama Toko ->` + ikon logout. Kartu 3 kolom `[sisa/jatah Sisa] [n Bundle] [n Aplikasi]`, kartu hitam **Total Komisi**, daftar **Riwayat Komisi** (baris 1: tanggal - paket - nama konsumen, baris 2 kanan: nominal komisi) |
| **Aktivasi** | Judul **Generate Serial Key**. Form: Nama, Telepon, Alamat, Pilih Paket (Bundle / Aplikasi Saja), Pilih Pilihan (Sekali / Langganan), tombol hitam **Generate Key**. Sukses → modal **Selamat Generate Key Berhasil** + kode + `Silahkan aktivasi ke Komputer Kasir` + tombol **Copy & Tutup** |
| **Profile** | Upload **Logo Toko** (Supabase Storage), Nama Toko, No HP, Alamat. Section **Penghargaan Title**: 4 mahkota Bronze/Silver/Gold/Platinum, yang aktiffull opacity, lainnya 30% |

Kartu Home:
- `sisa/jatah` = `license_quota` / (`license_quota` + `total_terjual`) → awal `5/5`, habis 1 key jadi `4/5`
- `n Bundle` = jumlah `licenses.paket_type = 'bundle'`
- `n Aplikasi` = jumlah `licenses.paket_type = 'app_only'`

Tingkat penghargaan (dipakai untuk menghitung komisi):

| Tier | Jumlah terjual | Rate komisi |
| --- | --- | --- |
| Bronze | 1–5 | 5% |
| Silver | 6–10 | 10% |
| Gold | 11–30 | 20% |
| Platinum | 30+ | 30% |

Komisi dasar: **Bundle Rp 100.000**, **Aplikasi Saja Rp 50.000** — dikali rate tier, lalu
di-*snapshot* ke kolom `licenses.komisi_amount` saat key dibuat (jadi riwayat tidak berubah
retroactive saat toko naik tier).

### 1.2 Struktur database

```sql
partners(
  id uuid, user_id uuid -> auth.users, email text unique,
  nama_toko text, no_hp text, alamat text, logo_url text,
  license_quota int default 5,   -- sisa jatah
  total_terjual int default 0,  -- dasar tier
  komisi_total int, status text, created_at, updated_at
)

licenses(
  id uuid, serial_key text unique, partner_id uuid -> partners,
  status text default 'unused',        -- unused | active | blocked | revoked
  hwid_locked text, hwid_locked_at, device_name, app_version, activated_at,
  paket_type text,                     -- bundle | app_only
  license_type text,                   -- sekali | langganan
  pembeli_nama text, pembeli_hp text, alamat text,
  komisi_amount int, tier text, tier_rate numeric,
  expires_at, created_at, updated_at
)
```

> Password **tidak** disimpan di `partners`. Kredensial dimiliki **Supabase Auth**
> (`auth.users.encrypted_password`); `partners.email` hanya salinan untuk dicari admin.
> Menyalin hash password ke tabel sendiri justru memperbesar risiko kebocoran.

### 1.3 Setup

```bash
cd portal
npm install
cp .env.example .env.local     # isi kuncinya
npx tsc --noEmit               # cek tipe
npm run dev                    # http://localhost:3000
```

Isi `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # gaya baru (recommended)
SUPABASE_SECRET_KEY=sb_secret_...                          # gaya baru, server only

# alias yang juga dibaca:
#   SUPABASE_URL  (ganti NEXT_PUBLIC_SUPABASE_URL)
#   SERVICE_KEY   (ganti SUPABASE_SECRET_KEY)
# kunci JWT gaya lama:
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
#   SUPABASE_SERVICE_ROLE_KEY=eyJ...

NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=KasirPro Portal
```

### 1.4 Database Supabase

1. Buka **Supabase Dashboard → SQL Editor → New query**
2. Tempel seluruh isi [`portal/supabase/schema.sql`](./portal/supabase/schema.sql) → **Run**

Schema itu membuat: tabel `partners` & `licenses`, function `generate_license()` /
`activate_license()`, RLS per-partner, storage bucket `store-logos`, dan trigger
`on_auth_user_created` (auto buat baris `partners` begitu user dibuat, kuota 5).
Aman dijalankan berulang (idempotent) dan sudah termasuk migrasi kolom versi lama.

Opsional — data contoh untuk mencoba semua tampilan:
[`portal/supabase/seed.sql`](./portal/supabase/seed.sql).

3. Buat akun toko di **Supabase → Authentication → Users → Add user**
   (centang **Auto Confirm User**) — baris `partners` dibuat otomatis oleh trigger.
   Dari CLI bisa langsung:

```bash
cd portal && npm run seed:user    # baca .env.local, buat toko@contoh.com / toko12345
node scripts/create-demo-user.mjs --email a@b.co --password rahasia --nama "Toko Saya"
```

   > **Jangan** insert `auth.users` manual lewat SQL: akun tanpa baris `auth.identities`
   > membuat login gagal dengan 500 "Database error querying schema". Buat lewat
   > dashboard / endpoint admin saja.

4. Topup kuota + nama toko:

```sql
update public.partners
   set nama_toko = 'Toko Berkah', no_hp = '08123456789',
       alamat = 'Jl. Merdeka No. 10', license_quota = 10
 where email = 'toko@contoh.com';
```

5. Pastikan semuanya siap:

```bash
cd portal && npm run check:supabase
```

Skrip itu menguji env, kunci, tabel, 4 RPC, bucket storage, dan daftar toko — lalu
memberi tahu persis apa yang masih kurang.

### 1.5 PWA

`@ducanh2912/next-pwa` menghasilkan service worker otomatis saat `next build`
(`public/sw.js` — sudah masuk `.gitignore` karena hasil generate). Manifest ada di
`portal/public/manifest.json` dan sengaja tidak ditimpa plugin lewat
`buildExcludes: [/manifest\.json$/]`. Icon dibuat tanpa dependensi: `npm run icons`.

---

## 2. Desktop (Aplikasi Kasir Offline)

### 2.1 Yang bisa dilakukan kasir

| Layar | Isi |
| --- | --- |
| **Aktivasi** | Input `KPRO-XXXX-XXXX-XXXX`, tampilkan HWID perangkat, aktivasi online 1x, tampilan **TERKUNCI** merah bila HWID beda |
| **Kasir** | Scan barcode / cari produk, keranjang, qty, diskon (%/Rp), metode bayar, hitung kembalian, cetak struk |
| **Produk** | CRUD produk, barcode, harga modal, stok (+/- cepat), peringatan stok menipis, tes printer |
| **Laporan** | Rentang tanggal, omzet/laba/transaksi/item, grafik omzet harian, produk terlaris, metode bayar, riwayat transaksi, detail, **batalkan transaksi**, cetak ulang struk |

### 2.2 Offline 100%

- Database: `better-sqlite3` → **`<userData>/kasir.db`**
  (Windows: `%APPDATA%\KasirPro\kasir.db`, macOS: `~/Library/Application Support/KasirPro/`, Linux: `~/.config/KasirPro/`)
- Tabel: `products`, `transactions`, `transaction_items`, `app_license`, `settings`
- Tidak ada koneksi internet setelah aktivasi. **Tidak ada kredensial Supabase di sisi ini.**
- Migration memakai `PRAGMA user_version`, mode WAL, `foreign_keys ON`.

### 2.3 Aktivasi & HWID lock

```
Desktop (main process)                Portal (Vercel)
  1. baca HWID  ->  node-machine-id (UUID motherboard) dinormalisasi jadi 32 hex
  2. POST /api/activate  ---------->  RPC activate_license()  (SECURITY DEFINER)
       { serial_key, hwid }            - tidak ada            -> 404 INVALID_KEY
                                         - status unused        -> active + kunci hwid (ACTIVATED)
                                         - status active & sama -> 200 ALREADY_ACTIVE
                                         - status active & beda -> 403 HWID_MISMATCH
  3. simpan ke app_license  <---------  { ok, success, code, message, license{...} }
  4. aplikasi offline selamanya
```

Setelah tersimpan, `check-license` hanya membandingkan **HWID lokal** — tanpa internet:

| Code | Arti | Tampilan aplikasi |
| --- | --- | --- |
| `OK` | Lisensi valid | Masuk POS Kasir |
| `NOT_ACTIVATED` | Belum pernah diaktivasi | Layar Aktivasi |
| `HWID_MISMATCH` | Aplikasi disalin ke komputer lain | **TERKUNCI**, minta reset ke toko |
| `EXPIRED` | Masa langganan habis | Peringatan di layar aktivasi |
| `INVALID_KEY` / `BLOCKED` | Key salah / diblokir | Pesan error di form |
| `NETWORK` / `TIMEOUT` | Tidak ada internet saat aktivasi | Wajib online 1x |

### 2.4 Setup & jalan

```bash
cd desktop
npm install                 # postinstall otomatis rebuild better-sqlite3 untuk Electron
cp .env.example .env        # isi PORTAL_VERCEL_URL
npm run dev                 # Vite + Electron (dev tools terbuka)
npm run build               # typecheck + bundle renderer
```

`PORTAL_VERCEL_URL` dicari berurutan dari:

1. `process.env.PORTAL_VERCEL_URL` (atau alias `VITE_API_URL`)
2. `electron/build-config.json` — ditempel saat build, ikut ter-*pack* ke dalam `.exe`
3. `<userData>/config.json` (`{"portalUrl": "..."}`) — bisa diubah pengguna
4. `.env` di folder aplikasi
5. nilai bawaan `DEFAULT_PORTAL_URL` di `electron/config.js`

### 2.5 Build installer Windows

Ada tiga cara, dari yang paling otomatis sampai paling manual:

**A. GitHub Actions (sudah terpasang, tinggal jalankan)**

```bash
git tag -a v1.0.0 -m "rilis" && git push origin v1.0.0
```

Push tag `v*` otomatis memicu workflow `.github/workflows/build-desktop.yml` di runner
**Windows asli** → hasil `release/KasirPro-Setup-1.0.0.exe` diunggah sebagai artifact
`KasirPro-Setup-windows` (tab **Actions → Build Desktop Windows**, simpan 30 hari).

Supaya installer memakai domain Vercel yang benar, set dulu **secret** ini
(`Settings → Secrets and variables → Actions → New repository secret`):
`PORTAL_VERCEL_URL = https://domain-anda.vercel.app` — kalau kosong, dipakai
`https://kasirpro-portal.vercel.app` (placeholder dari `electron/config.js`).

**B. Manual dengan URL portal ter-pack (disarankan di mesin Windows)**

```bash
cd desktop
npm run set-portal -- https://domain-anda.vercel.app   # menulis electron/build-config.json
npm run dist:win        # -> release/KasirPro-Setup-1.0.0.exe   (NSIS, x64)
```

**C. Run workflow manual** dari tab **Actions → Build Desktop Windows → Run workflow**
(isi `portal_url` bila perlu).

> **Penting:** paket NSIS hanya bisa dirakit di **Windows**, atau di Linux/macOS yang punya
> `wine` terpasang (electron-builder memakai `rcedit`/`signtool.exe` untuk menancapkan icon &
> versi ke dalam `.exe`). Di Linux tanpa wine, proses berhenti di tahap
> `building target=nsis ... wine process failed ENOENT`.
>
> Yang **sudah terverifikasi** di Linux tanpa wine: `npm run typecheck`, `npm run build`
> (bundle renderer), dan `electron-builder --win --dir` menghasilkan `release/win-unpacked`
> berisi `KasirPro.exe` + `resources/app.asar` dengan
> `app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node` di dalamnya.
>
> `better-sqlite3` sudah di-*rebuild* otomatis oleh `postinstall` (`electron-builder
> install-app-deps`) dan di-`asarUnpack`, jadi komputer pengguna tidak butuh toolchain apa pun.

### 2.6 Cetak struk thermal

Dua jalur, otomatis pilih:

1. **ESC/POS langsung** — bila `PRINTER_PORT` diisi **dan** paket opsional
   `node-thermal-printer` terpasang: `192.168.1.10:9100`, `COM3`, `/dev/usb/lp0`
2. **Dialog printer Windows** (bawaan, tanpa dependensi) — struk dirender HTML 58mm
   lalu dicetak lewat `webContents.print()`

Uji printer kapan saja dari **Produk → Tes Printer**.

---

## 3. Kontrak API aktivasi

`POST https://<portal>/api/activate`

**Request** (body `camelCase` juga diterima agar klien tidak pernah gagal karena format)

```json
{
  "serial_key": "KPRO-ABCD-2345-6XYZ",
  "hwid": "3F2A9C10B8D7E6F5A4B3C2D1E0F9A8B7C",
  "device_name": "Windows DESKTOP-ABC Intel i5",
  "app_version": "1.0.0"
}
```

**Response sukses (200)**

```json
{
  "ok": true,
  "success": true,
  "code": "ACTIVATED",
  "message": "Serial Key berhasil diaktifkan dan terkunci ke perangkat ini.",
  "license": {
    "serial_key": "KPRO-ABCD-2345-6XYZ",
    "partner_id": "…",
    "nama_toko": "Toko Berkah",
    "pembeli_nama": "Budi",
    "paket_type": "bundle",
    "license_type": "sekali",
    "status": "active",
    "hwid_locked": "3F2A…B7C",
    "locked_now": true,
    "activated_at": "2025-11-10T03:20:00.000Z",
    "expires_at": null
  },
  "locked_hwid": null,
  "server_time": "2025-11-10T03:20:00.000Z"
}
```

`ok` dan `success` selalu sama — dua-duanya disediakan supaya klien versi mana pun bisa
membacanya.

**Response gagal** — bentuknya sama, `ok/success` = `false`:

| HTTP | `code` | `message` |
| --- | --- | --- |
| 404 | `INVALID_KEY` | Serial Key tidak ditemukan. Periksa kembali kode dari toko Anda. |
| 403 | `HWID_MISMATCH` | Lisensi terikat perangkat lain. Aktifkan di komputer kasir yang sama. |
| 403 | `BLOCKED` | Serial Key ini telah diblokir. Hubungi toko Anda. |
| 403 | `EXPIRED` | Masa langganan Serial Key ini sudah habis. Hubungi toko Anda. |
| 422 | `INVALID_KEY` | Format/badan permintaan tidak valid |
| 500 | `NETWORK` | Gagal menghubungi database portal |

Saat `HWID_MISMATCH`, field `locked_hwid` berisi HWID yang sudah terdaftar, supaya
aplikasi bisa menunjuk perangkatmana yang Holds lock.

Endpoint ini mengizinkan CORS `*` (dipanggil aplikasi desktop, bukan browser) dan
mengembalikan `Access-Control-Allow-Headers: Content-Type`.

---

## 4. Perintah monorepo (dari root)

```bash
npm run setup          # install portal + desktop
npm run dev:portal     # Next.js dev
npm run build:portal   # next build
npm run dev:desktop    # Vite + Electron
npm run build:desktop  # typecheck + bundle renderer
npm run dist:desktop   # build .exe NSIS
npm run typecheck      # typecheck kedua project
npm test               # UJI SELURUH APLIKASI (lihat bagian 5)
```

Monorepo ini **bukan npm workspaces** — sengaja dipisah agar build native
`better-sqlite3` milik Electron tidak pernah tersentuh oleh dependensi portal.

---

## 5. Uji seluruh aplikasi

```bash
npm test                # semua bagian
npm run test:statis     # hanya pemeriksaan statis
npm run test:portal     # statis + portal
npm run test:desktop    # semua kecuali portal
```

Runner: [`tools/test/run-all.mjs`](./tools/test/run-all.mjs). Yang dijalankan:

| Bagian | Isi |
| --- | --- |
| **A. Statis** | syntax `electron/*.js`, tidak ada karakter asing (CJK) di file sumber, tidak ada kunci Supabase asli yang bocor |
| **B. Portal** | `tsc --noEmit`, keberadaan `.env.example`/`schema.sql`/`seed.sql`/ikon/manifest, `next build`, 4 route API ada, service worker ter-generate, `check:supabase` |
| **C. Desktop** | `tsc --noEmit`, `vite build`, `build/icon.png` benar-benar PNG 512×512, 29 channel IPC cocok 1:1 dengan `preload.js`, konfigurasi portal (`build-config.json`, alias `VITE_API_URL`) |
| **D. Fungsi** | 36 tes SQLite, tes HWID + normalisasi serial, e2e renderer (POS/produk/laporan/void), kontrak desktop↔portal (`license.js` asli vs mock yang meniru SQL), UI aktivasi + layar terkunci |
| **E. Paket** | `electron-builder --win --dir` → `KasirPro.exe` + `app.asar` + native module ter-*unpack*. Di Windows otomatis jadi `npm run dist:win` dan mengecek `.exe` installer |

Hasil terakhir: **36/36 lulus** (`npm test`).

Harness-nya tersimpan permanen di `tools/test/`, jadi bisa dijalankan ulang kapan saja:

```bash
cd desktop
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron ../tools/test/db-smoke.js
ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron ../tools/test/hwid-smoke.js
./node_modules/electron/dist/electron --no-sandbox ../tools/test/e2e-test.js
./node_modules/electron/dist/electron --no-sandbox ../tools/test/contract-test.cjs
./node_modules/electron/dist/electron --no-sandbox ../tools/test/ui-activation-test.cjs
```

Uji `contract-test.cjs` dan `ui-activation-test.cjs` menyalakan
[`tools/test/mock-portal.cjs`](./tools/test/mock-portal.cjs) — server kecil yang meniru
persis state machine `activate_license()` di `schema.sql`, lalu kode desktop yang asli
ditembak ke sana. Dengan begitu **seluruh kemungkinan jawaban server** (ACTIVATED,
ALREADY_ACTIVE, HWID_MISMATCH, BLOCKED, EXPIRED, INVALID_KEY, NETWORK) teruji tanpa
menyentuh Supabase.

Uji **live** melawan portal + Supabase sungguhan (butuh portal jalan di `localhost:3000`
dan akun demo sudah di-seed) tersedia sebagai harness terpisah, bukan bagian `npm test`:

```bash
cd desktop
./node_modules/electron/dist/electron --no-sandbox ../tools/test/live-portal-contract.cjs
```

Validator round-trip API lengkap (login → generate key → aktivasi → HWID mismatch →
profil → logo → kuota) dijalankan langsung dari koneksi Postgres ke Supabase dan portal
lokal — sudah dieksekusi dan **semua lulus** sebelum repo ini di-push (circle `30/30`).

---

## 6. Cara deploy

### Portal ke Vercel

Deploy sudah **selesai dan terverifikasi live** pada `https://pos-amd.vercel.app`.
Pengaturan proyek yang dipakai (ada di `vercel.json` root repo):

- **Root Directory**: `portal`  (`"projectSettings": { "rootDirectory": "portal" }`)
- Framework preset: **Next.js**
- Env vars (production/preview/development): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_NAME`

Untuk proyek baru / re-import:

```bash
git push origin main     # Git integration: Vercel otomatis build (root = portal)
# atau deploy manual dari CLI:
cd portal && npx vercel --prod
```

`.vercelignore` di root repo mencegah file berat (node_modules, dist, release,
.next) ikut terunggah ke Vercel.

Hasil verifikasi terhadap domain produksi (tidak pakai localhost sama sekali):

- `GET /  → 307 → /login` | `/login` 200 | `/manifest.json` 200 |
  `/icons/icon-192.png` 200 | `/sw.js` 200
- Round-trip API penuh (login → generate → aktivasi → mismatch → profil → logo):
  **30/30 lulus**
- Kontrak desktop asli melawan `https://pos-amd.vercel.app`: **17/17 lulus**

### Desktop ke Windows

```bash
cd desktop
npm run set-portal -- https://pos-amd.vercel.app
npm run dist:win
```

atau pakai `.github/workflows/build-desktop.yml` (run manual dari tab Actions).
Agar installer memakai domain yang benar, set secret Actions
`PORTAL_VERCEL_URL = https://pos-amd.vercel.app` lalu Re-run workflow (atau
push tag `v1.0.1`) — hasil `.exe` diunduh sebagai artifact.

---

## 7. Alur bisnis singkat

1. Operator daftar/login di **portal** (akun dibuat lewat Supabase Auth, baris `partners` otomatis dibuat dengan `license_quota = 5`).
2. Admin memberi `license_quota` (mis. 10) dan `nama_toko`.
3. Operator buka **Aktivasi**, isi data pembeli + paket, klik **Generate Key** →
   portal membuat `KPRO-XXXX-XXXX-XXXX`, mengunci kuota, menghitung komisi sesuai tier, dan
   menampilkan modal sukses + tombol **Copy & Tutup**.
4. Operator kirim key ke pembeli (via WhatsApp, dll).
5. Pembeli masukkan key di aplikasi **desktop** → aplikasi aktif di komputer itu saja.
6. Sisa kuota & total komisi langsung berubah di layar **Home** portal.

---

## 8. Status verifikasi

Semua di bawah ini sudah dijalankan di mesin ini dan **lulus**:

| Yang diuji | Hasil |
| --- | --- |
| `portal`: `tsc --noEmit` | bersih |
| `portal`: `next build` | sukses (12 route, service worker ke `public/sw.js`) |
| `portal`: `check:supabase` | **hijau semua** (env, kunci, tabel, 4 RPC, bucket, toko terdaftar) |
| `portal`: round-trip API asli vs Supabase (login GoTrue → generate key → komisi tier → aktivasi → ALREADY_ACTIVE → HWID_MISMATCH → INVALID_KEY → profil → upload logo → kuota/komisi) | **30/30 lulus** |
| `portal`: **deploy Vercel live** — `https://pos-amd.vercel.app` (login, PWA manifest/icon/sw, generate, aktivasi, HWID mismatch, profil, logo) | **round-trip 30/30 + rute PWA 200** |
| `desktop`: `npm install` | 493 paket, `better-sqlite3` di-rebuild untuk Electron 34.5.8 |
| `desktop`: `tsc --noEmit` | bersih |
| `desktop`: `vite build` | sukses (~210 kB JS + 25 kB CSS, tanpa warning) |
| `desktop`: 36 tes SQLite (produk, transaksi, void, laporan, lisensi, settings) | semua lulus |
| `desktop`: HWID + normalisasi Serial Key | semua lulus |
| `desktop`: 29 channel IPC preload vs `ipc.js` | cocok 1:1 |
| `desktop`: e2e headless — CRUD produk, transaksi + potong stok, void + restore stok, laporan, 4 tab UI, screenshot | semua lulus |
| `desktop`: kontrak `/api/activate` — 26 uji semua kode server | semua lulus |
| `desktop`: UI aktivasi + HWID mismatch + aplikasi ter-copy → layar terkunci | semua lulus |
| `desktop`: kontrak live ke **Vercel** (`license.js` asli + HWID `node-machine-id` → `https://pos-amd.vercel.app`) | **17/17 lulus** |
| `desktop`: `electron-builder --win --dir` | sukses (asar + `better_sqlite3.node` ter-unpack) |
| **GitHub Actions CI** | **passing** (typecheck portal+desktop, build, tes statis, SQLite, HWID) |
| **GitHub Actions Build Desktop Windows (tag `v1.0.0`)** | **success** (installer NSIS diunduh sebagai artifact) |
| **`npm test` (keseluruhan)** | **36/36 lulus** |

### 8.1 Yang hanya bisa dilakukan operator

| # | Langkah | Catatan |
| --- | --- | --- |
| 1 | Schema + akun demo sudah diterapkan ke Supabase oleh pengembang (via koneksi Postgres) | `check:supabase` hijau, login demo `toko@contoh.com` |
| 2 | Deploy `portal` ke Vercel | **sudah selesai & live** di `pos-amd.vercel.app` (vercel.json sudah mengatur root dir `portal`) |
| 3 | Set secret Actions `PORTAL_VERCEL_URL = https://pos-amd.vercel.app` | `Settings → Secrets → Actions` |
| 4 | Re-run workflow "Build Desktop Windows" (atau push tag `v1.0.1`) | `.exe` dari tag `v1.0.0` masih memakai URL placeholder `kasirpro-portal.vercel.app` — perlu rebuild agar menempelkan domain asli |
| 5 | Uji installer di komputer kasir nyata (Windows) | key demo `KPRO-DEMO-AAAA-0001` tersedia dan sudah terbukti aktivasi via Vercel |

Setelah deploy, `npm run check:supabase` tetap **hijau** — itu tanda portal siap dipakai.

### 8.2 Yang tidak bisa diuji dari mesin pengembang ini

- **Menjalankan** installer `.exe` NSIS hasil Actions di Windows sungguhan
  (build-nya otomatis jalan di runner Windows; verifikasi pemakaian akhir
  tetap butuh komputer Windows).
- pembayaran/pengiriman key nyata (WhatsApp, dll) — alur manual operator.

Keduanya di-*cover* runner: di Windows `npm test` otomatis menjalankan
`npm run dist:win` dan memeriksa `.exe` hasilnya.

---

## 9. Catatan keamanan

- `SUPABASE_SECRET_KEY` hanya boleh ada di server portal (`.env.local` / Vercel env).
  Jangan pernah masuk ke `NEXT_PUBLIC_*` atau ke folder `desktop/`.
- Format `.env*` sudah masuk `.gitignore`; hanya `.env.example` yang di-commit.
  `npm test` juga memindai file sumber untuk memastikan tidak ada kunci asli yang bocor.
- `desktop/electron/build-config.json` (URL portal hasil build) tidak di-commit; pakai
  `npm run set-portal`.
- Aktivasi butuh internet **1x**; setelah itu aplikasi benar-benar offline.
  Ini bukan DRM anti-tamper sempurna — proteksi HWID hanya sekuat
  kemampuan aplikasi offline untuk membaca HWID-nya sendiri, tapi cukup
  menahan aplikasi yang disalin mentah ke komputer lain.
- `activate_license()` adalah `SECURITY DEFINER` dan tidak diberi `grant execute`
  ke `anon`/`authenticated` — hanya `service_role` (dipakai Route Handler server).
