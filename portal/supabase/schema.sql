-- ===========================================================================
--  KASIRPRO PORTAL — Supabase PostgreSQL Schema
--  Jalankan seluruh file ini di: Supabase Dashboard > SQL Editor > New Query
--  Aman dijalankan berulang (idempotent).
--
--  Hanya 3 tabel bisnis: partners (toko operator), licenses (serial key),
--  dan langganan_pembayaran (catatan komisi langganan per bulan). Tabel
--  `produk` (katalog harga) didefinisikan di file admin portal, blok di sini
--  cuma jaring pengaman supaya file ini bisa berdiri sendiri.
--  Aplikasi Desktop (Komputer Kasir) TIDAK menyentuh database ini langsung —
--  hanya lewat  POST /api/activate.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Extension
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Tabel: partners  (toko komputer / operator)
-- ---------------------------------------------------------------------------
create table if not exists public.partners (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete cascade,
  email           text unique,
  -- nama pengguna untuk login (username & password), unik per toko
  username        text,
  nama_toko       text        not null,
  no_hp           text,
  alamat          text,
  -- tidak lagi dipakai (fitur upload logo dihapus); dibiarkan agar schema.sql
  -- tetap idempotent untuk database yang sudah terlanjur punya kolom ini
  logo_url        text,
  -- jatah lisensi yang masih boleh dibuat (default 5, habis tiap generate key)
  license_quota   integer     not null default 5 check (license_quota >= 0),
  -- total serial key yang sudah pernah dibuat (dasar tier Bronze..Platinum)
  total_terjual   integer     not null default 0 check (total_terjual >= 0),
  -- akumulasi komisi (denormalisasi, source of truth tetap licenses.komisi_amount)
  komisi_total    integer     not null default 0 check (komisi_total >= 0),
  status          text        not null default 'active' check (status in ('active','suspended')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- migrasi aman untuk database lama
alter table public.partners add column if not exists email text;
alter table public.partners add column if not exists username text;
alter table public.partners add column if not exists komisi_total integer not null default 0;
alter table public.partners add column if not exists status text not null default 'active';
create unique index if not exists uq_partners_email on public.partners (email) where email is not null;
create unique index if not exists uq_partners_username on public.partners (username) where username is not null;
create index if not exists idx_partners_user on public.partners (user_id);

-- Isi username untuk baris lama yang belum punya (default = bagian email sebelum "@",
-- dipastikan unik dengan menambahkan -2, -3, … pada bentrok).
update public.partners set username = x.username
from (
  select id, coalesce(username, first_value(lower(split_part(coalesce(email,''),'@',1)))
                 over (partition by lower(split_part(coalesce(email,''),'@',1)) order by created_at)) ||
         case when row_number() over (partition by lower(split_part(coalesce(email,''),'@',1)) order by created_at) = 1
              then '' else row_number() over (partition by lower(split_part(coalesce(email,''),'@',1)) order by created_at)::text end
         as username
  from public.partners
  where username is null
) x
where public.partners.id = x.id;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_partners_updated on public.partners;
create trigger trg_partners_updated before update on public.partners
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Tabel: licenses  (serial key KPRO-XXXX-XXXX-XXXX)
-- ---------------------------------------------------------------------------
create table if not exists public.licenses (
  id              uuid primary key default gen_random_uuid(),
  serial_key      text        not null unique,
  partner_id      uuid        not null references public.partners(id) on delete cascade,
  status          text        not null default 'unused'
                                check (status in ('unused','active','blocked','revoked')),
  -- dikunci saat aplikasi desktop mengaktifkan key (Hardware ID)
  hwid_locked     text,
  hwid_locked_at  timestamptz,
  device_name     text,
  app_version     text,
  activated_at    timestamptz,
  paket_type      text        not null check (paket_type in ('bundle','app_only')),
  license_type    text        not null check (license_type in ('sekali','langganan')),
  pembeli_nama    text        not null,
  pembeli_hp      text,
  alamat          text,
  -- komisi final (rupiah bulat) saat key dibuat, sesuai tier saat itu
  komisi_amount   integer     not null default 0 check (komisi_amount >= 0),
  tier            text        not null default 'Bronze',
  tier_rate       numeric(5,2) not null default 5.00,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- migrasi aman untuk database lama (nama kolom versi sebelumnya)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'pembeli_telepon'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'pembeli_hp'
  ) then
    alter table public.licenses rename column pembeli_telepon to pembeli_hp;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'pembeli_alamat'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'alamat'
  ) then
    alter table public.licenses rename column pembeli_alamat to alamat;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'komisi'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'komisi_amount'
  ) then
    alter table public.licenses
      add column komisi_amount integer not null default 0;
    update public.licenses
       set komisi_amount = round(komisi)::integer
     where komisi is not null;
  end if;
