#!/usr/bin/env node
/**
 * ============================================================================
 *  test — UJI MENYELURUH KASIRPRO (portal + desktop)
 * ============================================================================
 *  Menjalankan semua pemeriksaan yang bisa dilakukan di mesin ini:
 *
 *   A. Statis     — syntax, typecheck, ikon PWA
 *   B. Portal     — typecheck, next build, rute API, cek Supabase
 *   C. Desktop    — typecheck, vite build, IPC 1:1 dengan preload
 *   D. Fungsi     — SQLite (35 uji), HWID, normalisasi serial, kontrak portal
 *   E. Paket      — electron-builder --dir (asar + better_sqlite3.node)
 *
 *  Yang TIDAK bisa diuji di sini dan butuh mesin/Dashboard Anda:
 *   - penerapan portal/supabase/schema.sql ke Supabase  (dicek di bagian B)
 *   - Episode .exe NSIS final                          (butuh Windows/wine)
 *   - panggilan HTTP ke domain Vercel yang sudah online
 *
 *  Jalankan:
 *      npm test            semua
 *      npm test -- statis  hanya bagian A
 *      npm test -- portal  A + B
 *      npm test -- desktop semua kecuali B
 * ============================================================================
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// berkas ini: <repo>/tools/test/run-all.mjs  ->  root repo dua tingkat di atas
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTAL = path.join(ROOT, 'portal');
const DESKTOP = path.join(ROOT, 'desktop');
const TOOLS = path.join(ROOT, 'tools', 'test');
const ELECTRON = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron');

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
function hasFile(name, file, opts = {}) {
  const p = file.startsWith('/') ? file : path.join(ROOT, file);
  assert(name, fs.existsSync(p) && fs.statSync(p).size > 0, `tidak ada / kosong: ${p}`);
}

const started = Date.now();

/* ================================================================== */
/* A. Statis                                                          */
/* ================================================================== */
if (run('statis') || run('all') || run('portal') || run('desktop')) {
  head('A. Pemeriksaan statis');

  const jsFiles = fs
    .readdirSync(path.join(DESKTOP, 'electron'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join('desktop', 'electron', f));
  let badSyntax = 0;
  for (const f of jsFiles) {
    const r = sh('node', ['--check', path.join(ROOT, f)]);
    if (!r.ok) {
      badSyntax += 1;
      fail(`syntax ${f}`, r.out);
    }
  }
  if (badSyntax === 0) ok(`syntax ${jsFiles.length} file electron/*.js valid`);

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

  // tidak boleh ada kunci asli yang bocor ke file yang di-commit.
  // Pola dirakit dari potongan supaya berkas ini sendiri tidak cocok.
  const LEAK = new RegExp(
    ['sb', 'secret_', '[A-Za-z0-9]{20,}'].join(''),
  );
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

  for (const r2 of ['/api/activate', '/api/licenses', '/api/profile', '/api/profile/logo']) {
    const routeFile = path.join(PORTAL, 'src', 'app', r2, 'route.ts');
    assert(`route ${r2} ada`, fs.existsSync(routeFile), routeFile);
  }

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
/* C. Desktop                                                         */
/* ================================================================== */
if (run('desktop') || run('all')) {
  head('C. Desktop (Electron + React + SQLite)');

  const tc = sh('npm', ['run', 'typecheck'], { cwd: DESKTOP });
  assert('tsc --noEmit bersih', tc.ok, tc.out);

  const bld = sh('npm', ['run', 'build'], { cwd: DESKTOP });
  assert('vite build sukses', bld.out.includes('built in'), bld.out);
  hasFile('renderer bundle', 'desktop/dist/index.html');

  // icon aplikasi
  const icon = path.join(DESKTOP, 'build', 'icon.png');
  if (assert('build/icon.png ada', fs.existsSync(icon))) {
    const buf = fs.readFileSync(icon);
    const isPng = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    assert(`icon PNG 512x512 (terbaca ${w}x${h})`, isPng && w === 512 && h === 512);
  }

  // IPC harus cocok 1:1 dengan preload
  const ipcSrc = fs.readFileSync(path.join(DESKTOP, 'electron', 'ipc.js'), 'utf8');
  const preSrc = fs.readFileSync(path.join(DESKTOP, 'electron', 'preload.js'), 'utf8');
  const grab = (src, re) => new Set([...src.matchAll(re)].map((m) => m[1]));
  const registered = grab(ipcSrc, /\bhandle\(\s*'([a-z0-9:-]+)'/g);
  const exposed = grab(preSrc, /\binvoke\(\s*'([a-z0-9:-]+)'/g);
  const missingPre = [...registered].filter((k) => !exposed.has(k));
  const missingMain = [...exposed].filter((k) => !registered.has(k));
  const list = (s) => [...s].sort().join('\n        ');
  assert(
    `29 channel IPC cocok 1:1 dengan preload (terdaftar ${registered.size}, dipanggil ${exposed.size})`,
    missingPre.length === 0 && missingMain.length === 0 && registered.size === 29,
    [
      missingPre.length ? `belum di-expose:\n        ${list(new Set(missingPre))}` : '',
      missingMain.length ? `belum terdaftar:\n        ${list(new Set(missingMain))}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  // konfigurasi portal
  const cfg = fs.readFileSync(path.join(DESKTOP, 'electron', 'config.js'), 'utf8');
  assert('portalUrl punya DEFAULT_PORTAL_URL', /DEFAULT_PORTAL_URL\s*=\s*'https:\/\//.test(cfg));
  assert('membaca electron/build-config.json', cfg.includes('build-config.json'));
  assert('membaca env VITE_API_URL (alias)', cfg.includes('VITE_API_URL'));
  hasFile('.env.example desktop', 'desktop/.env.example');
}

/* ================================================================== */
/* D. Uji fungsi                                                      */
/* ================================================================== */
if (run('desktop') || run('all')) {
  head('D. Uji fungsi (SQLite, HWID, kontrak portal)');

  if (!fs.existsSync(ELECTRON)) {
    skip('binary electron belum ada — jalankan npm run install:desktop');
  } else {
    const suites = [
      ['unit SQLite (produk, transaksi, laporan, lisensi)', 'db-smoke.js', true],
      ['unit HWID + normalisasi serial key', 'hwid-smoke.js', true],
      ['e2e renderer (POS, produk, laporan, void)', 'e2e-test.js', false],
      ['kontrak desktop <-> portal /api/activate', 'contract-test.cjs', false],
      ['UI aktivasi + layar terkunci (HWID)', 'ui-activation-test.cjs', false],
    ];
    for (const [label, file, asNode] of suites) {
      const p = path.join(TOOLS, file);
      if (!fs.existsSync(p)) {
        fail(`berkas uji ${file} tidak ada`, p);
        continue;
      }
      // ELECTRON_RUN_AS_NODE=1 = mode Node murni, flag Electron tidak boleh ikut.
      const args = asNode ? [p] : ['--no-sandbox', p];
      const r = sh(ELECTRON, args, {
        cwd: DESKTOP,
        env: asNode ? { ELECTRON_RUN_AS_NODE: '1' } : {},
        timeout: 4 * 60 * 1000,
      });
      const out = r.out.replace(/\x1b\[[0-9;]*m/g, '');
      const pass = (out.match(/^\s*OK\s{2}/gm) || []).length;
      const failLines = (out.match(/^\s*FAIL\s+/gm) || []).length;
      assert(`${label} — ${pass} uji`, r.ok && failLines === 0 && pass > 0, out);
    }
  }
}

/* ================================================================== */
/* E. Paket                                                            */
/* ================================================================== */
if (run('desktop') || run('all')) {
  head('E. Perakitan paket (electron-builder)');

  // Bersihkan hasil build lama supaya perakitan selalu deterministik
  // (sisa win-unpacked membuat rename electron.exe -> KasirPro.exe gagal).
  const releaseDir = path.join(DESKTOP, 'release');
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
    console.log(`  ${c.dim}direktori release lama dibersihkan${c.reset}`);
  }

  if (process.platform === 'win32') {
    const r = sh('npm', ['run', 'dist:win'], { cwd: DESKTOP, timeout: 30 * 60 * 1000 });
    if (assert('npm run dist:win sukses', r.ok, r.out)) {
      const exe = fs
        .readdirSync(path.join(DESKTOP, 'release'))
        .find((f) => f.endsWith('.exe'));
      assert(`installer ${exe} dibuat`, Boolean(exe), 'tidak ada .exe di desktop/release');
    }
  } else {
    const r = sh(
      'npx',
      ['electron-builder', '--win', '--x64', '--dir'],
      { cwd: DESKTOP, env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }, timeout: 30 * 60 * 1000 },
    );
    const out = r.out;
    const unpacked = path.join(DESKTOP, 'release', 'win-unpacked');
    if (assert('electron-builder --win --dir sukses', r.ok, out)) {
      const asar = path.join(unpacked, 'resources', 'app.asar');
      hasFile('app.asar terbungkus', asar);
      const native = fs.existsSync(path.join(unpacked, 'resources', 'app.asar.unpacked'));
      assert('better_sqlite3.node tidak ter-ASAR (unpacked)', native, 'asarmod.unpacked hilang');
      const exe = path.join(unpacked, 'KasirPro.exe');
      assert('KasirPro.exe ada', fs.existsSync(exe), exe);
      console.log(
        `  ${c.dim}Catatan: installer .exe NSIS hanya bisa dirakit di Windows (butuh wine). Jalankan "npm run dist:win" di Windows atau pakai workflow .github/workflows/build-desktop.yml${c.reset}`,
      );
    }
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
