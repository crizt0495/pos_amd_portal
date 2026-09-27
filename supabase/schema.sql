-- ===========================================================================
--  KasirPro - Supabase PostgreSQL Schema (FULL, with Row Level Security)
--  Jalankan seluruh file ini di Supabase Dashboard > SQL Editor > New Query
--  (aman diulang / idempotent)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('super_admin', 'partner', 'owner');
  end if;
  if not exists (select 1 from pg_type where typname = 'license_status') then
    create type public.license_status as enum ('unused', 'active', 'blocked', 'expired', 'revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'paket_type') then
    create type public.paket_type as enum ('bundle_pc_app', 'app_only');
  end if;
  if not exists (select 1 from pg_type where typname = 'license_type') then
    create type public.license_type as enum ('permanent', 'subscription');
  end if;
  if not exists (select 1 from pg_type where typname = 'partner_status') then
    create type public.partner_status as enum ('active', 'suspended');
  end if;
  if not exists (select 1 from pg_type where typname = 'tx_status') then
    create type public.tx_status as enum ('completed', 'void');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('cash', 'qris', 'transfer', 'debit', 'credit');
  end if;
  if not exists (select 1 from pg_type where typname = 'discount_type') then
    create type public.discount_type as enum ('none', 'percent', 'fixed');
  end if;
  if not exists (select 1 from pg_type where typname = 'payout_status') then
    create type public.payout_status as enum ('pending', 'paid');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER so RLS policies can use them safely)
-- ---------------------------------------------------------------------------
-- Current user role, read directly from `profiles` to avoid recursive RLS.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'super_admin', false);
$$;

create or replace function public.is_partner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'partner', false);
$$;

-- partner_id milik user yang sedang login (null kalau bukan partner)
create or replace function public.current_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.partners p where p.user_id = auth.uid() limit 1;
$$;

