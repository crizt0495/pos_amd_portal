#!/usr/bin/env node
/**
 * ============================================================================
 *  check-supabase — memastikan portal siap dipakai
 * ============================================================================
 *  Menguji satu per satu bagian yang dibutuhkan aplikasi:
 *    1. Variabel env terisi
 *    2. Kunci bisa dipakai (auth)
 *    3. Tabel partners & licenses ada
 *    4. RPC generate_license & activate_license ada (dicek TANPA mengubah data)
 *    5. Bucket storage store-logos ada
 *
 *  Jalankan:
 *      npm run check:supabase
 *
 *  Keluar dengan kode 0 kalau semua hijau, 1 kalau ada yang belum siap.
 * ============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '..');

let warn = 0;
let fail = 0;

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const d = (s) => `\x1b[90m${s}\x1b[0m`;

function ok(msg) {
  console.log(`  ${g('OK  ')} ${msg}`);
}
function info(msg) {
  warn += 1;
  console.log(`  ${y('CEK ')} ${msg}`);
}
function bad(msg) {
  fail += 1;
  console.log(`  ${r('GAGAL')} ${msg}`);
}

/* ------------------------------------------------------------------ */
/* 1. env                                                             */
/* ------------------------------------------------------------------ */
console.log('\n1. Variabel environment');
loadEnv();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const publishable =
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '').trim();
const secret = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();

if (url && !url.includes('xxxx')) ok(`SUPABASE_URL = ${url}`);
else bad('SUPABASE_URL kosong — isi di .env.local (lihat .env.example)');

if (publishable) ok('Kunci publik terisi (sb_publishable_/anon)');
else bad('Kunci publik kosong (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)');

if (secret) ok('Kunci service role terisi (server only)');
else bad('SERVICE_KEY / SUPABASE_SECRET_KEY kosong — dipakai /api/activate');

