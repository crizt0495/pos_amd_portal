'use strict';
/* ===========================================================================
 *  KONTRAK DESKTOP -> PORTAL (LIVE)
 *  Menjalankan license.js DESKTOP ASLI melawan portal KasirPro yang sedang
 *  berjalan (localhost:3000) dan database Supabase yang sudah di-seed.
 *
 *  Prasyarat:
 *    1. Portal sudah jalan  ->  cd portal && npm run start   (port 3000)
 *    2. Supabase sudah di-apply schema.sql + seed.sql + akun demo
 *    3. Jalankan:
 *         cd desktop && ./node_modules/electron/dist/electron --no-sandbox \
 *           ../tools/test/live-portal-contract.cjs
 * ========================================================================= */
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', 'desktop');
const URL = process.env.LIVE_PORTAL_URL || 'http://localhost:3000';

let failed = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  OK  ', name);
  else {
    failed += 1;
    console.log('  FAIL', name, extra);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  // pastikan portal hidup
  let up = false;
  for (let i = 0; i < 20 && !up; i += 1) {
    try {
      const r = await fetch(`${URL}/api/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial_key: 'KPRO-ZZZZ-ZZZZ-ZZZZ', hwid: 'x'.repeat(32) }),
      });
      if (r.status === 404) up = true;
    } catch {
      /* belum siap */
    }
    if (!up) await wait(300);
  }
  check(`portal live terdeteksi (${URL})`, up);
  if (!up) {
    app.exit(1);
    return;
  }

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirpro-live-'));
  app.setPath('userData', userData);
  process.env.PORTAL_VERCEL_URL = URL;

  const db = require(path.join(ROOT, 'electron', 'db.js'));
  const license = require(path.join(ROOT, 'electron', 'license.js'));
  const { getHwid } = require(path.join(ROOT, 'electron', 'hwid.js'));

  db.open(userData);

  check('portalUrl terbaca dari env', license.portalUrl() === URL, license.portalUrl());

  const hw = await getHwid();
  check('HWID perangkat obtained', hw.ok, JSON.stringify(hw).slice(0, 100));

  /* ---------------- 1. key seed yang belum dipakai ---------------- */
  let r = await license.activate('KPRO-DEMO-AAAA-0001');
  check('KPRO-DEMO-AAAA-0001 (unused) -> ACTIVATED', r.ok === true && r.code === 'ACTIVATED', JSON.stringify(r).slice(0, 200));
  const lic = db.license.get();
  check('lisensi tersimpan di SQLite', lic?.serial_key === 'KPRO-DEMO-AAAA-0001', lic?.serial_key);
  check('HWID terkunci di SQLite = HWID perangkat', lic?.hwid === hw.hwid, lic?.hwid);
  check('nama toko ikut tersimpan', lic?.nama_toko === 'DEMO Toko Berkah', lic?.nama_toko);
  check('setting storeName terisi otomatis', db.settings.get('storeName') === 'DEMO Toko Berkah', db.settings.get('storeName'));

  /* ---------------- 2. checkLicense lokal (offline) ---------------- */
  let chk = await license.checkLicense();
  check('checkLicense -> OK', chk.ok === true && chk.code === 'OK', JSON.stringify(chk).slice(0, 120));

  /* ---------------- 3. aktivasi ulang (idempoten) ------------------ */
  r = await license.activate('KPRO-DEMO-AAAA-0001');
  check('aktivasi ulang key sendiri -> ALREADY_ACTIVE', r.ok === true && r.code === 'ALREADY_ACTIVE', JSON.stringify(r).slice(0, 160));

  /* ---------------- 4. key milik perangkat lain -------------------- */
  r = await license.activate('KPRO-DEMO-CCCC-0003');
  check('key terikat HWID lain -> HWID_MISMATCH', r.ok === false && r.code === 'HWID_MISMATCH', JSON.stringify(r).slice(0, 160));
  check('lockedHwid dibaca dari server', r.lockedHwid === 'A1B2C3D4E5F60718293A4B5C6D7E8F90', r.lockedHwid);
  check('lisensi lokal TIDAK ditimpa', db.license.get()?.serial_key === 'KPRO-DEMO-AAAA-0001', db.license.get()?.serial_key);

  /* ---------------- 5. key pendek / tidak dikenal ------------------ */
  r = await license.activate('KPRO-ZZZZ-ZZZZ-ZZZZ');
  check('key tak dikenal -> INVALID_KEY', r.ok === false && r.code === 'INVALID_KEY', JSON.stringify(r).slice(0, 140));

  r = await license.activate('!!!');
  check('format ngawur -> INVALID_KEY (tanpa network)', r.ok === false && r.code === 'INVALID_KEY', JSON.stringify(r).slice(0, 120));

  /* ---------------- 6. reset lisensi ------------------------------- */
  license.resetLicense();
  check('resetLicense mengosongkan SQLite', db.license.get() === null);
  chk = await license.checkLicense();
  check('setelah reset -> NOT_ACTIVATED', chk.ok === false && chk.code === 'NOT_ACTIVATED', JSON.stringify(chk).slice(0, 100));

  db.close();
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(failed === 0 ? '\nKONTRAK DESKTOP->PORTAL LIVE: SEMUA LULUS' : `\nKONTRAK LIVE: ${failed} GAGAL`);
  app.exit(failed === 0 ? 0 : 1);
});

app.on('window-all-closed', () => {});