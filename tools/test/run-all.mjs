#!/usr/bin/env node
/**
 * ============================================================================
 *  test — UJI MENYELURUH KASIRPRO (portal)
 * ============================================================================
 *  Menjalankan semua pemeriksaan yang bisa dilakukan di mesin ini:
 *
 *   A. Statis  — tidak ada karakter asing (CJK), tidak ada kunci Supabase bocor
 *   B. Portal  — typecheck, next build, route API, cek Supabase
 *
 *  Yang TIDAK bisa diuji di sini dan butuh Dashboard Anda:
 *   - penerapan portal/supabase/schema.sql ke Supabase  (dicek di bagian B)
 *   - panggilan HTTP ke domain Vercel yang sudah online
 *
 *  Jalankan:
 *      npm test            semua
 *      npm test -- statis  hanya bagian A
 *      npm test -- portal  A + B
 * ============================================================================
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// berkas ini: <repo>/tools/test/run-all.mjs  ->  root repo dua tingkat di atas
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTAL = path.join(ROOT, 'portal');

const only = process.argv[2] || 'all';
const run = (s) => ['all', s].includes(only);

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const results = [];
let current = '';

function head(name) {
  current = name;
  console.log(`\n${c.bold}${c.cyan}=== ${name} ===${c.reset}`);
}

function ok(msg) {
  results.push({ suite: current, name: msg, pass: true });
  console.log(`  ${c.green}OK  ${c.reset} ${msg}`);
}

function fail(msg, detail = '') {
  results.push({ suite: current, name: msg, pass: false, detail });
  console.log(`  ${c.red}GAGAL${c.reset} ${msg}`);
  if (detail) {
    for (const line of String(detail).split('\n').slice(0, 14)) {
      console.log(`       ${c.dim}${line}${c.reset}`);
    }
  }
}

function skip(msg) {
  console.log(`  ${c.yellow}LEWAT${c.reset} ${msg}`);
}

/** Jalankan perintah, kembalikan { ok, out }. */
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    timeout: opts.timeout || 15 * 60 * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function assert(name, cond, detail) {
  if (cond) ok(name);
  else fail(name, detail);
  return cond;
}

/** Cek file benar-benar ada (bukan sekadar "tidak error"). */
function hasFile(name, file) {
  const p = file.startsWith('/') ? file : path.join(ROOT, file);
  assert(name, fs.existsSync(p) && fs.statSync(p).size > 0, `tidak ada / kosong: ${p}`);
}

const started = Date.now();