if (fail > 0) {
  console.log(`\n${r('Gagal')} — lengkapi .env.local dulu, lalu ulangi.\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* 2-5. cek server                                                    */
/* ------------------------------------------------------------------ */
const REST = `${url.replace(/\/+$/, '')}/rest/v1`;

async function rest(pathname, init = {}) {
  const res = await fetch(`${REST}${pathname}`, {
    ...init,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, raw: text };
}

const missing = (body) =>
  /PGRST205|Could not find the table|schema cache/i.test(
    `${body?.message || ''} ${body?.hint || ''} ${body?.details || ''}`,
  );
const noFunc = (body) =>
  /PGRST202|Could not find the function|does not exist/i.test(
    `${body?.message || ''} ${body?.hint || ''} ${body?.details || ''}`,
  );

console.log('\n2. Koneksi & kunci');
{
  const res = await rest('/partners?select=id&limit=1');
  if (res.status === 200) ok('Kunci service role diterima oleh Supabase');
  else if (missing(res.body))
    bad('Tabel public.partners belum ada — jalankan supabase/schema.sql');
  else bad(`Server menolak kunci: ${res.status} ${res.body?.message || res.raw}`);
}

console.log('\n3. Tabel');
for (const table of ['partners', 'licenses']) {
  const res = await rest(`/${table}?select=*&limit=1`);
  if (res.status === 200) ok(`Tabel public.${table} ada`);
  else if (missing(res.body)) bad(`Tabel public.${table} belum ada — jalankan supabase/schema.sql`);
  else if (noFunc(res.body)) bad(`Kolom/kolom pada ${table} tidak cocok — jalankan ulang schema.sql (idempotent)`);
  else bad(`Tabel public.${table} error: ${res.status} ${res.body?.message || res.raw}`);
}
{
  // username dipakai untuk login (username & password)
  const res = await rest('/partners?select=username&limit=1');
  if (res.status === 200) ok('Kolom partners.username ada (login pakai username)');
  else if (noFunc(res.body)) bad('Kolom partners.username belum ada — jalankan ulang schema.sql');
  else bad(`partners.username error: ${res.status} ${res.body?.message || res.raw}`);
}

console.log('\n4. Fungsi RPC');
{
  // current_partner_id() -> null kalau tidak ada sesi login. Tidak mengubah data.
  const res = await rest('/rpc/current_partner_id', { method: 'POST', body: '{}' });
  if (res.status === 200 || res.status === 204) ok('RPC current_partner_id() ada');
  else if (noFunc(res.body)) bad('RPC current_partner_id() belum ada — jalankan schema.sql');
  else bad(`RPC current_partner_id() error: ${res.status} ${res.body?.message || res.raw}`);
}
{
  // tier_rate_of(0) -> 5.00 (murni fungsi, aman dipanggil)
  const res = await rest('/rpc/tier_rate_of', {
    method: 'POST',
    body: JSON.stringify({ p_total_terjual: 0 }),
  });
  if (res.status === 200) {
    const v = Array.isArray(res.body) ? res.body[0] : res.body;
    ok(`RPC tier_rate_of() ada (Bronze 0 lisensi = ${Number(v)}%)`);
  } else if (noFunc(res.body)) bad('RPC tier_rate_of() belum ada — jalankan schema.sql');
  else bad(`RPC tier_rate_of() error: ${res.status} ${res.body?.message || res.raw}`);
}
{
  // generate_license tanpa sesi login -> harus raise PARTNER_NOT_FOUND (tidak insert apa pun)
  const res = await rest('/rpc/generate_license', {
    method: 'POST',
    body: JSON.stringify({
      p_serial_key: 'KPRO-TEST-TEST-TEST',
      p_pembeli_nama: 'Cek Otomatis',
    }),
  });
  const msg = res.body?.message || '';
  if (res.status === 200) ok('RPC generate_license() ada');
  else if (noFunc(res.body)) bad('RPC generate_license() belum ada — jalankan schema.sql');
  else if (/PARTNER_NOT_FOUND/i.test(msg))
    ok('RPC generate_license() ada (aman: menolak tanpa sesi login)');
  else bad(`RPC generate_license() error: ${res.status} ${msg || res.raw}`);
}
{
  // activate_license dengan key yang pasti tidak ada -> INVALID_KEY, tidak mengubah apa pun
  const res = await rest('/rpc/activate_license', {
    method: 'POST',
    body: JSON.stringify({
      p_serial_key: 'KPRO-ZZZZ-ZZZZ-ZZZZ',
      p_hwid: '0'.repeat(32),
    }),
  });
  const rows = Array.isArray(res.body) ? res.body : res.body ? [res.body] : [];
  if (res.status === 200 && rows[0]?.code === 'INVALID_KEY') {
    ok('RPC activate_license() ada (aman: key tidak dikenal -> INVALID_KEY)');
  } else if (noFunc(res.body)) bad('RPC activate_license() belum ada — jalankan schema.sql');
  else bad(`RPC activate_license() error: ${res.status} ${res.body?.message || res.raw}`);
}

console.log('\n5. Storage (logo toko)');
{
  const res = await fetch(`${url.replace(/\/+$/, '')}/storage/v1/bucket/store-logos`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  });
  if (res.status === 200) ok('Bucket storage "store-logos" ada');
  else bad('Bucket "store-logos" belum ada — jalankan supabase/schema.sql (bagian 10)');
}

console.log('\n6. Data toko');
{
  const res = await rest('/partners?select=id,email,username,nama_toko,license_quota,total_terjual&limit=20');
  const rows = Array.isArray(res.body) ? res.body : [];
  if (res.status === 200 && rows.length === 0) {
    info('Belum ada toko terdaftar. Buat akun di Supabase > Authentication > Users > Add user');
  } else if (res.status === 200) {
    ok(`${rows.length} toko terdaftar`);
    for (const p of rows) {
      console.log(
        d(
          `      @${p.username || '(tanpa username)'} | ${p.email || '(tanpa email)'} | ${p.nama_toko} | sisa ${p.license_quota} | terjual ${p.total_terjual}`,
        ),
      );
    }
    console.log(d('      login demo: username "demo" / password "toko12345" (lihat halaman login)'));
    const tanpa = rows.filter((p) => !p.license_quota);
    if (tanpa.length) {
      info(
        `${tanpa.length} toko punya license_quota = 0, tidak bisa generate key. Perintah topup:`,
      );
      console.log(
        d(
          `      update public.partners set nama_toko='Toko Saya', license_quota=5 where email='${tanpa[0].email || ''}';`,
        ),
      );
    }
  } else if (!missing(res.body)) {
    bad(`Gagal membaca daftar toko: ${res.status} ${res.body?.message || ''}`);
  }
}

/* ------------------------------------------------------------------ */
console.log('');
if (fail === 0 && warn === 0) {
  console.log(g('SEMUA SIAP') + ' — portal siap dipakai.\n');
  process.exit(0);
}
if (fail === 0) {
  console.log(y('SIAP dengan catatan') + ' — baca bagian CEK di atas.\n');
  process.exit(0);
}
console.log(r(`${fail} masalah belum selesai`) + ' — perbaiki dulu sebelum dipakai.\n');
process.exit(1);

/* ------------------------------------------------------------------ */
function loadEnv() {
  for (const f of ['.env.local', '.env.production.local', '.env']) {
    const file = path.join(ROOT, f);
    if (!fs.existsSync(file)) continue;
    for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
