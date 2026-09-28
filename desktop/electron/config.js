'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * ===========================================================================
 *  Konfigurasi runtime KasirPro Desktop
 * ===========================================================================
 *  URL portal (tempat aktivasi serial key) dicari berurutan:
 *    1. process.env.PORTAL_VERCEL_URL       (dev / CI)
 *    2. electron/build-config.json          (ditempel saat build .exe)
 *    3. <userData>/config.json              -> { "portalUrl": "https://..." }
 *    4. .env di folder aplikasi             (dev / paket manual)
 *    5. DEFAULT_PORTAL_URL                  (nilai bawaan di bawah)
 *
 *  Cara paling aman untuk rilis: set domain Vercel sekali saat build
 *      npm run set-portal -- https://domain-anda.vercel.app
 *  (menulis electron/build-config.json, ikut terpack ke dalam .exe)
 *
 *  Pengguna akhir tetap bisa mengganti sendiri lewat:
 *    Windows : %APPDATA%\KasirPro\config.json
 *    Linux   : ~/.config/KasirPro/config.json
 *    macOS   : ~/Library/Application Support/KasirPro/config.json
 */

// Domain produksi portal KasirPro (sudah live). Menjadi nilai bawaan sehingga
// installer yang dirakit di GitHub Actions (tanpa secret apa pun) langsung
// memakai portal asli. PORTAL_VERCEL_URL / build-config.json tetap menang
// jika diisi (lihat urutan prioritas di atas).
const DEFAULT_PORTAL_URL = 'https://pos-amd.vercel.app';

function cleanUrl(value) {
  if (!value) return '';
  return String(value).trim().replace(/\/+$/, '');
}

/** Baca file .env sederhana (tanpa dependensi). */
function parseEnvFile(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
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
    if (key) out[key] = value;
  }
  return out;
}

let cached = null;

function portalUrl() {
  if (cached) return cached;

  // Urutan prioritas:
  //  1. env proses (dev / CI): PORTAL_VERCEL_URL atau VITE_API_URL
  //  2. electron/build-config.json (ditempel saat build .exe)
  //  3. <userData>/config.json (pengguna bisa override sendiri)
  //  4. .env di folder aplikasi
  //  5. DEFAULT_PORTAL_URL
  const candidates = [process.env.PORTAL_VERCEL_URL, process.env.VITE_API_URL];

  try {
    const baked = path.join(__dirname, 'build-config.json');
    if (fs.existsSync(baked)) {
      const parsed = JSON.parse(fs.readFileSync(baked, 'utf8'));
      if (parsed && typeof parsed.portalUrl === 'string') candidates.push(parsed.portalUrl);
    }
  } catch {
    /* build-config rusak -> pakai sumber lain */
  }

  try {
    const cfg = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(cfg)) {
      const parsed = JSON.parse(fs.readFileSync(cfg, 'utf8'));
      if (parsed && typeof parsed.portalUrl === 'string') candidates.push(parsed.portalUrl);
    }
  } catch {
    /* config rusak -> pakai sumber lain */
  }

  const devEnv = parseEnvFile(path.join(app.getAppPath(), '.env'));
  candidates.push(devEnv.PORTAL_VERCEL_URL, devEnv.VITE_API_URL, DEFAULT_PORTAL_URL);

  for (const c of candidates) {
    const url = cleanUrl(c);
    if (url) {
      cached = url;
      return url;
    }
  }

  cached = DEFAULT_PORTAL_URL;
  return cached;
}

function appVersion() {
  try {
    return app.getVersion();
  } catch {
    return '0.0.0';
  }
}

module.exports = { portalUrl, appVersion, DEFAULT_PORTAL_URL };
