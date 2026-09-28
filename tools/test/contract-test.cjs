'use strict';
/* ===========================================================================
 *  Kontrak desktop -> portal: jalankan license.js ASLI melawan mock portal
 *  yang meniru RPC activate_license (schema.sql).
 * ======================================================================== */
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', 'desktop');
const MOCK = path.join(__dirname, 'mock-portal.cjs');
const PORT = 8899;
const URL = `http://127.0.0.1:${PORT}`;

let failed = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  OK  ', name);
  else {
    failed += 1;
    console.log('  FAIL', name, extra);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHealth(tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(`${URL}/health`);
      if (r.ok) return true;
    } catch {
      /* belum siap */
    }
    await wait(150);
  }
  return false;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirpro-lic-'));
  app.setPath('userData', userData);
  process.env.PORTAL_VERCEL_URL = URL;

  const mock = spawn(process.execPath, [MOCK, String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  mock.stdout.on('data', (d) => process.stdout.write(`  [mock] ${d}`));
  mock.stderr.on('data', (d) => process.stderr.write(`  [mock!] ${d}`));

  const up = await waitForHealth();
  check('mock portal hidup', up);
  if (!up) {
    mock.kill();
    app.exit(1);
    return;
  }

  const db = require(path.join(ROOT, 'electron', 'db.js'));
  const license = require(path.join(ROOT, 'electron', 'license.js'));
  const { getHwid } = require(path.join(ROOT, 'electron', 'hwid.js'));

  db.open(userData);

  check('portalUrl terbaca dari env', license.portalUrl() === URL, license.portalUrl());

  const hw = await getHwid();
  check('HWID perangkat obtained', hw.ok, JSON.stringify(hw).slice(0, 100));

  /* ---------------- 1. key tidak dikenal ---------------- */
  let r = await license.activate('KPRO-ZZZZ-ZZZZ-ZZZZ');
  check('key tak dikenal -> INVALID_KEY', r.ok === false && r.code === 'INVALID_KEY', JSON.stringify(r));
  check('tidak disimpan ke SQLite', db.license.get() === null, JSON.stringify(db.license.get()));

  /* ---------------- 2. key valid, belum dipakai ---------------- */
  r = await license.activate('kpro test free 0001'); // lowercase + spasi
  check('key lowercase dinormalisasi & aktif', r.ok === true && r.code === 'ACTIVATED', JSON.stringify(r).slice(0, 200));
  const lic = db.license.get();
  check('lisensi tersimpan di SQLite', lic?.serial_key === 'KPRO-TEST-FREE-0001', lic?.serial_key);
  check('HWID terkunci di SQLite', lic?.hwid === hw.hwid, lic?.hwid);
  check('nama toko ikut tersimpan', lic?.nama_toko === 'Toko Berkah Jaya', lic?.nama_toko);
  check('setting storeName terisi otomatis', db.settings.get('storeName') === 'Toko Berkah Jaya', db.settings.get('storeName'));

  /* ---------------- 3. checkLicense lokal ---------------- */
  let chk = await license.checkLicense();
  check('checkLicense -> OK', chk.ok === true && chk.code === 'OK', JSON.stringify(chk).slice(0, 120));

  /* ---------------- 4. aktivasi ulang key yg sama (idempoten) --------- */
  r = await license.activate('KPRO-TEST-FREE-0001');
  check('aktivasi ulang key sendiri -> ALREADY_ACTIVE', r.ok === true && r.code === 'ALREADY_ACTIVE', JSON.stringify(r).slice(0, 160));

  /* ---------------- 5. key milik perangkat lain ---------------------- */
  r = await license.activate('KPRO-TAKE-0000-0002');
  check('key terikat perangkat lain -> HWID_MISMATCH', r.ok === false && r.code === 'HWID_MISMATCH', JSON.stringify(r).slice(0, 160));
  check('HWID terkunci terbaca (lockedHwid)', r.lockedHwid === 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', r.lockedHwid);
  check('lisensi lokal TIDAK ditimpa', db.license.get().serial_key === 'KPRO-TEST-FREE-0001');

  /* ---------------- 6. key diblokir ---------------------------------- */
  r = await license.activate('KPRO-BLOC-0000-0003');
  check('key diblokir -> BLOCKED', r.ok === false && r.code === 'BLOCKED', JSON.stringify(r).slice(0, 140));

  /* ---------------- 7. langganan habis ------------------------------- */
  r = await license.activate('KPRO-EXPR-0000-0004');
  check('langganan habis -> EXPIRED', r.ok === false && r.code === 'EXPIRED', JSON.stringify(r).slice(0, 140));

  /* ---------------- 8. langganan masih jalan ------------------------- */
  r = await license.activate('KPRO-OPEN-0000-0005');
  check('langganan aktif -> ACTIVATED + expires_at', r.ok === true && Boolean(db.license.get().expires_at), JSON.stringify(r).slice(0, 160));

  /* ---------------- 9. HWID lokal berubah (app dicopy) --------------- */
  db.license.save({ hwid: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' });
  chk = await license.checkLicense();
  check('checkLicense HWID beda -> HWID_MISMATCH', chk.ok === false && chk.code === 'HWID_MISMATCH', JSON.stringify(chk).slice(0, 120));
  check('pesan mengarahkan ke toko', String(chk.message).includes('toko Anda'), chk.message);

  /* ---------------- 10. langganan kedaluwarsa lokal ----------------- */
  db.license.save({ hwid: hw.hwid, expires_at: '2020-01-01T00:00:00.000Z' });
  chk = await license.checkLicense();
  check('checkLicense kedaluwarsa -> EXPIRED', chk.ok === false && chk.code === 'EXPIRED', JSON.stringify(chk).slice(0, 120));

  /* ---------------- 11. format tidak dikenal ------------------------- */
  r = await license.activate('!!!');
  check('format ngawur -> INVALID_KEY (tanpa network)', r.code === 'INVALID_KEY' && r.ok === false, JSON.stringify(r));

  /* ---------------- 12. server mati (tidak ada internet) ------------- */
  mock.kill();
  await wait(500);
  r = await license.activate('KPRO-TEST-FREE-0001');
  check('portal mati -> NETWORK', r.ok === false && r.code === 'NETWORK', JSON.stringify(r).slice(0, 160));
  check('pesan menjelaskan butuh internet', /internet/i.test(r.message), r.message);

  /* ---------------- 13. reset lisensi ------------------------------- */
  license.resetLicense();
  check('resetLicense mengosongkan', db.license.get() === null);
  chk = await license.checkLicense();
  check('setelah reset -> NOT_ACTIVATED', chk.ok === false && chk.code === 'NOT_ACTIVATED', JSON.stringify(chk).slice(0, 100));

  db.close();
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(failed === 0 ? '\nKONTRAK PORTAL: SEMUA LULUS' : `\nKONTRAK PORTAL: ${failed} TES GAGAL`);
  app.exit(failed === 0 ? 0 : 1);
});

app.on('window-all-closed', () => {});
