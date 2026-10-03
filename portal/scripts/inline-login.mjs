/**
 * =============================================================================
 *  POLES HTML /login HASIL BUILD -> dokumen mandiri tanpa React
 * =============================================================================
 *
 * Masalah: halaman `/login` tidak punya satu pun Client Component, tapi karena
 * dirender lewat App Router browser tetap mengunduh react-dom + Next runtime
 * dan me-hydrate pohon RSC. Terukur di produksi (throttle 4x + Slow 4G):
 *
 *     226 ms  ->  TBT, hampir semuanya pemborosan
 *      94 kB  ->  6 chunk JS, 21,5 kB HTML (payload RSC inline)
 *
 * Yang dilakukan skrip ini, pada `.next/server/app/login.html`:
 *   1. `<link rel="stylesheet">`  ->  `<style>` berisi isi file CSS asli
 *   2. semua `<script src=...>`   ->  dibuang (runtime Next + polyfills)
 *   3. `<script>` payload RSC     ->  dibuang (self.__next_f.push)
 *   4. `<script>` milik halaman   ->  DIPERTAHANKAN (penanda __LOGIN_INLINE__)
 *
 * CSS-nya TIDAK disalin manual: yang di-inline adalah file CSS yang sama
 * persis dengan yang dipakai seluruh aplikasi, jadi Tailwind tetap satu sumber
 * kebenaran dan tidak ada CSS yang bisa basi.
 *
 * Karena hasilnya tetap file HTML yang sama di path yang sama, `/login`
 * tetap dilayani sebagai static content — tanpa middleware, tanpa function.
 *
 * Dijalankan otomatis oleh `npm run build` (lihat package.json).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const APP_DIR = join(ROOT, '.next', 'server', 'app');
const HTML = join(APP_DIR, 'login.html');
const CSS_DIR = join(ROOT, '.next', 'static', 'css');

/** Penanda untuk membedakan skrip milik halaman dari `<script>` runtime Next. */
const KEEP_MARKER = '__LOGIN_INLINE__';

function fail(msg) {
  console.error(`[inline-login] ERROR: ${msg}`);
  process.exit(1);
}

if (!existsSync(HTML)) {
  fail(`Tidak menemukan ${HTML}. Halaman /login harus static (○) agar bisa dipoles.`);
}

const cssFile = readdirSync(CSS_DIR).find((f) => f.endsWith('.css'));
if (!cssFile) fail(`Tidak ada CSS hasil build di ${CSS_DIR}.`);

const css = readFileSync(join(CSS_DIR, cssFile), 'utf8');
let html = readFileSync(HTML, 'utf8');

const before = Buffer.byteLength(html);

// --- 1. <link> CSS -> <style> -------------------------------------------------
// Hanya file CSS yang Halaman ini benar-benar memuat; kalau ternyata lebih
// dari satu, gabungkan semuanya supaya tidak ada gaya yang tertinggal.
const cssFiles = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
const combinedCss = cssFiles.map((f) => readFileSync(join(CSS_DIR, f), 'utf8')).join('\n');
html = html.replace(
  /<link[^>]+rel="stylesheet"[^>]*>/g,
  `<style>${combinedCss}</style>`,
);

// --- 2 & 3. buang <script> yang bukan milik halaman ------------------------
//
// Penting: script `dangerouslySetInnerHTML` milik halaman muncul DUA kali di
// HTML build Next — sekali sebagai tag <script> sungguhan di body, dan sekali
// lagi sebagai SALINAN di dalam payload RSC (`self.__next_f.push([1,"..."])`).
// Penanda KEEP_MARKER ada di keduanya, jadi penanda saja tidak cukup: harus
// dibedakan dari payload RSC-nya lebih dulu.
let removed = 0;
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (tag) => {
  if (tag.includes('__next_f')) {
    removed += 1;
    return ''; // payload RSC: hanya berisi data untuk runtime React
  }
  if (tag.includes(KEEP_MARKER)) return tag; // skrip halaman: pertahankan
  if (/<script[^>]+\bsrc=/.test(tag)) {
    removed += 1;
    return ''; // runtime Next / polyfills
  }
  removed += 1;
  return '';
});
// <script src="..."/> yang self-closing (jarang, tapi jangan sampai tertinggal)
html = html.replace(/<script\b[^>]*\/>/g, () => {
  removed += 1;
  return '';
});

// --- 4. buang <link rel="preload" as="script"> ------------------------------
// Setelah script dihapus, preload ke chunk JS jadi sia-sia: browser mengunduh
// file yang tidak pernah dieksekusi.
const preloadsBefore = (html.match(/<link[^>]+as="script"[^>]*>/g) || []).length;
html = html.replace(/<link[^>]+as="script"[^>]*>/g, '');

// --- 5. sanity check -------------------------------------------------------
const problems = [];
if (html.includes('__next_f')) problems.push('payload RSC masih tertanam');
if (/<script[^>]+\bsrc=/.test(html)) problems.push('masih ada <script src>');
if (/<link[^>]+as="script"/.test(html)) problems.push('masih ada preload as=script');
if (!html.includes(KEEP_MARKER)) problems.push(`skrip halaman (${KEEP_MARKER}) hilang`);
if (html.includes('rel="stylesheet"')) problems.push('masih ada <link rel=stylesheet>');

// Skrip halaman harus nyata ada sebagai tag utuh, bukan cuma salinan di payload.
const kept = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || [];
if (kept.length !== 1) problems.push(`harus ada tepat 1 <script>, ada ${kept.length}`);
if (kept[0] && !kept[0].includes('login-next')) {
  problems.push('<script> yang tersisa bukan skrip login');
}

if (problems.length) fail(`hasil tidak valid: ${problems.join('; ')}`);

writeFileSync(HTML, html);

const after = Buffer.byteLength(html);
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(
  `[inline-login] /login -> mandiri: ${kb(before)} -> ${kb(after)}, ` +
    `${removed} <script> + ${preloadsBefore} preload dibuang, `
    + `${cssFiles.length} CSS di-inline (${kb(combinedCss.length)})`,
);