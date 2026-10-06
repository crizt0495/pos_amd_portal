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
--  HASIL YANG DIHARAPKAN setelah seed ini + login:
--      Home       : "5/8" sisa/terjual, 6 Bundle, 2 Aplikasi,
--                   Tier Silver 10%, Total Komisi Rp 207.292
--      Riwayat    : 8 key, 2 di antaranya berbadge "Langganan · Bulan 3"
--                   dan "Langganan · Bulan 2"
--      Aktivasi   : tombol "Catat Bulan Berikutnya" untuk kedua key langganan
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
--      lalu jalankan klien ini sebagai role postgres + service role:
--      node portal/scripts/create-demo-user.mjs --email toko@contoh.com \
--          --password toko12345 --nama "DEMO Toko Berkah"
--  (baris partners dibuat otomatis oleh trigger on_auth_user_created)
--
--  File ini HANYA mengisi data bisnis, dan berhenti dengan aman bila akun
--  Auth belum dibuat.

-- Kuota awal 13 dengan 8 key terjual -> Home menampilkan "5/8" (sisa/terjual)
-- dan tier Silver 10%, supaya semua tampilan bisa dicek tanpa bikin key dulu.
-- komisi_total = 207.292 = sum komisi_amount 8 key (203.125) + komisi langganan
-- bulan 2 ke atas (4.167). Rinciannya ada di section 2.
insert into public.partners (user_id, email, username, nama_toko, no_hp, alamat, license_quota, total_terjual, komisi_total)
select u.id, u.email, 'demo', 'DEMO Toko Berkah', '08123456789', 'Jl. Merdeka No. 10, Bandung', 13, 8, 207292
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
--    8 key: 6 Bundle + 2 Aplikasi, supaya angka di Home bukan nol semua dan tier
--    sudah Silver (6 key ke atas = 10%).
--
--    komisi_amount memakai model resmi: harga acuan dari tabel `produk`
--    x persen tier saat transaksi.
--      harga_sekali_bayar      = 500.000
--      harga_langganan_tahunan = 250.000  -> per bulan 20.833
--      Bronze 5%  -> sekali 25.000 | langganan 1.042
--      Silver 10% -> sekali 50.000 | langganan 2.083
--
--    Status sengaja varied supaya semua tampilan bisa dicek:
--      - belum dipakai (unused)
--      - sudah aktif di kasir (punya HWID)
--      - langganan dengan masa berlaku + riwayat bulan langganan
-- ---------------------------------------------------------------------------
insert into public.licenses (
  serial_key, partner_id, status, paket_type, license_type,
  pembeli_nama, pembeli_hp, alamat, komisi_amount, tier, tier_rate
)
select v.serial_key, p.id, v.status::text, v.paket_type, v.license_type,
       v.pembeli_nama, v.pembeli_hp, v.alamat, v.komisi_amount, v.tier, v.tier_rate