-- store_id milik user yang sedang login (null kalau bukan owner)
create or replace function public.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.stores s where s.user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. profiles  (1-1 dengan auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.app_role    not null default 'owner',
  email       text,
  full_name   text,
  phone       text,
  avatar_url  text,
  is_active   boolean            not null default true,
  created_at  timestamptz        not null default now(),
  updated_at  timestamptz        not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

-- Auto-create profile saat user dibuat di Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, email, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'owner'),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at auto trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. partners  (Toko Komputer / IMD)
-- ---------------------------------------------------------------------------
create table if not exists public.partners (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid unique references public.profiles(id) on delete set null,
  nama_toko            text        not null,
  alamat               text,
  no_hp                text,
  -- jatah lisensi
  license_quota        integer     not null default 5 check (license_quota >= 0),
  license_granted      integer     not null default 0 check (license_granted >= 0),
  -- komisi untuk langganan (persen, recurring)
  commission_rate      numeric(5,2) not null default 10.00 check (commission_rate >= 0 and commission_rate <= 100),
  status               public.partner_status not null default 'active',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_partners_user on public.partners(user_id);
drop trigger if exists trg_partners_updated on public.partners;
create trigger trg_partners_updated before update on public.partners
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. stores  (Toko pembeli / end user)
-- ---------------------------------------------------------------------------
create table if not exists public.stores (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid references public.partners(id) on delete set null,
  user_id       uuid unique references public.profiles(id) on delete set null,
  store_name    text        not null,
  owner_name    text        not null,
  no_hp         text,
  alamat        text,
  paket_type    public.paket_type not null default 'app_only',
  license_type  public.license_type not null default 'permanent',
  -- catatan perangkat (mis. nama PC kasir, nomor seri) diisi saat aktivasi
  device_note   text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_stores_partner on public.stores(partner_id);
create index if not exists idx_stores_user on public.stores(user_id);
drop trigger if exists trg_stores_updated on public.stores;
create trigger trg_stores_updated before update on public.stores
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. licenses
-- ---------------------------------------------------------------------------
create table if not exists public.licenses (
  id              uuid primary key default gen_random_uuid(),
  serial_key      text        not null unique,
  partner_id      uuid references public.partners(id) on delete restrict,
  store_id        uuid references public.stores(id) on delete set null,
  hwid_locked     text,
  status          public.license_status not null default 'unused',
  paket_type      public.paket_type   not null default 'app_only',
  license_type    public.license_type not null default 'permanent',
  -- harga & komisi (dibayar ke partner, sisanya untuk kita)
  price_idr       numeric(14,2) not null default 0,
  commission_idr  numeric(14,2) not null default 0,
  -- masa aktif langganan
  period_months   integer,
  expires_at      timestamptz,
  activated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_licenses_partner on public.licenses(partner_id);
create index if not exists idx_licenses_store on public.licenses(store_id);
create index if not exists idx_licenses_status on public.licenses(status);
create index if not exists idx_licenses_hwid on public.licenses(hwid_locked);
create index if not exists idx_licenses_serial_lower on public.licenses (lower(serial_key));
drop trigger if exists trg_licenses_updated on public.licenses;
create trigger trg_licenses_updated before update on public.licenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. hwid_history  (riwayat HWID yang pernah terkunci ke sebuah lisensi)
--    dipakai untuk mendeteksi copy aplikasi / reset tidak sah
-- ---------------------------------------------------------------------------
create table if not exists public.hwid_history (
  id            uuid primary key default gen_random_uuid(),
  license_id    uuid not null references public.licenses(id) on delete cascade,
  hwid          text not null,
  device_name   text,
  app_version   text,
  is_current    boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_hwid_history_license on public.hwid_history(license_id);
create index if not exists idx_hwid_history_hwid on public.hwid_history(hwid);
create unique index if not exists uq_hwid_history_license_hwid_current
  on public.hwid_history (license_id) where is_current;

-- ---------------------------------------------------------------------------
-- 8. hwid_logs  (audit trail aktivasi)
-- ---------------------------------------------------------------------------
create table if not exists public.hwid_logs (
  id            uuid primary key default gen_random_uuid(),
  license_id    uuid references public.licenses(id) on delete set null,
  hwid          text not null,
  ip_address    text,
  user_agent    text,
  result        text not null default 'success', -- success | mismatch | invalid_key | blocked | expired
  detail        text,
  activated_at  timestamptz not null default now()
);

create index if not exists idx_hwid_logs_license on public.hwid_logs(license_id);
create index if not exists idx_hwid_logs_hwid on public.hwid_logs(hwid);
create index if not exists idx_hwid_logs_time on public.hwid_logs(activated_at desc);

-- ---------------------------------------------------------------------------
-- 9. products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  sku          text,
  barcode      text,
  name         text not null,
  category     text default 'Umum',
  price        numeric(14,2) not null default 0 check (price >= 0),
  cost         numeric(14,2) not null default 0 check (cost >= 0),
  stock        integer not null default 0,
  min_stock    integer not null default 0,
  unit         text not null default 'pcs',
  image_url    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_products_store on public.products(store_id);
create index if not exists idx_products_barcode on public.products(store_id, barcode);
create index if not exists idx_products_name on public.products(store_id, name);
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 10. transactions
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id               uuid primary key,
  store_id         uuid not null references public.stores(id) on delete cascade,
  invoice_no       text not null,
  subtotal         numeric(14,2) not null default 0,
  discount_type    public.discount_type not null default 'none',
  discount_value   numeric(14,2) not null default 0,
  discount_amount  numeric(14,2) not null default 0,
  total            numeric(14,2) not null default 0,
  total_cost       numeric(14,2) not null default 0,
  paid             numeric(14,2) not null default 0,
  change_due       numeric(14,2) not null default 0,
  payment_method   public.payment_method not null default 'cash',
  note             text,
  cashier_name     text,
  device_id        text,
  status           public.tx_status not null default 'completed',
  created_at       timestamptz not null default now(),
  synced_at        timestamptz
);

create index if not exists idx_tx_store on public.transactions(store_id);
create index if not exists idx_tx_created on public.transactions(store_id, created_at desc);
create index if not exists idx_tx_invoice on public.transactions(store_id, invoice_no);

-- ---------------------------------------------------------------------------
-- 11. transaction_items
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_items (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  store_id       uuid not null references public.stores(id) on delete cascade,
  product_id     uuid,
  barcode        text,
  product_name   text not null,
  price          numeric(14,2) not null default 0,
  cost           numeric(14,2) not null default 0,
  qty            numeric(12,2) not null default 1,
  discount       numeric(14,2) not null default 0,
  subtotal       numeric(14,2) not null default 0
);

create index if not exists idx_tx_items_tx on public.transaction_items(transaction_id);
create index if not exists idx_tx_items_product on public.transaction_items(product_id);
create index if not exists idx_tx_items_store on public.transaction_items(store_id);

-- ---------------------------------------------------------------------------
-- 12. payouts  (catatan transfer komisi ke partner)
-- ---------------------------------------------------------------------------
create table if not exists public.payouts (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  amount      numeric(14,2) not null check (amount >= 0),
  period_from date,
  period_to   date,
  status      public.payout_status not null default 'pending',
  note        text,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_payouts_partner on public.payouts(partner_id);

-- ---------------------------------------------------------------------------
-- 13. activity_logs (audit panel admin)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text,
  entity_id   text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_time on public.activity_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- 14. Atomic license generation + quota decrement
--     (dipakai oleh API Route server, tidak pernah oleh browser)
-- ---------------------------------------------------------------------------
create or replace function public.create_license(
  p_partner_id     uuid,
  p_store_id       uuid default null,
  p_serial_key     text,
  p_paket_type     public.paket_type   default 'app_only',
  p_license_type   public.license_type default 'permanent',
  p_price_idr      numeric default 0,
  p_commission_idr numeric default 0,
  p_period_months  integer default null,
  p_expires_at     timestamptz default null,
  p_actor_email    text default null
)
returns public.licenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota     integer;
  v_license   public.licenses;
begin
  -- kunci baris partner supaya quota tidak bisa terpakai dua kali (race condition)
  select license_quota into v_quota
  from public.partners
  where id = p_partner_id
  for update;

  if v_quota is null then
    raise exception 'PARTNER_NOT_FOUND';
  end if;
  if v_quota <= 0 then
    raise exception 'QUOTA_EXHAUSTED';
  end if;

  insert into public.licenses (
    serial_key, partner_id, store_id, paket_type, license_type,
    price_idr, commission_idr, period_months, expires_at, status
  )
  values (
    p_serial_key, p_partner_id, p_store_id, p_paket_type, p_license_type,
    p_price_idr, p_commission_idr, p_period_months, p_expires_at, 'unused'
  )
  returning * into v_license;

  update public.partners
     set license_quota = license_quota - 1,
         license_granted = license_granted + 1
   where id = p_partner_id;

  insert into public.activity_logs (actor_email, action, entity, entity_id, meta)
  values (p_actor_email, 'license.create', 'license', v_license.id::text,
          jsonb_build_object('serial_key', p_serial_key, 'partner_id', p_partner_id));

  return v_license;
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. Atomic HWID lock (dipakai oleh /api/activate)
--     - kalau status = unused  -> kunci HWID
--     - kalau status = active   -> hanya boleh jika HWID sama persis
--     - kalau blocked/expired  -> tolak
-- ---------------------------------------------------------------------------
create or replace function public.activate_license(
  p_serial_key  text,
  p_hwid        text,
  p_ip          text default null,
  p_user_agent  text default null,
  p_device_name text default null,
  p_app_version text default null
)
returns table (
  ok            boolean,
  code          text,
  message       text,
  license_id    uuid,
  partner_id    uuid,
  store_id      uuid,
  store_name    text,
  owner_name    text,
  paket_type    public.paket_type,
  license_type  public.license_type,
  hwid_locked   text,
  locked_now    boolean,
  expires_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lic      public.licenses%rowtype;
  v_store    public.stores%rowtype;
  v_locked   boolean := false;
  v_ok       boolean := false;
  v_code     text;
  v_msg      text;
begin
  select * into v_lic
  from public.licenses
  where lower(serial_key) = lower(trim(p_serial_key));

  if not found then
    insert into public.hwid_logs (license_id, hwid, ip_address, user_agent, result, detail)
    values (null, p_hwid, p_ip, p_user_agent, 'invalid_key', 'Serial key tidak ditemukan');
    return query select false, 'INVALID_KEY', 'Serial Key tidak valid.', null::uuid, null::uuid,
                        null::uuid, null::text, null::text, null::public.paket_type,
                        null::public.license_type, null::text, false, null::timestamptz;
    return;
  end if;

  if v_lic.status = 'blocked' then
    insert into public.hwid_logs (license_id, hwid, ip_address, user_agent, result, detail)
    values (v_lic.id, p_hwid, p_ip, p_user_agent, 'blocked', 'Lisensi diblokir admin');
    return query select false, 'BLOCKED', 'Lisensi ini telah diblokir. Hubungi admin.', v_lic.id,
                        v_lic.partner_id, v_lic.store_id, null::text, null::text, v_lic.paket_type,
                        v_lic.license_type, v_lic.hwid_locked, false, v_lic.expires_at;
    return;
  end if;

  if v_lic.status = 'expired'
     or (v_lic.expires_at is not null and v_lic.expires_at < now()) then
    insert into public.hwid_logs (license_id, hwid, ip_address, user_agent, result, detail)
    values (v_lic.id, p_hwid, p_ip, p_user_agent, 'expired', 'Masa langganan habis');
    return query select false, 'EXPIRED', 'Masa langganan lisensi ini sudah habis.', v_lic.id,
                        v_lic.partner_id, v_lic.store_id, null::text, null::text, v_lic.paket_type,
                        v_lic.license_type, v_lic.hwid_locked, false, v_lic.expires_at;
    return;
  end if;

  if v_lic.license_type = 'subscription' and v_lic.status <> 'unused' then
    update public.licenses set status = 'expired' where id = v_lic.id;
    v_lic.status := 'expired';
    insert into public.hwid_logs (license_id, hwid, ip_address, user_agent, result, detail)
    values (v_lic.id, p_hwid, p_ip, p_user_agent, 'expired', 'Masa langganan habis');
    return query select false, 'EXPIRED', 'Masa langganan lisensi ini sudah habis.', v_lic.id,
                        v_lic.partner_id, v_lic.store_id, null::text, null::text, v_lic.paket_type,
                        v_lic.license_type, v_lic.hwid_locked, false, v_lic.expires_at;
    return;
  end if;

  -- sudah pernah dipakai?
  if v_lic.status = 'active' and v_lic.hwid_locked is not null then
    if v_lic.hwid_locked = p_hwid then
      v_ok := true; v_code := 'ALREADY_ACTIVE';
      v_msg := 'Lisensi sudah aktif di perangkat ini.';
    else
      insert into public.hwid_logs (license_id, hwid, ip_address, user_agent, result, detail)
      values (v_lic.id, p_hwid, p_ip, p_user_agent, 'mismatch',
              format('HWID perangkat tidak cocok. Terkunci: %s', v_lic.hwid_locked));
      return query select false, 'HWID_MISMATCH',
        'Aplikasi ini di-copy ke komputer lain. Lisensi terkunci di perangkat asli, hubungi admin.',
        v_lic.id, v_lic.partner_id, v_lic.store_id, null::text, null::text, v_lic.paket_type,
        v_lic.license_type, v_lic.hwid_locked, false, v_lic.expires_at;
      return;
    end if;
  else
    -- kunci HWID sekarang
    v_ok := true; v_locked := true; v_code := 'ACTIVATED';
    v_msg := 'Lisensi berhasil diaktifkan dan terkunci ke perangkat ini.';

    update public.licenses
       set hwid_locked = p_hwid,
           status      = 'active',
           activated_at = now()
     where id = v_lic.id
     returning * into v_lic;

    -- tandai HWID lama sebagai bukan current
    update public.hwid_history set is_current = false where license_id = v_lic.id;
    insert into public.hwid_history (license_id, hwid, is_current, device_name, app_version)
    values (v_lic.id, p_hwid, true, p_device_name, p_app_version);

    insert into public.hwid_logs (license_id, hwid, ip_address, user_agent, result, detail)
    values (v_lic.id, p_hwid, p_ip, p_user_agent, 'success', 'HWID dikunci');

    insert into public.activity_logs (actor_email, action, entity, entity_id, meta)
    values (p_user_agent, 'license.activate', 'license', v_lic.id::text,
            jsonb_build_object('hwid', p_hwid, 'ip', p_ip));
  end if;

  select * into v_store from public.stores where id = v_lic.store_id;

  return query select v_ok, v_code, v_msg, v_lic.id, v_lic.partner_id, v_lic.store_id,
                      v_store.store_name, v_store.owner_name, v_lic.paket_type,
                      v_lic.license_type, v_lic.hwid_locked, v_locked, v_lic.expires_at;
end;
$$;

-- Helper: cek HWID tanpa mengubah apa pun (dipakai /api/pos/verify)
create or replace function public.verify_license_hwid(p_serial_key text, p_hwid text)
returns table (
  ok boolean, code text, message text,
  license_id uuid, store_id uuid, store_name text, owner_name text,
  paket_type public.paket_type, license_type public.license_type,
  hwid_locked text, expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when l.id is null then false
      when l.status = 'blocked' then false
      when l.status <> 'active' then false
      when l.hwid_locked is distinct from p_hwid then false
      when l.expires_at is not null and l.expires_at < now() then false
      else true
    end,
    case
      when l.id is null then 'INVALID_KEY'
      when l.status = 'blocked' then 'BLOCKED'
      when l.status <> 'active' then 'NOT_ACTIVE'
      when l.hwid_locked is distinct from p_hwid then 'HWID_MISMATCH'
      when l.expires_at is not null and l.expires_at < now() then 'EXPIRED'
      else 'OK'
    end,
    case
      when l.id is null then 'Serial Key tidak valid.'
      when l.status = 'blocked' then 'Lisensi diblokir admin.'
      when l.status <> 'active' then 'Lisensi belum diaktifkan.'
      when l.hwid_locked is distinct from p_hwid then 'Lisensi terkunci di perangkat lain.'
      when l.expires_at is not null and l.expires_at < now() then 'Masa langganan habis.'
      else 'Lisensi valid.'
    end,
    l.id, l.store_id, s.store_name, s.owner_name, l.paket_type, l.license_type, l.hwid_locked, l.expires_at
  from public.licenses l
  left join public.stores s on s.id = l.store_id
  where lower(l.serial_key) = lower(trim(coalesce(p_serial_key, '')));
$$;

-- ---------------------------------------------------------------------------
-- 16. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.partners             enable row level security;
alter table public.stores               enable row level security;
alter table public.licenses             enable row level security;
alter table public.hwid_history          enable row level security;
alter table public.hwid_logs             enable row level security;
alter table public.products              enable row level security;
alter table public.transactions          enable row level security;
alter table public.transaction_items     enable row level security;
alter table public.payouts              enable row level security;
alter table public.activity_logs        enable row level security;

-- profiles -------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select using (public.is_super_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- partners -------------------------------------------------------------------
drop policy if exists "partners_select_own" on public.partners;
create policy "partners_select_own" on public.partners
  for select using (user_id = auth.uid());

drop policy if exists "partners_select_admin" on public.partners;
create policy "partners_select_admin" on public.partners
  for select using (public.is_super_admin());

drop policy if exists "partners_update_own" on public.partners;
create policy "partners_update_own" on public.partners
  for update using (user_id = auth.uid());

drop policy if exists "partners_admin_all" on public.partners;
create policy "partners_admin_all" on public.partners
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- stores ---------------------------------------------------------------------
drop policy if exists "stores_select_partner" on public.stores;
create policy "stores_select_partner" on public.stores
  for select using (partner_id = public.current_partner_id() or public.is_super_admin());

drop policy if exists "stores_select_owner" on public.stores;
create policy "stores_select_owner" on public.stores
  for select using (user_id = auth.uid());

drop policy if exists "stores_admin_all" on public.stores;
create policy "stores_admin_all" on public.stores
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- licenses -------------------------------------------------------------------
drop policy if exists "licenses_select_partner" on public.licenses;
create policy "licenses_select_partner" on public.licenses
  for select using (partner_id = public.current_partner_id() or public.is_super_admin());

drop policy if exists "licenses_select_store" on public.licenses;
create policy "licenses_select_store" on public.licenses
  for select using (store_id = public.current_store_id());

drop policy if exists "licenses_admin_all" on public.licenses;
create policy "licenses_admin_all" on public.licenses
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- hwid_history ---------------------------------------------------------------
drop policy if exists "hwid_history_select_partner" on public.hwid_history;
create policy "hwid_history_select_partner" on public.hwid_history
  for select using (
    exists (select 1 from public.licenses l
            where l.id = hwid_history.license_id
              and (l.partner_id = public.current_partner_id() or public.is_super_admin()))
  );

drop policy if exists "hwid_history_admin_all" on public.hwid_history;
create policy "hwid_history_admin_all" on public.hwid_history
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- hwid_logs ------------------------------------------------------------------
drop policy if exists "hwid_logs_select_partner" on public.hwid_logs;
create policy "hwid_logs_select_partner" on public.hwid_logs
  for select using (
    exists (select 1 from public.licenses l
            where l.id = hwid_logs.license_id
              and (l.partner_id = public.current_partner_id() or public.is_super_admin()))
  );

drop policy if exists "hwid_logs_admin_all" on public.hwid_logs;
create policy "hwid_logs_admin_all" on public.hwid_logs
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- products -------------------------------------------------------------------
drop policy if exists "products_owner" on public.products;
create policy "products_owner" on public.products
  for all using (store_id = public.current_store_id() or public.is_super_admin())
  with check (store_id = public.current_store_id() or public.is_super_admin());

drop policy if exists "products_partner_read" on public.products;
create policy "products_partner_read" on public.products
  for select using (exists (select 1 from public.stores s
                            where s.id = products.store_id
                              and s.partner_id = public.current_partner_id()));

-- transactions ---------------------------------------------------------------
drop policy if exists "transactions_owner" on public.transactions;
create policy "transactions_owner" on public.transactions
  for all using (store_id = public.current_store_id() or public.is_super_admin())
  with check (store_id = public.current_store_id() or public.is_super_admin());

drop policy if exists "transactions_partner_read" on public.transactions;
create policy "transactions_partner_read" on public.transactions
  for select using (exists (select 1 from public.stores s
                            where s.id = transactions.store_id
                              and s.partner_id = public.current_partner_id()));

-- transaction_items ----------------------------------------------------------
drop policy if exists "transaction_items_owner" on public.transaction_items;
create policy "transaction_items_owner" on public.transaction_items
  for all using (store_id = public.current_store_id() or public.is_super_admin())
  with check (store_id = public.current_store_id() or public.is_super_admin());

-- payouts --------------------------------------------------------------------
drop policy if exists "payouts_partner_read" on public.payouts;
create policy "payouts_partner_read" on public.payouts
  for select using (partner_id = public.current_partner_id() or public.is_super_admin());

drop policy if exists "payouts_admin_all" on public.payouts;
create policy "payouts_admin_all" on public.payouts
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- activity_logs --------------------------------------------------------------
drop policy if exists "activity_logs_admin_read" on public.activity_logs;
create policy "activity_logs_admin_read" on public.activity_logs
  for select using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 17. Grants
--    API Route memakai service_role (melewati RLS) setelah validasi manual.
--    Peran anon/authenticated tetap bisa memakai RPC & policy di atas.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on function public.activate_license(text, text, text, text, text, text) to service_role, authenticated;
grant execute on function public.verify_license_hwid(text, text) to service_role, authenticated;
grant execute on function public.create_license(uuid, uuid, text, public.paket_type, public.license_type, numeric, numeric, integer, timestamptz, text) to service_role;
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.current_partner_id() to anon, authenticated;
grant execute on function public.current_store_id() to anon, authenticated;

-- Helper untuk membuat admin pertama:
--   update public.profiles set role = 'super_admin' where email = 'email@anda.com';
-- Jalankan manual dari SQL Editor setelah user pertama dibuat.
