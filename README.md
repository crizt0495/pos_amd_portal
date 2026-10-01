# KasirPro — Portal Operator

**Live: <https://pos-amd-portal.vercel.app>**

PWA **mobile only** untuk operator toko: daftar serial key, mengelola komisi, dan profil
toko. Deploy di **Vercel**, data di **Supabase**.

> **Aplikasi kasir (desktop Electron) sudah digantikan web POS** — lihat
> [KasirPro POS Web](https://github.com/crizt0495/pos_amd_desktop)
> (`pos_amd_desktop`, layout desktop, Supabase). Folder `desktop/`, workflow
> `build-desktop.yml`, dan harness uji Electron tidak lagi ada di repo ini.
> Installer rilis historis **v1.0.1** masih tersedia di
> <https://github.com/crizt0495/pos_amd/releases>.

## Daftar isi

1. [Portal (PWA di Vercel)](#1-portal-pwa-di-vercel)
2. [Struktur database](#2-struktur-database)
3. [Kontrak API aktivasi](#3-kontrak-api-aktivasi)
4. [Perintah repo (dari root)](#4-perintah-repo-dari-root)
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
| **Profile** | Icon toko bulat (warna ikut tier) + Nama Toko di bawahnya, lalu form Nama Toko, No HP, Alamat, tombol **Simpan** (sticky di HP). Section **Penghargaan Title**: 4 mahkota Bronze/Silver/Gold/Platinum, yang aktiffull opacity, lainnya 30% |

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

### 1.2 Setup

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

### 1.3 Database Supabase

1. Buka **Supabase Dashboard → SQL Editor → New query**
2. Tempel seluruh isi [`portal/supabase/schema.sql`](./portal/supabase/schema.sql) → **Run**

Schema itu membuat: tabel `partners` & `licenses`, function `generate_license()` /
`activate_license()`, RLS per-partner, dan trigger
`on_auth_user_created` (auto buat baris `partners` begitu user dibuat, kuota 5).
Aman dijalankan berulang (idempotent) dan sudah termasuk migrasi kolom versi lama.

Opsional — data contoh untuk mencoba semua tampilan:
[`portal/supabase/seed.sql`](./portal/supabase/seed.sql).

3. Buat akun toko di **Supabase → Authentication → Users → Add user**
   (centang **Auto Confirm User**) — baris `partners` dibuat otomatis oleh trigger.
   Dari CLI bisa langsung:

```bash
cd portal && npm run seed:user    # baca .env.local, buat akun demo
node scripts/create-demo-user.mjs --email a@b.co --password rahasia --nama "Toko Saya" --username toko
```

   > **Jangan** insert `auth.users` manual lewat SQL: akun tanpa baris `auth.identities`
   > membuat login gagal dengan 500 "Database error querying schema". Buat lewat
   > dashboard / endpoint admin saja.

   > **Login**: pakai **Username** (kolom `partners.username`, default = email sebelum `@`)
   > + password. Email toko juga tetap bisa dipakai di kolom yang sama. Halaman login
   > selalu menampilkan info **Akun Demo** (`demo` / `toko12345`) + tombol *Isi otomatis*.

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

### 1.4 PWA

`@ducanh2912/next-pwa` menghasilkan service worker otomatis saat `next build`
(`public/sw.js` — sudah masuk `.gitignore` karena hasil generate). Manifest ada di
`portal/public/manifest.json` dan sengaja tidak ditimpa plugin lewat
`buildExcludes: [/manifest\.json$/]`. Icon dibuat tanpa dependensi: `npm run icons`.

---

## 2. Struktur database

```sql
partners(
  id uuid, user_id uuid -> auth.users, email text unique,
  nama_toko text, no_hp text, alamat text,
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
aplikasi bisa menunjuk perangkat mana yang memegang lock.

Endpoint ini mengizinkan CORS `*` (dipanggil aplikasi kasir, bukan browser) dan
mengembalikan `Access-Control-Allow-Headers: Content-Type`.

---

## 4. Perintah repo (dari root)

```bash
npm run setup          # install portal
npm run dev:portal     # Next.js dev
npm run build:portal   # next build
npm run typecheck      # typecheck portal
npm test               # UJI SELURUH APLIKASI (lihat bagian 5)
```

---

## 5. Uji seluruh aplikasi

```bash
npm test                # semua bagian
npm run test:statis     # hanya pemeriksaan statis
npm run test:portal     # statis + portal
```

Runner: [`tools/test/run-all.mjs`](./tools/test/run-all.mjs). Yang dijalankan:

| Bagian | Isi |
| --- | --- |
| **A. Statis** | tidak ada karakter asing (CJK) di file sumber, tidak ada kunci Supabase asli yang bocor |
| **B. Portal** | `tsc --noEmit`, keberadaan `.env.example`/`schema.sql`/`seed.sql`/ikon/manifest, `next build`, 4 route API ada, service worker ter-generate, `check:supabase` |

---

## 6. Cara deploy

Deploy sudah **selesai dan terverifikasi live** di
**<https://pos-amd-portal.vercel.app>** (tautan otomatis).
Pengaturan proyek yang dipakai (ada di `vercel.json` root repo):

- **Root Directory**: `portal`  (`"projectSettings": { "rootDirectory": "portal" }`)
- Framework preset: **Next.js**
- Env vars (production/preview/development): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_NAME`

**Auto-deploy otomatis (GitHub Actions)** — workflow `.github/workflows/deploy-vercel.yml`
langsung men-deploy ke production setiap push ke `main` yang menyentuh folder `portal/`.

Aktifkan sekali dengan membuat **satu secret** di repo
(`Settings → Secrets and variables → Actions → New repository secret`):

```
Name : VERCEL_TOKEN
Value: token dari https://vercel.com/account/settings/tokens
```

Org & Project ID sudah tertanam di workflow (bukan rahasia). Selama `VERCEL_TOKEN`
belum diisi, step deploy otomatis di-*skip* tanpa error.

Untuk deploy manual:

```bash
npm run deploy          # WAJIB dari ROOT repo (bukan dari dalam portal/)
                        # = vercel deploy --prod dari root; memakai vercel.json
npm run deploy:preview  # deployment preview (opsional)
git push origin main     # (jika Git auto-deploy diaktifkan di Dashboard Vercel)
```

> **Jangan** menjalankan `vercel deploy` dari dalam folder `portal/` — karena
> Root Directory proyek sudah `portal`, upload dari situ membuat Vercel mencari
> `portal/portal` dan gagal ("Root Directory 'portal' does not exist").
> Selalu deploy dari root repo, atau aktifkan Git auto-deploy di
> Dashboard → Project → Settings → Git.

`.vercelignore` di root repo mencegah file berat (node_modules, dist, release,
.next) ikut terunggah ke Vercel.

Hasil verifikasi terhadap domain produksi (tidak pakai localhost sama sekali):

- `GET /  → 307 → /login` | `/login` 200 | `/manifest.json` 200 |
  `/icons/icon-192.png` 200 | `/sw.js` 200
- Round-trip API penuh (login → generate → aktivasi → mismatch → profil):
  **30/30 lulus**
- API aktivasi melawan <https://pos-amd-portal.vercel.app>: **17/17 lulus**

---

## 7. Alur bisnis singkat

1. Operator daftar/login di **portal** (akun dibuat lewat Supabase Auth, baris `partners` otomatis dibuat dengan `license_quota = 5`).
2. Admin memberi `license_quota` (mis. 10) dan `nama_toko`.
3. Operator buka **Aktivasi**, isi data pembeli + paket, klik **Generate Key** →
   portal membuat `KPRO-XXXX-XXXX-XXXX`, mengunci kuota, menghitung komisi sesuai tier, dan
   menampilkan modal sukses + tombol **Copy & Tutup**.
4. Operator kirim key ke pembeli (via WhatsApp, dll).
5. Pembeli pakai key di aplikasi kasir (web POS `pos_amd_desktop` atau versi desktop
   v1.0.1 lama) → aplikasi aktif.
6. Sisa kuota & total komisi langsung berubah di layar **Home** portal.

---

## 8. Status verifikasi

Semua di bawah ini sudah dijalankan di mesin ini dan **lulus**:

| Yang diuji | Hasil |
| --- | --- |
| `portal`: `tsc --noEmit` | bersih |
| `portal`: `next build` | sukses (12 route, service worker ke `public/sw.js`) |
| `portal`: `check:supabase` | **hijau semua** (env, kunci, tabel, 4 RPC, toko terdaftar) |
| `portal`: round-trip API asli vs Supabase (login GoTrue → generate key → komisi tier → aktivasi → ALREADY_ACTIVE → HWID_MISMATCH → INVALID_KEY → profil → kuota/komisi) | **30/30 lulus** |
| `portal`: **deploy Vercel live** — <https://pos-amd-portal.vercel.app> (login, PWA manifest/icon/sw, generate, aktivasi, HWID mismatch, profil) | **round-trip 30/30 + rute PWA 200** |
| **Portal: Lighthouse** (login/home/aktivasi/profile, mobile) | **A11y 100 · Best Practices 100 · SEO 100** di semua halaman; Performance 98–100 (turunan Next.js runtime) |
| **Portal: responsif semua perangkat** (375 · 768 · 1366 · 1920 px × 4 halaman) | **16/16 lulus** — tanpa overflow horizontal, kolom terkunci tengah, bottom nav selalu terlihat |
| **GitHub Actions CI** | **passing** (typecheck portal, build, tes statis, Supabase) |
| **`npm test` (keseluruhan)** | **lulus** |

### 8.1 Yang hanya bisa dilakukan operator

| # | Langkah | Catatan |
| --- | --- | --- |
| 1 | Schema + akun demo sudah diterapkan ke Supabase oleh pengembang (via koneksi Postgres) | `check:supabase` hijau, login demo `demo / toko12345` (atau email) |
| 2 | Deploy `portal` ke Vercel | **sudah selesai & live** di <https://pos-amd-portal.vercel.app> (vercel.json sudah mengatur root dir `portal`) |

---

## 9. Catatan keamanan

- `SUPABASE_SECRET_KEY` hanya boleh ada di server portal (`.env.local` / Vercel env).
  Jangan pernah masuk ke `NEXT_PUBLIC_*`.
- Format `.env*` sudah masuk `.gitignore`; hanya `.env.example` yang di-commit.
  `npm test` juga memindai file sumber untuk memastikan tidak ada kunci asli yang bocor.
- `generate_license()` dan `activate_license()` adalah `SECURITY DEFINER` dan tidak diberi
  `grant execute` ke `anon`/`authenticated` — hanya `service_role` (dipakai Route Handler server).