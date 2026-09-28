#!/usr/bin/env node
/**
 * ============================================================================
 *  set-portal — menempelkan URL portal ke build .exe
 * ============================================================================
 *  Menulis  electron/build-config.json  yang dibaca electron/config.js.
 *  File ini ikut terpack ke dalam .exe, jadi setelah di-build tidak perlu
 *  internet/env untuk tahu mau aktivasi ke portal mana.
 *
 *  Cara pakai:
 *      npm run set-portal -- https://domain-anda.vercel.app
 *      npm run set-portal --            (hapus -> pakai DEFAULT_PORTAL_URL)
 *      npm run set-portal -- --show     (tampilkan URL yang sedang dipakai)
 * ============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, '..', 'electron', 'build-config.json');

const args = process.argv.slice(2);

function clean(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

if (args[0] === '--show') {
  if (fs.existsSync(target)) {
    const cur = JSON.parse(fs.readFileSync(target, 'utf8'));
    console.log(`Portal URL (build-config.json): ${cur.portalUrl || '(kosong)'}`);
  } else {
    console.log('build-config.json belum ada -> memakai DEFAULT_PORTAL_URL di electron/config.js');
  }
  process.exit(0);
}

const url = clean(args.find((a) => !a.startsWith('-')));

if (!url) {
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    console.log('build-config.json dihapus -> akan memakai DEFAULT_PORTAL_URL.');
  } else {
    console.log('build-config.json tidak ada, tidak ada yang dihapus.');
  }
  process.exit(0);
}

if (!/^https?:\/\/[^\s/]+/.test(url)) {
  console.error(`URL tidak valid: ${url}`);
  console.error('Contoh: https://kasirpro-portal.vercel.app');
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify({ portalUrl: url }, null, 2)}\n`, 'utf8');

console.log(`OK  electron/build-config.json -> ${url}`);
console.log('    Jalankan "npm run dist:win" untuk membuat installer .exe.');
