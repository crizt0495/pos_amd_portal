#!/usr/bin/env node
/**
 * ===========================================================================
 *  KasirPro — Persiapan paket Electron
 * ===========================================================================
 *  `next build` dengan `output: 'standalone'` menghasilkan server Node.js
 *  mandiri di `.next/standalone`, TAPI Next.js sengaja tidak ikut menyalin
 *  dua folder ini ke dalamnya:
 *
 *    - `.next/static`  -> asset JS/CSS hasil build
 *    - `public`        -> file statis (icon, manifest, dll)
 *
 *  Tanpa keduanya, aplikasi Electron akan menampilkan halaman kosong putih
 *  (HTML termuat, tapi semua request `/_next/static/*` 404).
 *
 *  Skrip ini menyalin keduanya ke dalam standalone, lalu menyiapkan berkas
 *  `.env.production` yang dibaca main process saat runtime.
 *
 *  Dijalankan otomatis oleh `npm run electron:build`.
 */

import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const nextDir = path.join(root, '.next');
const standalone = path.join(nextDir, 'standalone');

/* ------------------------------------------------------------------ */

const KB = 1024;

function fmtSize(bytes) {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(0)} KB`;
  return `${(bytes / KB / KB).toFixed(1)} MB`;
}

function log(step, message) {
  process.stdout.write(`  [${step}] ${message}\n`);
}

/** Salin folder bila ada, dengan report ukuran. */
async function copyInto(src, dest) {
  if (!existsSync(src)) {
    log('!', `dilewati (tidak ada): ${path.relative(root, src)}`);
    return false;
  }
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, dereference: true });
  const info = await stat(dest);
  log('+', `${path.relative(standalone, dest)} <- ${path.relative(root, src)} (${fmtSize(info.size)})`);
  return true;
}

/* ------------------------------------------------------------------ */

async function main() {
  process.stdout.write('\nMenyiapkan paket standalone untuk Electron...\n');

  if (!existsSync(standalone)) {
    process.stderr.write(
      '\n[ERROR] .next/standalone tidak ditemukan.\n' +
        '        Jalankan `npm run build` lebih dulu.\n\n',
    );
    process.exit(1);
  }

  /* 1. Aset statis wajib supaya UI tidak putih kosong ------------------ */
  const hasStatic = await copyInto(
    path.join(nextDir, 'static'),
    path.join(standalone, '.next', 'static'),
  );
  await copyInto(path.join(root, 'public'), path.join(standalone, 'public'));

  if (!hasStatic) {
    process.stderr.write('\n[ERROR] .next/static tidak ditemukan — build belum selesai.\n\n');
    process.exit(1);
  }

  /* 2. Berkas .env.production untuk runtime --------------------------- */
  // Catatan penting: variabel NEXT_PUBLIC_* di-inline ke dalam bundle JS
  // saat `next build`, jadi nilainya harus ada di environment build.
  // Variabel server-only (SUPABASE_SERVICE_ROLE_KEY) dibaca saat runtime
  // oleh main process dari berkas ini.
  const envTarget = path.join(root, '.env.production');
  if (!existsSync(envTarget)) {
    const template = path.join(root, '.env.example');
    if (existsSync(template)) {
      await cp(template, envTarget);
      log('=', '.env.production dibuat dari .env.example — ISI DULU SEBELUM BUILD!');
    } else {
      await writeFile(envTarget, '', 'utf8');
      log('=', '.env.production dibuat kosong (tidak ada .env.example)');
    }
  } else {
    log('=', '.env.production sudah ada');
  }

  /* 3. Ringkasan -------------------------------------------------------- */
  const serverJs = path.join(standalone, 'server.js');
  if (!existsSync(serverJs)) {
    process.stderr.write('\n[ERROR] .next/standalone/server.js tidak ditemukan.\n\n');
    process.exit(1);
  }

  process.stdout.write('\nPaket standalone siap di .next/standalone\n\n');
}

main().catch((err) => {
  process.stderr.write(`\n[ERROR] ${err?.stack || err}\n\n`);
  process.exit(1);
});