end $$;

alter table public.licenses add column if not exists pembeli_hp text;
alter table public.licenses add column if not exists alamat text;
alter table public.licenses add column if not exists komisi_amount integer not null default 0;

-- normalisasi nilai paket lama 'app' -> 'app_only'
update public.licenses set paket_type = 'app_only' where paket_type = 'app';
update public.licenses set paket_type = 'bundle'    where paket_type is null;

create index if not exists idx_licenses_partner on public.licenses (partner_id);
create index if not exists idx_licenses_status  on public.licenses (status);
create index if not exists idx_licenses_hwid     on public.licenses (hwid_locked);
create index if not exists idx_licenses_created  on public.licenses (partner_id, created_at desc);

drop trigger if exists trg_licenses_updated on public.licenses;
create trigger trg_licenses_updated before update on public.licenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Helper: partner milik user yang sedang login
-- ---------------------------------------------------------------------------
create or replace function public.current_partner_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.partners p where p.user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Auto-create baris partner saat akun toko dibuat di Supabase Auth
--    (nama toko & username default dari user_metadata atau email sebelum "@",
--    kuota 5)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_username text;
begin
  v_username := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'username', '')), '');
  if v_username is null then
    v_username := lower(split_part(coalesce(new.email, ''), '@', 1));
  end if;

  insert into public.partners (user_id, email, username, nama_toko, license_quota, total_terjual, komisi_total)
  values (
    new.id,
    new.email,
    v_username,
    coalesce(new.raw_user_meta_data ->> 'nama_toko', split_part(coalesce(new.email, ''), '@', 1)),
    5, 0, 0
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Tier toko: Bronze 1-5 (5%) | Silver 6-10 (10%) | Gold 11-30 (20%) | Platinum 30+ (30%)
-- ---------------------------------------------------------------------------
create or replace function public.tier_rate_of(p_total_terjual integer)
returns numeric language sql immutable as $$
  select case
    when coalesce(p_total_terjual, 0) >= 30 then 30.00
    when coalesce(p_total_terjual, 0) >= 11 then 20.00
    when coalesce(p_total_terjual, 0) >= 6  then 10.00
    else 5.00
  end;
$$;

create or replace function public.tier_name_of(p_total_terjual integer)
returns text language sql immutable as $$
  select case
    when coalesce(p_total_terjual, 0) >= 30 then 'Platinum'
    when coalesce(p_total_terjual, 0) >= 11 then 'Gold'
    when coalesce(p_total_terjual, 0) >= 6  then 'Silver'
    else 'Bronze'
  end;
$$;

-- Dasar komisi: Bundle Rp 100.000 | Aplikasi Saja Rp 50.000
create or replace function public.base_commission_of(p_paket text)
returns integer language sql immutable as $$
  select case when p_paket = 'bundle' then 100000 else 50000 end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Katalog produk & harga acuan komisi
--
--    Komisi toko dulu dihitung dari nominal TETAP base_commission_of()
--    (100rb bundle / 50rb aplikasi), bukan dari harga yang benar-benar
--    dibayar pembeli. Akibatnya komisi tidak nyambung dengan harga: jual
--    500rb dan jual 3,5jt dapat komisi sama besarnya.
--
--    Sekarang komisi = harga acuan produk x persen tier. Harga acuan diambil
--    dari tabel `produk` yang dikelola admin portal:
--      license_type = 'sekali'   -> produk.harga_sekali_bayar
--      license_type = 'langganan' -> produk.harga_langganan_tahunan (per tahun)
--
--    CATATAN: definisi tabel `produk` yang otoritatif ada di admin portal
--    (pos_amd_admin_portal/supabase/admin-schema.sql). Blok di bawah hanya
--    jaring pengaman supaya file schema portal bisa berdiri sendiri; karena
--    `create table if not exists` tidak mengubah tabel yang sudah ada, meng
--    jalankan kedua file dalam urutan mana pun aman.
-- ---------------------------------------------------------------------------
create table if not exists public.produk (
  id                       uuid primary key default gen_random_uuid(),
  nama_apariksi            text    not null check (length(btrim(nama_apariksi)) > 0),
  harga_sekali_bayar       integer check (harga_sekali_bayar is null or harga_sekali_bayar >= 0),
  harga_langganan_tahunan  integer check (harga_langganan_tahunan is null or harga_langganan_tahunan >= 0),
  deskripsi                text,
  created_at               timestamptz not null default now()
);

-- Harga acuan disimpan di baris lisensi sebagai SNAPSHOT. Tier punya snapshot
-- sendiri (`licenses.tier_rate`), jadi naik tier di kemudian hari tidak mengubah
-- komisi transaksi lama. `harga_jual` hanya diisi untuk lisensi yang dibuat
-- setelah migration ini; baris lama boleh NULL (artinya "belum punya acuan").
alter table public.licenses
  add column if not exists produk_id uuid references public.produk(id) on delete set null;

alter table public.licenses
  add column if not exists harga_jual integer
  check (harga_jual is null or harga_jual >= 0);

create index if not exists idx_licenses_produk on public.licenses (produk_id);

-- Produk contoh HANYA kalau katalog masih kosong, supaya harga yang sudah
-- disetel admin tidak tertimpa.
do $$
begin
  if not exists (select 1 from public.produk) then
    insert into public.produk (nama_apariksi, harga_sekali_bayar, harga_langganan_tahunan, deskripsi)
    values ('POS AMD', 500000, 250000, 'Lisensi aplikasi kasir POS AMD');
  end if;
end $$;

-- Tautkan lisensi lama (produk_id NULL) ke produk terbaru.
update public.licenses l
   set produk_id = pr.id
  from (select id from public.produk order by created_at desc, id desc limit 1) pr
 where l.produk_id is null;

-- Isi harga_jual dari produk. SENGAJA tidak menyentuh komisi_amount: komisi
-- yang sudah tercatat adalah snapshot saat transaksi dan tidak boleh dihitung
-- ulang memakai harga/tier yang sekarang.
update public.licenses l
   set harga_jual = case when l.license_type = 'langganan'
                         then pr.harga_langganan_tahunan
                         else pr.harga_sekali_bayar end
  from public.produk pr
 where pr.id = l.produk_id
   and l.harga_jual is null;

-- ---------------------------------------------------------------------------
-- 6.1 Helper: produk acuan + harganya untuk satu jenis lisensi
--
--     Kalau `p_produk_id` NULL, pakai produk terbaru (katalog yang diisi admin).
--     Harga NULL / 0 dikembalikan apa adanya supaya pemanggil bisa membedakan
--     "produk tidak terdaftar" dari "produk gratis".
-- ---------------------------------------------------------------------------
drop function if exists public.resolve_produk_harga(uuid, text);
create or replace function public.resolve_produk_harga(p_produk_id uuid, p_license_type text)
returns table (produk uuid, harga integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id,
    coalesce(
      case when p_license_type = 'langganan'
           then pr.harga_langganan_tahunan
           else pr.harga_sekali_bayar
      end,
      0
    )::integer
  from public.produk pr
  where pr.id = p_produk_id
     or p_produk_id is null
  order by (pr.id = p_produk_id) desc nulls last, pr.created_at desc, pr.id desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPC generate_license  (dipakai Route Handler POST /api/licenses)
--    - user WAJIB login (auth.uid() != null, partner_id harus miliknya)
--    - mengunci baris partner (FOR UPDATE) supaya kuota tidak dobel terpakai
--    - membuat serial key, menghitung komisi = harga acuan x persen tier
--      SEBELUM generate, menambah total_terjual, mengurangi license_quota
--    - langganan: komisi bulan pertama dibayar saat key dibuat, jadi toko
--      tinggal mencatat bulan 2 dan seterusnya
--
--    PENTING: versi 6 argumen (tanpa p_produk_id) dibuang lebih dulu supaya
--    PostgREST tidak melihat dua fungsi bernama sama dan jadi ambigu.
-- ---------------------------------------------------------------------------
drop function if exists public.generate_license(text, text, text, text, text, text);
create or replace function public.generate_license(
  p_serial_key     text,
  p_pembeli_nama   text,
  p_pembeli_hp     text default null,
  p_alamat         text   default null,
  p_paket_type     text   default 'app_only',
  p_license_type   text   default 'sekali',
  p_produk_id      uuid   default null
)
returns public.licenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_quota     integer;
  v_total     integer;
  v_rate      numeric;
  v_tier      text;
  v_komisi    integer;
  v_produk_id uuid;
  v_harga     integer;
  v_license   public.licenses;
begin
  v_partner_id := public.current_partner_id();

  if v_partner_id is null then
    raise exception 'PARTNER_NOT_FOUND';
  end if;

  -- kunci baris partner
  select license_quota, total_terjual
    into v_quota, v_total
  from public.partners
  where id = v_partner_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'PARTNER_NOT_FOUND';
  end if;

  if coalesce(v_quota, 0) <= 0 then
    raise exception 'QUOTA_EXHAUSTED';
  end if;

  -- tier dihitung dari total SEBELUM key ini dibuat
  v_rate   := public.tier_rate_of(v_total);
  v_tier   := public.tier_name_of(v_total);

  -- harga acuan dari katalog produk. Kalau produk belum terdaftar atau
  -- harganya belum diisi, jatuh ke nominal lama base_commission_of() supaya
  -- komisi tidak mendadak jadi Rp 0.
  select rp.produk, rp.harga
    into v_produk_id, v_harga
  from public.resolve_produk_harga(p_produk_id, p_license_type) rp;

  if coalesce(v_harga, 0) <= 0 then
    v_harga := public.base_commission_of(p_paket_type);
  end if;

  -- komisi = harga acuan x persen tier SAAT INI, disimpan sebagai snapshot di
  -- licenses.komisi_amount. Transaksi lama tidak ikut berubah saat tier naik.
  v_komisi := round(v_harga * v_rate / 100)::integer;

  -- Langganan: harga di katalog adalah biaya per TAHUN, komisi dibayar per
  -- bulan. Yang dibayar saat pendaftaran adalah bulan 1 = 1/12 harga tahunan,
  -- dan NILAINYA disimpan di licenses.komisi_amount. Baris bulan 1 TIDAK
  -- diduplikasi ke langganan_pembayaran, kalau tidak komisi bulan 1 akan
  -- terhitung dua kali saat Home menjumlahkan penjualan + langganan.
  if p_license_type = 'langganan' then
    v_komisi := round((v_harga / 12.0) * v_rate / 100)::integer;
  end if;

  insert into public.licenses (
    serial_key, partner_id, paket_type, license_type,
    pembeli_nama, pembeli_hp, alamat, produk_id, harga_jual,
    komisi_amount, tier, tier_rate, status, expires_at
  )
  values (
    p_serial_key, v_partner_id, p_paket_type, p_license_type,
    p_pembeli_nama, p_pembeli_hp, p_alamat, v_produk_id, v_harga,
    v_komisi, v_tier, v_rate, 'unused',
    case when p_license_type = 'langganan' then now() + interval '12 months' else null end
  )
  returning * into v_license;

  update public.partners
     set license_quota = license_quota - 1,
         total_terjual = total_terjual + 1,
         komisi_total  = komisi_total + v_komisi
   where id = v_partner_id;

  return v_license;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPC activate_license  (dipakai Route Handler POST /api/activate,
--    ditembak oleh aplikasi desktop "Komputer Kasir")
--
--    status unused             -> kunci HWID, jadi active  (ACTIVATED)
--    status active + HWID sama -> boleh masuk               (ALREADY_ACTIVE)
--    status active + HWID beda -> HWID_MISMATCH (terikat perangkat lain)
-- ---------------------------------------------------------------------------
create or replace function public.activate_license(
  p_serial_key  text,
  p_hwid        text,
  p_device_name text default null,
  p_app_version text default null
)
returns table (
  ok            boolean,
  code          text,
  message       text,
  license_id    uuid,
  partner_id    uuid,
  nama_toko     text,
  pembeli_nama  text,
  paket_type    text,
  license_type  text,
  status        text,
  hwid_locked   text,
  locked_now    boolean,
  activated_at  timestamptz,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
-- Nama kolom hasil (RETURNS TABLE) sama dengan nama kolom tabel:
-- semua konflik nama diputuskan MEMILIH kolom (bukan variabel).
#variable_conflict use_column
declare
  v_lic    public.licenses%rowtype;
  v_id     uuid;
  v_toko   text;
  v_target text;
begin
  v_target := upper(trim(coalesce(p_hwid, '')));
  v_lic.hwid_locked := null;

  select * into v_lic
  from public.licenses
  where upper(trim(serial_key)) = upper(trim(coalesce(p_serial_key, '')));

  -- 7a. key tidak ada
  if not found then
    return query select
      false, 'INVALID_KEY', 'Serial Key tidak ditemukan. Periksa kembali kode dari toko Anda.',
      null::uuid, null::uuid, null::text, null::text, null::text, null::text, null::text,
      null::text, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  select p.nama_toko into v_toko
    from public.partners p
   where p.id = v_lic.partner_id;

  -- 7b. diblokir / dicabut admin
  if v_lic.status in ('blocked', 'revoked') then
    return query select
      false, 'BLOCKED', 'Serial Key ini telah diblokir. Hubungi toko Anda.',
      v_lic.id, v_lic.partner_id, v_toko, v_lic.pembeli_nama, v_lic.paket_type,
      v_lic.license_type, v_lic.status, v_lic.hwid_locked, false, v_lic.activated_at, v_lic.expires_at;
    return;
  end if;

  -- 7c. masa langganan habis
  if v_lic.expires_at is not null and v_lic.expires_at < now() then
    update public.licenses set status = 'revoked' where id = v_lic.id;
    return query select
      false, 'EXPIRED', 'Masa langganan Serial Key ini sudah habis. Hubungi toko Anda.',
      v_lic.id, v_lic.partner_id, v_toko, v_lic.pembeli_nama, v_lic.paket_type,
      v_lic.license_type, 'expired', v_lic.hwid_locked, false, v_lic.activated_at, v_lic.expires_at;
    return;
  end if;

  -- 7d. sudah dipakai -> hanya perangkat yang sama boleh masuk
  if v_lic.status = 'active' and v_lic.hwid_locked is not null then
    if v_lic.hwid_locked = v_target then
      return query select
        true, 'ALREADY_ACTIVE', 'Serial Key ini sudah aktif di perangkat ini.',
        v_lic.id, v_lic.partner_id, v_toko, v_lic.pembeli_nama, v_lic.paket_type,
        v_lic.license_type, v_lic.status, v_lic.hwid_locked, false, v_lic.activated_at, v_lic.expires_at;
    else
      return query select
        false, 'HWID_MISMATCH', 'Lisensi terikat perangkat lain. Aktifkan di komputer kasir yang sama.',
        v_lic.id, v_lic.partner_id, v_toko, v_lic.pembeli_nama, v_lic.paket_type,
        v_lic.license_type, v_lic.status, v_lic.hwid_locked, false, v_lic.activated_at, v_lic.expires_at;
    end if;
    return;
  end if;

  -- 7e. kunci HWID (idempoten & anti race-condition)
  v_id := v_lic.id;

  update public.licenses
     set hwid_locked    = v_target,
         hwid_locked_at = now(),
         status         = 'active',
         activated_at   = now(),
         device_name    = coalesce(p_device_name, device_name),
         app_version    = coalesce(p_app_version, app_version)
   where id = v_id
     and (hwid_locked is null or hwid_locked = v_target)
  returning * into v_lic;

  if not found then
    -- perangkat lain menang balapan
    select * into v_lic from public.licenses where id = v_id;
    return query select
      false, 'HWID_MISMATCH', 'Lisensi terikat perangkat lain. Aktifkan di komputer kasir yang sama.',
      v_lic.id, v_lic.partner_id, v_toko, v_lic.pembeli_nama, v_lic.paket_type,
      v_lic.license_type, v_lic.status, v_lic.hwid_locked, false, v_lic.activated_at, v_lic.expires_at;
    return;
  end if;

  return query select
    true, 'ACTIVATED', 'Serial Key berhasil diaktifkan dan terkunci ke perangkat ini.',
    v_lic.id, v_lic.partner_id, v_toko, v_lic.pembeli_nama, v_lic.paket_type,
    v_lic.license_type, v_lic.status, v_lic.hwid_locked, true, v_lic.activated_at, v_lic.expires_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. KOMISI LANGGANAN BULANAN
--
--    Untuk lisensi 'langganan' (12 bulan) komisi dibayar berkala: 1/12 harga
--    tahunan x persen tier, tiap bulan pelanggan perpanjang. Baris di tabel ini
--    adalah bukti pencatatan per bulan, jadi komisi bisa diaudit.
--
--    Tabel ini sengaja tidak punya kolom tanggal jatuh tempo: pencatatan
--    dilakukan toko setelah pelanggan benar-benar membayar (tombol di halaman
--    Aktivasi). Kalau pembayaran bulan itu telat, komisinya tetap masuk saat
--    dicatat -- tidak ada komisi bulan yang hilang diam-diam.
-- ---------------------------------------------------------------------------
create table if not exists public.langganan_pembayaran (
  id             uuid primary key default gen_random_uuid(),
  license_id     uuid        not null references public.licenses(id) on delete cascade,
  partner_id     uuid        not null references public.partners(id) on delete cascade,
  bulan_ke       integer     not null check (bulan_ke >= 1 and bulan_ke <= 12),
  dibayar_pada   timestamptz not null default now(),
  komisi_toko    integer     not null default 0 check (komisi_toko >= 0),
  created_at     timestamptz not null default now(),
  -- satu lisensi hanya boleh punya satu baris untuk bulan yang sama
  unique (license_id, bulan_ke)
);

create index if not exists idx_langganan_partner on public.langganan_pembayaran (partner_id);

-- ---------------------------------------------------------------------------
-- 9.1 RPC catat_langganan_bulan  (dipakai Route Handler POST /api/langganan)
--
--     Mencatat pembayaran langganan bulan BERIKUTNYA untuk satu lisensi:
--       1. cek lisensi milik toko yang sedang login dan bertipe 'langganan'
--       2. tentukan bulan berikutnya = max(bulan_ke) + 1, minimal 2. Angka 2
--          karena bulan 1 sudah dibayar saat pendaftaran dan tercatat di
--          licenses.komisi_amount, bukan di tabel ini -- supaya tidak dobel
--       3. komisi = (harga_jual / 12) x tier_rate -- tier_rate tersimpan di
--          baris lisensi, jadi memakai tier saat transaksi, bukan tier sekarang
--       4. tambah ke partners.komisi_total
--
--     Tulis hanya lewat fungsi ini (security definer) supaya nomor bulan tidak
--     bisa diisi sendiri oleh klien.
-- ---------------------------------------------------------------------------
drop function if exists public.catat_langganan_bulan(uuid);
create or replace function public.catat_langganan_bulan(p_license_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_lic        public.licenses;
  v_bulan_ke   integer;
  v_harga_bul  integer;
  v_komisi     integer;
begin
  v_partner_id := public.current_partner_id();

  if v_partner_id is null then
    raise exception 'PARTNER_NOT_FOUND';
  end if;

  select l.* into v_lic
    from public.licenses l
   where l.id = p_license_id
     and l.partner_id = v_partner_id;

  if not found then
    raise exception 'LICENSE_NOT_FOUND';
  end if;

  if v_lic.license_type <> 'langganan' then
    raise exception 'NOT_SUBSCRIPTION';
  end if;

  select greatest(coalesce(max(lp.bulan_ke), 0) + 1, 2) into v_bulan_ke
    from public.langganan_pembayaran lp
   where lp.license_id = p_license_id;

  if v_bulan_ke > 12 then
    raise exception 'SUBSCRIPTION_DONE';
  end if;

  if exists (
    select 1 from public.langganan_pembayaran
     where license_id = p_license_id and bulan_ke = v_bulan_ke
  ) then
    raise exception 'ALREADY_RECORDED';
  end if;

  v_harga_bul := round(coalesce(v_lic.harga_jual, 0) / 12.0);
  v_komisi    := round(v_harga_bul * coalesce(v_lic.tier_rate, 0) / 100)::integer;

  insert into public.langganan_pembayaran (license_id, partner_id, bulan_ke, komisi_toko)
  values (p_license_id, v_partner_id, v_bulan_ke, v_komisi);

  update public.partners
     set komisi_total = komisi_total + v_komisi
   where id = v_partner_id;

  return v_komisi;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. View toko_rekap -- SATU sumber angka untuk Home & Profile
--
--     Homepage dan Profile mengulang hitungan yang sama, dan angkanya bisa
--     berbeda begitu salah satu query gagal diam-diam. View ini menghitung
--     semuanya di database, jadi:
--       - total_key         = jumlah baris licenses, BUKAN counter
--                             total_terjual yang bisa melenceng kalau key
--                             dibuat lewat SQL/import
--       - bundle/app        = jumlah key per tipe paket
--       - komisi_penjualan  = SUM(licenses.komisi_amount)
--       - komisi_langganan  = SUM(langganan_pembayaran.komisi_toko)
--       - total_komisi      = penjualan + langganan (akumulasi, bukan counter)
--       - langganan_per_key = { "<license_id>": bulan_terakhir } untuk badge
--
--     `security_invoker = true` (PostgreSQL 15+) membuat RLS pada tabel di
--     bawahnya ikut berlaku ketika view dibaca, jadi satu toko tidak mungkin
--     melihat angka toko lain. Tanpa opsi ini view berjalan sebagai pemilik
--     view (membypass RLS) dan akan menjumlahkan SELURUH lisensi.
-- ---------------------------------------------------------------------------
create or replace view public.toko_rekap
with (security_invoker = true)
as
select
  p.id                                as partner_id,
  p.user_id,
  p.email,
  p.nama_toko,
  p.no_hp,
  p.alamat,
  p.status,
  p.license_quota                     as sisa,
  p.total_terjual                     as total_terjual_counter,
  p.komisi_total                      as komisi_total_counter,
  coalesce(k.total_key, 0)            as total_key,
  coalesce(k.bundle_count, 0)         as bundle_count,
  coalesce(k.app_count, 0)            as app_count,
  coalesce(k.komisi_penjualan, 0)     as komisi_penjualan,
  coalesce(lg.komisi_langganan, 0)    as komisi_langganan,
  coalesce(k.komisi_penjualan, 0)
    + coalesce(lg.komisi_langganan, 0) as total_komisi,
  coalesce(lg.per_key, '{}'::jsonb)   as langganan_per_key
from public.partners p
left join lateral (
  select count(*)::integer                                        as total_key,
         (count(*) filter (where l.paket_type = 'bundle'))::integer   as bundle_count,
         (count(*) filter (where l.paket_type = 'app_only'))::integer as app_count,
         coalesce(sum(l.komisi_amount), 0)::integer                 as komisi_penjualan
    from public.licenses l
   where l.partner_id = p.id
) k on true
left join lateral (
  select coalesce(sum(g.komisi), 0)::integer                    as komisi_langganan,
         jsonb_object_agg(g.license_id::text, g.bulan_terakhir) as per_key
    from (
      select lp.license_id,
             max(lp.bulan_ke)::integer    as bulan_terakhir,
             sum(lp.komisi_toko)::integer as komisi
        from public.langganan_pembayaran lp
       where lp.partner_id = p.id
       group by lp.license_id
    ) g
) lg on true;

-- ---------------------------------------------------------------------------
-- 10.1 Repair: samakan counter total_terjual dengan jumlah baris licenses
--
--     `partners.total_terjual` adalah counter yang dinaikkan RPC
--     `generate_license`, tapi kalau key pernah ditambah lewat SQL/import atau
--     lewat seed, counter-nya tertinggal. Efeknya tier toko salah (tier dibaca
--     dari counter itu) dan angka Home/Profile tidak sama dengan key yang
--     benar-benar ada.
--
--     Statement ini idempotent dan aman: hanya menyamakan counter ke kenyataan,
--     tidak menghapus key dan tidak mengubah komisi. Jalankan ulang schema.sql
--     kapan saja untuk memperbaikinya lagi.
-- ---------------------------------------------------------------------------
update public.partners p
   set total_terjual = k.total_key
  from (
    select partner_id, count(*)::integer as total_key
      from public.licenses
     group by partner_id
  ) k
 where k.partner_id = p.id
   and p.total_terjual is distinct from k.total_key;

-- toko yang belum punya key sama sekali -> samakan juga ke 0
update public.partners p
   set total_terjual = 0
 where p.total_terjual is distinct from 0
   and not exists (select 1 from public.licenses l where l.partner_id = p.id);

-- ---------------------------------------------------------------------------
-- 11. Row Level Security
--    Client (browser) hanya boleh membaca/menulis datanya sendiri.
--    Penulisan licenses hanya lewat RPC SECURITY DEFINER (dari Route Handler).
-- ---------------------------------------------------------------------------
alter table public.partners enable row level security;
alter table public.licenses enable row level security;

drop policy if exists "partners_select_own" on public.partners;
create policy "partners_select_own" on public.partners
  for select using (user_id = auth.uid());

drop policy if exists "partners_update_own" on public.partners;
create policy "partners_update_own" on public.partners
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "licenses_select_own" on public.licenses;
create policy "licenses_select_own" on public.licenses
  for select using (partner_id = public.current_partner_id());

-- akses tulis licenses DITOLAK untuk anon/authenticated:
drop policy if exists "licenses_insert_own" on public.licenses;
drop policy if exists "licenses_update_own" on public.licenses;
drop policy if exists "licenses_delete_own" on public.licenses;

-- langganan_pembayaran: toko hanya boleh MEMBACA pencatatan bulanannya.
-- Menulis harus lewat RPC catat_langganan_bulan() supaya nomor bulan & komisi
-- tidak bisa dipalsukan klien.
alter table public.langganan_pembayaran enable row level security;

drop policy if exists "langganan_pembayaran_select_own" on public.langganan_pembayaran;
create policy "langganan_pembayaran_select_own" on public.langganan_pembayaran
  for select using (partner_id = public.current_partner_id());

drop policy if exists "langganan_pembayaran_insert_own" on public.langganan_pembayaran;
drop policy if exists "langganan_pembayaran_update_own" on public.langganan_pembayaran;
drop policy if exists "langganan_pembayaran_delete_own" on public.langganan_pembayaran;

-- produk: katalog harga dikelola admin portal, jadi toko tidak diberi akses.
-- Bacanya cukup lewat RPC resolve_produk_harga() (security definer). RLS +
-- revoke-nya diurus admin-schema.sql; blok ini supaya aman kalau file admin
-- belum pernah dijalankan.
alter table public.produk enable row level security;
revoke all on public.produk from anon, authenticated;
grant select, insert, update, delete on public.produk to service_role;

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select, update on public.partners to authenticated;
grant select on public.licenses to authenticated;
grant select on public.langganan_pembayaran to authenticated;
grant select on public.toko_rekap to authenticated, service_role;
grant execute on function public.current_partner_id() to anon, authenticated, service_role;
grant execute on function public.generate_license(text, text, text, text, text, text, uuid) to authenticated, service_role;
grant execute on function public.activate_license(text, text, text, text) to service_role;
grant execute on function public.tier_rate_of(integer) to anon, authenticated, service_role;
grant execute on function public.tier_name_of(integer) to anon, authenticated, service_role;
grant execute on function public.base_commission_of(text) to anon, authenticated, service_role;
grant execute on function public.resolve_produk_harga(uuid, text) to service_role;
grant execute on function public.catat_langganan_bulan(uuid) to authenticated, service_role;

-- Catatan: bucket storage `store-logos` tidak lagi dipakai — fitur upload logo
-- toko sudah dihapus (portal memakai icon toko statis). Bucket di database yang
-- sudah terlanjur ada boleh dibuang lewat SQL Editor:
--     drop policy if exists "logos_public_read" on storage.objects;
--     delete from storage.objects where bucket_id = 'store-logos';
--     delete from storage.buckets where id = 'store-logos';

-- ---------------------------------------------------------------------------
-- 13. SETUP TOKO
--     Daftarkan akun lebih dulu di:
--       Supabase Dashboard > Authentication > Users > Add user
--       (centang "Auto Confirm User" supaya bisa langsung login)
--     Baris partners otomatis dibuat oleh trigger on_auth_user_created.
--     Setelah itu tinggal topup kuota:
--
--   update public.partners
--      set nama_toko     = 'Toko Komputer Maju',
--          no_hp         = '08123456789',
--          alamat        = 'Jl. Merdeka No. 10',
--          license_quota = 5
--    where email = 'toko@email.com';
--
--   Lihat daftar toko:
--   select id, email, nama_toko, license_quota, total_terjual, komisi_total
--     from public.partners order by created_at;
--
--   Ganti harga acuan komisi (dipakai generate_license untuk key BARU):
--   update public.produk set harga_sekali_bayar      = 500000,
--                           harga_langganan_tahunan = 250000
--    where nama_apariksi = 'POS AMD';
--
--   Reset lisensi yang terikat ke komputer salah (permintaan pembeli):
--   update public.licenses
--      set hwid_locked = null, hwid_locked_at = null, status = 'unused', activated_at = null
--    where serial_key = 'KPRO-XXXX-XXXX-XXXX';
-- ---------------------------------------------------------------------------