from public.partners p
cross join (values
  ('KPRO-DEMO-AAAA-0001', 'unused',   'bundle',   'sekali',    'Budi Santoso',   '081200000001', 'Jl. Sudirman No. 1',     25000, 'Bronze', 5.00),
  ('KPRO-DEMO-BBBB-0002', 'unused',   'app_only', 'sekali',    'Siti Aminah',    '081200000002', 'Jl. Asia Afrika No. 2',   25000, 'Bronze', 5.00),
  ('KPRO-DEMO-CCCC-0003', 'active',   'bundle',   'langganan', 'Agus Salim',     '081200000003', 'Jl. Malaka No. 3',        1042, 'Bronze', 5.00),
  ('KPRO-DEMO-DDDD-0004', 'unused',   'bundle',   'sekali',    'Dewi Lestari',   '081200000004', 'Jl. Melati No. 4',       25000, 'Bronze', 5.00),
  ('KPRO-DEMO-EEEE-0005', 'unused',   'bundle',   'sekali',    'Rina Kartika',   '081200000005', 'Jl. Kenanga No. 5',      25000, 'Bronze', 5.00),
  ('KPRO-DEMO-FFFF-0006', 'unused',   'bundle',   'sekali',    'Bayu Saputra',   '081200000006', 'Jl. Mawar No. 6',        50000, 'Silver', 10.00),
  ('KPRO-DEMO-GGGG-0007', 'unused',   'bundle',   'sekali',    'Maya Puspita',   '081200000007', 'Jl. Melati No. 7',       50000, 'Silver', 10.00),
  ('KPRO-DEMO-HHHH-0008', 'active',   'app_only', 'langganan', 'Andi Saputra',   '081200000008', 'Jl. Mawar No. 8',         2083, 'Silver', 10.00)
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
 where serial_key in ('KPRO-DEMO-CCCC-0003', 'KPRO-DEMO-HHHH-0008');

-- ---------------------------------------------------------------------------
-- 3. Riwayat langganan yang sudah dibayar (bulan 2 ke atas)
--
--    Bulan 1 TIDAK ada di sini: nilainya sudah tercatat di
--    licenses.komisi_amount waktu pendaftaran, jadi kalau ikut ditulis di sini
--    komisi bulan 1 akan terhitung dua kali di Home.
--
--    KPRO-DEMO-CCCC-0003 sudah bayar sampai bulan 3 -> badge "Langganan · Bulan 3"
--    KPRO-DEMO-HHHH-0008 sudah bayar sampai bulan 2 -> badge "Langganan · Bulan 2"
-- ---------------------------------------------------------------------------
insert into public.langganan_pembayaran (license_id, partner_id, bulan_ke, komisi_toko, dibayar_pada)
select l.id, l.partner_id, v.bulan_ke, v.komisi_toko, now() - make_interval(months => v.bulan_ke)
  from public.licenses l
  join (values
    ('KPRO-DEMO-CCCC-0003', 2, 1042),
    ('KPRO-DEMO-CCCC-0003', 3, 1042),
    ('KPRO-DEMO-HHHH-0008', 2, 2083)
  ) as v(serial_key, bulan_ke, komisi_toko)
    on v.serial_key = l.serial_key
on conflict (license_id, bulan_ke) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Kode uji aktivasi yang bisa dipakai di aplikasi Desktop
--    (status masih 'unused' -> boleh diaktifkan sekali)
--      KPRO-DEMO-AAAA-0001   Bundle, Sekali
--      KPRO-DEMO-BBBB-0002   Aplikasi Saja, Sekali
--      KPRO-DEMO-DDDD-0004   Bundle, Sekali
--      KPRO-DEMO-EEEE-0005   Bundle, Sekali
--      KPRO-DEMO-FFFF-0006   Bundle, Sekali
--      KPRO-DEMO-GGGG-0007   Bundle, Sekali
--
--  Uji penolakan:
--      KPRO-DEMO-CCCC-0003   sudah terikat HWID -> HWID_MISMATCH
--      KPRO-DEMO-HHHH-0008   sudah terikat HWID -> HWID_MISMATCH
--                             (kecuali di komputer dengan HWID tsb)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. Bawa toko contoh ke tier Platinum (opsional)
--    Setelah menjalankan ini, angka "terjual" di Home tetap mengikuti jumlah key
--    yang benar-benar ada; tier Bronze/Silver/Gold/Platinum ikut menyesuaikan
--    dari angka itu. Baris key tambahan harus ikut disisipkan supaya tidak
--    hanya berubah tampilan.
-- ---------------------------------------------------------------------------
-- insert into public.licenses (
--   serial_key, partner_id, status, paket_type, license_type,
--   pembeli_nama, komisi_amount, tier, tier_rate)
-- select 'KPRO-DEMO-EXTRA-' || lpad(g::text, 4, '0'), p.id, 'unused', 'bundle',
--        'sekali', 'Pelanggan ' || g, 150000, 'Gold', 20.00
--   from public.partners p, generate_series(1, 25) g
--  where p.email = 'toko@contoh.com'
-- on conflict (serial_key) do nothing;
--
-- update public.partners set total_terjual = 33, komisi_total = 3800000
--  where email = 'toko@contoh.com';
