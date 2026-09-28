-- ===========================================================================
--  KASIRPRO PORTAL — Data contoh (opsional)
-- ===========================================================================
--  Jalankan file ini SETELAH schema.sql, di Supabase SQL Editor.
--  Dipakai untuk mencoba semua layar tanpa harus buat Serial Key manual.
--  Menghapus semua data contoh:
--    delete from public.licenses where partner_id in (
--      select id from public.partners where nama_toko like 'DEMO %');
--
--  CATATAN: baris partners harus punya user_id akun Supabase Auth yang nyata
--  supaya RLS bisa membacanya. Buat akun toko@contoh.com lewat dashboard atau
--  portal/scripts/create-demo-user.mjs dulu (jangan insert auth.users manual —
--  akun tanpa identities tidak bisa login). Sisanya di file ini berjalan saat
--  akunnya sudah ada.
--
--  LOGIN DEMO DI PORTAL:
--      username : demo
--      password : toko12345
--  (email toko@contoh.com / toko12345 juga tetap bisa dipakai)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Akun contoh (PENTING — buat lewat endpoint Auth, BUKAN SQL)
-- ---------------------------------------------------------------------------
--  SQL manual ke auth.users membuat baris tanpa identities sehingga login
--  gagal (GoTrue 500 "Database error querying schema"). Buat akun lewat:
--
--  Autentikasi lewat dashboard (disarankan): buat user di
--      Authentication > Users > Add user (email+password, Auto Confirm),
--  lalu jalankan klien ini sebagai role postgres + service role:
--      node portal/scripts/create-demo-user.mjs --email toko@contoh.com \
--          --password toko12345 --nama "DEMO Toko Berkah"
--  (baris partners dibuat otomatis oleh trigger on_auth_user_created)
--
--  File ini HANYA mengisi data bisnis, dan berhenti dengan aman bila akun
--  Auth belum dibuat.

-- pastikan baris partners siap untuk data demo (user_id dari Auth, tanpa ID keras)
insert into public.partners (user_id, email, username, nama_toko, no_hp, alamat, license_quota, total_terjual, komisi_total)
select u.id, u.email, 'demo', 'DEMO Toko Berkah', '08123456789', 'Jl. Merdeka No. 10, Bandung', 5, 3, 12000
  from auth.users u
 where u.email = 'toko@contoh.com'
on conflict (user_id) do update set
  nama_toko     = excluded.nama_toko,
  no_hp         = excluded.no_hp,
  alamat        = excluded.alamat,
  license_quota = excluded.license_quota,
  total_terjual = excluded.total_terjual,
  komisi_total  = excluded.komisi_total;

-- username unik untuk akun demo (login pakai username & password)
update public.partners
   set username = 'demo'
 where email = 'toko@contoh.com'
   and (username is null or username <> 'demo');

-- ---------------------------------------------------------------------------
-- 2. Riwayat Serial Key contoh
--    Menunjukkan semua status supaya semua tampilan bisa dicek:
--      - belum dipakai (kartu Bundle 2 / Aplikasi 1, komisi Rp 9.000)
--      - sudah aktif di kasir (punya HWID)
--      - langganan dengan masa berlaku
-- ---------------------------------------------------------------------------
insert into public.licenses (
  serial_key, partner_id, status, paket_type, license_type,
  pembeli_nama, pembeli_hp, alamat, komisi_amount, tier, tier_rate
)
select v.serial_key, p.id, v.status::text, v.paket_type, v.license_type,
       v.pembeli_nama, v.pembeli_hp, v.alamat, v.komisi_amount, v.tier, v.tier_rate
from public.partners p
cross join (values
  ('KPRO-DEMO-AAAA-0001', 'unused',   'bundle',   'sekali',     'Budi Santoso',    '081200000001', 'Jl. Sudirman No. 1',  5000,  'Bronze',   5.00),
  ('KPRO-DEMO-BBBB-0002', 'unused',   'app_only', 'sekali',     'Siti Aminah',     '081200000002', 'Jl. Asia Afrika No. 2', 2500, 'Bronze',   5.00),
  ('KPRO-DEMO-CCCC-0003', 'active',   'bundle',   'langganan',  'Agus Salim',      '081200000003', 'Jl. Malaka No. 3',     10000, 'Bronze',   5.00),
  ('KPRO-DEMO-DDDD-0004', 'unused',   'bundle',   'sekali',     'Dewi Lestari',    '081200000004', 'Jl. Melati No. 4',      1500, 'Silver',  10.00)
) as v(serial_key, status, paket_type, license_type, pembeli_nama, pembeli_hp, alamat, komisi_amount, tier, tier_rate)
where p.email = 'toko@contoh.com'
on conflict (serial_key) do nothing;

-- Serial Key yang sudah aktif butuh HWID
update public.licenses
   set hwid_locked     = 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
       hwid_locked_at  = now(),
       activated_at    = now(),
       device_name     = 'PC Kasir Demo',
       app_version     = '1.0.0',
       expires_at      = now() + interval '12 months'
 where serial_key = 'KPRO-DEMO-CCCC-0003';

-- ---------------------------------------------------------------------------
-- 3. Kode uji aktivasi yang bisa dipakai di aplikasi Desktop
--    (status masih 'unused' -> boleh diaktifkan sekali)
--      KPRO-DEMO-AAAA-0001   Bundle, Sekali
--      KPRO-DEMO-BBBB-0002   Aplikasi Saja, Sekali
--      KPRO-DEMO-DDDD-0004   Bundle, Sekali
--
--  Uji penolakan:
--      KPRO-DEMO-CCCC-0003   sudah terikat HWID -> HWID_MISMATCH
--                             (kecuali di komputer dengan HWID tsb)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. Bawa toko contoh ke tier Platinum (opsional)
-- ---------------------------------------------------------------------------
-- update public.partners set total_terjual = 31, komisi_total = 3100000
--  where email = 'toko@contoh.com';
-- update public.licenses set tier = 'Platinum', tier_rate = 30.00
--  where partner_id = (select id from public.partners where email='toko@contoh.com');
