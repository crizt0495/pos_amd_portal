'use strict';
/* ===========================================================================
 *  UI aktivasi end-to-end: renderer asli -> preload -> IPC -> HTTP -> mock
 *  portal -> SQLite. Termasuk tampilan HWID_MISMATCH (aplikasi ter-copy).
 * ======================================================================== */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', 'desktop');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirpro-shots-'));
const PORT = 8901;
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

async function waitForHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return true;
    } catch {
      /* belum siap */
    }
    await wait(150);
  }
  return false;
}

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirpro-ui-'));
  app.setPath('userData', userData);
  process.env.PORTAL_VERCEL_URL = URL;

  const mock = spawn(process.execPath, [path.join(__dirname, 'mock-portal.cjs'), String(PORT)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  check('mock portal hidup', await waitForHealth());
  if (!(await fetch(`${URL}/health`)).ok) {
    mock.kill();
    app.exit(1);
    return;
  }

  const db = require(path.join(ROOT, 'electron', 'db.js'));
  const { registerIpc } = require(path.join(ROOT, 'electron', 'ipc.js'));
  db.open(app.getPath('userData'));
  registerIpc();

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      offscreen: true,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2) errors.push(msg);
  });

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await wait(2500);

  const js = (code) => win.webContents.executeJavaScript(code);
  const body = () => js('document.body.innerText.replace(/\\n{2,}/g, "\\n")');

  /* ---------------------- 1. isi form + klik Aktivasi --------------- */
  const filled = await js(`(() => {
    const input = document.querySelector('input');
    if (!input) return 'tidak ada input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'KPRO-TAKE-0000-0002');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  check('serial key bisa diketik', filled === 'ok', filled);
  await wait(300);

  const shownValue = await js(`document.querySelector('input').value`);
  check('input menampilkan key ternormalisasi', shownValue === 'KPRO-TAKE-0000-0002', shownValue);

  await js(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Aktivasi Sekarang/i.test(b.textContent));
    if (btn) btn.click();
  })()`);
  await wait(2500);

  const afterMismatch = await body();
  check('HWID_MISMATCH tampil di UI', /[Ll]isensi terikat perangkat lain|tidak boleh disalin/i.test(afterMismatch), afterMismatch.slice(0, 200).replace(/\n/g, ' | '));
  check('HWID perangkat ditampilkan', /[0-9A-F]{32}/.test(afterMismatch), afterMismatch.slice(0, 260).replace(/\n/g, ' | '));
  check('tidak ada teks sukses', !/berhasil diaktifkan/i.test(afterMismatch));
  check('lisensi tetap kosong di SQLite', db.license.get() === null);
  fs.writeFileSync(path.join(OUT, 'shot-activation-mismatch.png'), (await win.webContents.capturePage()).toPNG());

  /* ---------------------- 2. key fresh -> berhasil ------------------- */
  await js(`(() => {
    const input = document.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(200);
  await js(`(() => {
    const input = document.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'KPRO-OPEN-0000-0005');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(250);
  await js(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Aktivasi Sekarang/i.test(b.textContent));
    if (btn) btn.click();
  })()`);
  await wait(3000);

  const afterOk = await body();
  check('aktivasi sukses -> masuk POS', /Keranjang/i.test(afterOk), afterOk.slice(0, 200).replace(/\n/g, ' | '));
  check('nama toko dari lisensi tampil', /Toko Berkah Jaya/.test(afterOk), afterOk.slice(0, 200).replace(/\n/g, ' | '));
  check('lisensi tersimpan', db.license.get()?.serial_key === 'KPRO-OPEN-0000-0005');
  fs.writeFileSync(path.join(OUT, 'shot-activated.png'), (await win.webContents.capturePage()).toPNG());

  /* ---------------------- 3. app dicopy -> locked -------------------- */
  db.license.save({ hwid: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' });
  await js(`location.reload()`);
  await wait(2500);
  const afterCopy = await body();
  check('HWID beda -> aplikasi terkunci', /[Ll]isensi terikat perangkat lain|TERKUNCI|tidak boleh disalin/i.test(afterCopy), afterCopy.slice(0, 240).replace(/\n/g, ' | '));
  check('tidak masuk ke POS', !/Keranjang/i.test(afterCopy), afterCopy.slice(0, 200).replace(/\n/g, ' | '));
  fs.writeFileSync(path.join(OUT, 'shot-activation-locked.png'), (await win.webContents.capturePage()).toPNG());

  check('tidak ada error console', errors.length === 0, errors.join(' || ').slice(0, 300));

  mock.kill();
  db.close();
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(failed === 0 ? '\nUI AKTIVASI: SEMUA LULUS' : `\nUI AKTIVASI: ${failed} TES GAGAL`);
  app.exit(failed === 0 ? 0 : 1);
});

app.on('window-all-closed', () => {});
