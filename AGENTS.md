# AGENTS.md — Aturan kerja untuk AI assistant di repo ini

## Setelah revisi kode: commit, push, deploy — otomatis

Setiap selesai mengubah kode di repo ini, **langsung** lakukan tiga langkah
berikut tanpa menunggu diminta:

1. **Commit** — pesan commit memakai bahasa Indonesia, isinya menjelaskan
   *akar masalah*, bukan sekadar "perbaiki bug", dan menyebut file yang diubah.
   Kalau ada karakter asing (Cyrillic/CJK) yang tidak sengaja masuk ke pesan
   commit, perbaiki dengan `git commit --amend` sebelum push.
2. **Push** ke branch `main`:
   ```
   git push origin main
   ```
   Ini memicu `.github/workflows/ci.yml` (typecheck + build + uji statis).
3. **Deploy ke Vercel production**, lalu tunggu sampai benar-benar sukses:
   ```
   vercel deploy --prod --yes
   ```
   Jalankan dari root repo ini. Jangan berhenti di "perintah sudah dikirim".

### Verifikasi wajib setelah deploy

- `vercel inspect <deployment-url>` → status harus `READY`.
- Buka `https://pos-amd-portal.vercel.app/login` → harus balas 200.
- Kalau perubahan menyentuh tampilan, pastikan `/home` memakai kode baru
  (cari teks atau kelas yang baru ditambahkan di HTML-nya).

Kalau deploy gagal, jangan diamkan: baca log, perbaiki, deploy ulang, lalu
laporkan penyebabnya.

## Kalau belum bisa diverifikasi di sini

Tidak semua bisa diuji lokal karena butuh kredensial Supabase yang tidak ada
di repo. Untuk kasus seperti itu:

- Uji logikanya dengan tiruan: server HTTP palsu untuk PostgREST, lalu jalankan
  build produksi `next build` dan cek HTML yang dirender.
- Sebutkan dengan eksplisit bagian mana yang **belum** terverifikasi dan apa
  yang harus dicoba sendiri oleh pemilik repo.
- Jangan pernah menulis kredensial ke file yang di-commit. Kalau perlu env
  sementara, buat `.env.local`, hapus setelah selesai, lalu pastikan
  `git status` bersih.

## Vercel

- Root Directory project = `portal`. Perintah build/deploy dijalankan dari
  root repo, Vercel yang masuk ke folder `portal/`.
- `.vercel/project.json` sudah tertaut ke project `pos-amd-portal`.
  ID project dan org ID bukan rahasia.
- CLI sudah terautentikasi di mesin ini
  (`~/.local/share/com.vercel.cli/auth.json`).
- Auto-deploy lewat GitHub Actions (`.github/workflows/deploy-vercel.yml`) juga
  aktif untuk push ke `main` yang menyentuh `portal/**`, **tapi hanya kalau**
  secret `VERCEL_TOKEN` terisi di repo. Kalau deploy dari Actions terlihat
  di-skip, jalankan `vercel deploy --prod --yes` langsung.

## Struktur repo

- `portal/` — aplikasi Next.js, PWA portal operator.
- `tools/test/run-all.mjs` — uji statis + uji portal. Jalankan `npm test`
  dari root repo.
- Tabel: `partners` (baris toko), `licenses` (serial key), `auth.users`,
  plus `produk` (katalog harga), `langganan_pembayaran` (catatan bulan
  langganan yang sudah dibayar), dan view `toko_rekap`.
  **Tidak ada tabel `toko` maupun `keys`.**
- Semua angka rekap toko (sisa, terjual, bundle/app, komisi penjualan,
  komisi langganan, total komisi) dihitung di dalam view `toko_rekap` dan
  dibaca lewat `getTokoStats()` di
  `portal/src/lib/supabase/toko-stats.ts`. Home dan Profile memakai fungsi
  yang sama, jadi angkanya tidak mungkin berbeda.
  - `sisa` = `partners.license_quota` (dikurangi setiap key dibuat).
  - `terjual` = **jumlah baris `licenses`** (COUNT), bukan
    `partners.total_terjual`. Counter itu bisa menyimpang dari data asli
    kalau ada insert/delete di luar RPC; bagian 10.1 di `schema.sql`
    memperbaikinya. Jangan menuliskan angka ini sebagai hitungan ulang di
    kode JS — biar tetap satu sumber.
  - `getTokoStats()` punya jalur cadangan kalau view `toko_rekap` belum ada
    (deploy sebelum SQL dijalankan), ditandai `modeCadangan: true`.
- `licenses.tier_rate` adalah **snapshot** persen tier saat transaksi dibuat.
  Jangan pernah menghitung ulang komisi dari tier terkini.
- `langganan_pembayaran` mulai dari `bulan_ke >= 2`; bulan pertama sudah
  termasuk di `licenses.komisi_amount`. Kalau bulan 1 ikut masuk lagi, komisi
  langganan terhitung dobel.
- Endpoint `/api/langganan` (POST) memanggil RPC
  `catat_langganan_bulan`; UI-nya `components/portal/langganan-list.tsx`.

## Jebakan PostgREST yang pernah menimpa repo ini

`order:` dan `limit:` **tidak boleh** ditulis di dalam kurung `select()` untuk
tabel yang di-embed. PostgREST membaca isi kurung sebagai daftar kolom, jadi
query gagal 42703; karena `.maybeSingle()` membuang error, hasilnya `null` dan
semua angka diam-diam jadi 0. Modifier hanya bisa lewat query parameter
(`&licenses.order=...`), yang tidak bisa ditulis di postgrest-js.

Cara yang benar: ambil daftar key sebagai query terpisah memakai `.order()` dan
`.limit()`. `npm run test:statis` sudah menjaga hal ini.

## Branch dan clone ganda

Repo ini pernah ada **dua clone** di satu mesin (folder induk dan subfolder).
Selalu cek `git remote -v` dan folder mana yang sedang dikerjakan sebelum
commit/push, supaya perubahan tidak mendarat di clone yang salah. Setelah
push, pastikan `git status -sb` tidak masih tertinggal.