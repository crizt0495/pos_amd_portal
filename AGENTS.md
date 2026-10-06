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
- Hanya ada tiga tabel: `partners` (baris toko), `licenses` (serial key),
  dan `auth.users`. **Tidak ada tabel `toko` maupun `keys`.**
- Angka kuota toko: `partners.license_quota` = sisa (dikurangi setiap key
  dibuat oleh RPC `generate_license`) dan `partners.total_terjual` = yang sudah
  terjual. Keduanya **tidak boleh dihitung ulang** dari jumlah baris
  `licenses`. Baca keduanya lewat `getTokoStats()` di
  `portal/src/lib/supabase/toko-stats.ts`.

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