/* ================================================================== */
/* A. Statis                                                          */
/* ================================================================== */
if (run('statis') || run('all') || run('portal')) {
  head('A. Pemeriksaan statis');

  // tidak boleh ada karakter CJK /_fullwidth yang tersesat di file sumber
  const cjk = /[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|md|sql|css|html|yml)$/.test(e.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        txt.split('\n').forEach((l, i) => {
          if (cjk.test(l)) offenders.push(`${path.relative(ROOT, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(ROOT);
  if (offenders.length === 0) ok('tidak ada karakter asing (CJK) di file sumber');
  else fail(`${offenders.length} baris punya karakter asing`, offenders.slice(0, 10).join('\n'));

  // Larangan: modifier `order:` / `limit:` di DALAM kurung select() untuk
  // tabel yang di-embed.
  //
  // PostgREST membaca isi kurung select() sebagai DAFTAR KOLOM, jadi
  // `licenses(order: created_at.desc, limit: 20, ...)` berarti ia mencari kolom
  // bernama "order: created_at.desc" -> query gagal 42703 -> `data` selalu
  // null. Akibatnya angka kuota jadi 0 dan daftar key kosong, padahal datanya
  // ada. (order/limit untuk tabel ter-embed hanya bisa lewat query parameter
  // `&licenses.order=...`, yang tidak bisa ditulis di postgrest-js.)
  const BAD_EMBED = /\b(?:order|limit)\s*:/;
  const embedOffenders = [];
  const scanSelect = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scanSelect(p);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        let from = 0;
        for (;;) {
          const at = txt.indexOf('.select(', from);
          if (at === -1) break;
          // ambil isi kurung select() secara berpasangan
          let depth = 0;
          let k = at + '.select'.length;
          for (; k < txt.length; k += 1) {
            if (txt[k] === '(') depth += 1;
            else if (txt[k] === ')') {
              depth -= 1;
              if (depth === 0) break;
            }
          }
          if (BAD_EMBED.test(txt.slice(at, k + 1))) {
            embedOffenders.push(`${path.relative(ROOT, p)}:${txt.slice(0, at).split('\n').length}`);
          }
          from = at + 1;
        }
      }
    }
  };
  scanSelect(path.join(PORTAL, 'src'));
  if (embedOffenders.length === 0)
    ok('tidak ada modifier order/limit di dalam kurung select()');
  else
    fail(
      `${embedOffenders.length} select() memuat "order:"/"limit:" di dalam kurung (query akan gagal)`,
      embedOffenders.slice(0, 10).join('\n'),
    );

  // tidak boleh ada kunci asli yang bocor ke file yang di-commit.
  // Pola dirakit dari potongan supaya berkas ini sendiri tidak cocok.
  const LEAK = new RegExp(['sb', 'secret_', '[A-Za-z0-9]{20,}'].join(''));
  const REF = ['ttkaihu', 'cucmpbfb', 'uixayg'].join('');
  const secrets = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs|md|sql|example)$/.test(e.name)) {
        if (p === fileURLToPath(import.meta.url)) continue; // berkas pemeriksa ini sendiri
        const txt = fs.readFileSync(p, 'utf8');
        if (LEAK.test(txt) || txt.includes(REF)) secrets.push(path.relative(ROOT, p));
      }
    }
  };
  scan(ROOT);
  if (secrets.length === 0) ok('tidak ada kunci Supabase asli di file yang di-commit');
  else fail('kunci Supabase bocor ke file sumber', secrets.join('\n'));
}

/* ================================================================== */
/* B. Portal                                                           */
/* ================================================================== */
if (run('portal') || run('all')) {
  head('B. Portal (Next.js + Supabase)');

  const r = sh('npx', ['tsc', '--noEmit'], { cwd: PORTAL });
  assert('tsc --noEmit bersih', r.ok, r.out);

  hasFile('.env.example portal', 'portal/.env.example');
  hasFile('supabase/schema.sql', 'portal/supabase/schema.sql');
  hasFile('supabase/seed.sql', 'portal/supabase/seed.sql');
  hasFile('ikon PWA 192', 'portal/public/icons/icon-192.png');
  hasFile('ikon PWA 512', 'portal/public/icons/icon-512.png');
  hasFile('manifest PWA', 'portal/public/manifest.json');

  const build = sh('npx', ['next', 'build'], { cwd: PORTAL });
  assert('next build sukses', build.ok, build.out);
  hasFile('service worker PWA ter-generate', 'portal/public/sw.js');

  // Route handler yang wajib ada. `/api/langganan` menulis lewat RPC
  // `catat_langganan_bulan` (schema.sql bagian 9.1) untuk mencatat komisi
  // langganan per bulan.
  for (const r2 of ['/api/activate', '/api/licenses', '/api/langganan', '/api/profile']) {
    const routeFile = path.join(PORTAL, 'src', 'app', r2, 'route.ts');
    assert(`route ${r2} ada`, fs.existsSync(routeFile), routeFile);
  }

  // Objek database yang dipakai kode didefinisikan di supabase/schema.sql,
  // yang dijalankan manual di Supabase SQL Editor. Kalau nama di kode dan di
  // SQL berbeda, seluruh angka jadi null/0 di produksi -- persis kelas bug
  // yang dulu membuat kartu Home jadi nol semua. Karena file SQL tidak ikut
  // ter-deploy, satu sisi yang di-rename harus mengubah sisi yang lain juga;
  // cek ini yang menutup celah itu.
  const schemaSql = fs.readFileSync(path.join(PORTAL, 'supabase', 'schema.sql'), 'utf8');
  const srcFiles = [];
  const collectSrc = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collectSrc(p);
      else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push([p, fs.readFileSync(p, 'utf8')]);
    }
  };
  collectSrc(path.join(PORTAL, 'src'));

  const OBJEK_DB = [
    ['view toko_rekap', 'toko_rekap'],
    ['tabel langganan_pembayaran', 'langganan_pembayaran'],
    ['kolom licenses.harga_jual', 'harga_jual'],
    ['kolom licenses.produk_id', 'produk_id'],
    ['RPC catat_langganan_bulan', 'catat_langganan_bulan'],
    ['RPC generate_license', 'generate_license'],
  ];
  // Satu arah saja: yang dipakai src/ WAJIB ada di schema.sql. Arah sebaliknya
  // tidak dicek karena schema.sql memang punya objek yang tidak dipanggil dari
  // kode portal (helper SQL, RPC untuk aplikasi desktop, fungsi tier yang
  // dipanggil di dalam SQL lain).
  const dbOffenders = [];
  for (const [label, nama] of OBJEK_DB) {
    const diKode = srcFiles.some(([, t]) => t.includes(nama));
    const diSql = schemaSql.includes(nama);
    if (diKode && !diSql) {
      dbOffenders.push(`${label}: dipakai di src/ tapi tidak ada di schema.sql`);
    }
  }
  if (dbOffenders.length === 0)
    ok('nama objek database di src/ sama dengan yang didefinisikan di schema.sql');
  else fail(`${dbOffenders.length} ketidakcocokan nama objek database`, dbOffenders.join('\n'));

  const envE = fs.existsSync(path.join(PORTAL, '.env.local'));
  if (envE) {
    const chk = sh('node', ['scripts/check-supabase.mjs'], { cwd: PORTAL });
    const out = chk.out.replace(/\x1b\[[0-9;]*m/g, '');
    const okCount = (out.match(/OK {2}/g) || []).length;
    const gagalCount = (out.match(/GAGAL/g) || []).length;
    console.log(`  ${c.dim}check:supabase -> ${okCount} OK, ${gagalCount} belum siap${c.reset}`);
    if (gagalCount === 0) ok('Supabase siap dipakai (semua objek ada)');
    else
      skip(
        'Supabase belum siap — jalankan portal/supabase/schema.sql di SQL Editor, lalu ulangi',
      );
  } else {
    skip('.env.local belum ada — lewati cek Supabase');
  }
}

/* ================================================================== */
const total = results.length;
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
const secs = ((Date.now() - started) / 1000).toFixed(1);

console.log(`\n${c.bold}RINGKASAN${c.reset}  (${secs} detik)`);
console.log(`  total  : ${total}`);
console.log(`  ${c.green}lulus  : ${passed}${c.reset}`);
if (failed.length) {
  console.log(`  ${c.red}gagal  : ${failed.length}${c.reset}`);
  for (const f of failed) console.log(`    ${c.red}x${c.reset} [${f.suite}] ${f.name}`);
}
console.log('');
process.exit(failed.length === 0 ? 0 : 1);