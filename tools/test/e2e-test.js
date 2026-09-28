'use strict';
/* ===========================================================================
 *  Tes end-to-end KasirPro Desktop (headless, offscreen)
 *  - buka SQLite (userData sementara)
 *  - daftarkan IPC sungguhan dari electron/ipc.js
 *  - muat renderer hasil `vite build` (dist/index.html)
 *  - panggil API lewat window.electronAPI seperti yang dilakukan UI
 * ======================================================================== */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', 'desktop');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirpro-shots-'));
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirpro-e2e-'));

let failed = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  OK  ', name);
  else {
    failed += 1;
    console.log('  FAIL', name, extra);
  }
}

app.disableHardwareAcceleration();
app.setPath('userData', USER_DATA);

app.whenReady().then(async () => {
  const db = require(path.join(ROOT, 'electron', 'db.js'));
  const { registerIpc } = require(path.join(ROOT, 'electron', 'ipc.js'));
  db.open(app.getPath('userData'));
  registerIpc();

  const win = new BrowserWindow({
    show: false,
    width: 1360,
    height: 860,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      offscreen: true,
    },
  });

  const consoleErrors = [];
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2) consoleErrors.push(msg);
  });

  await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
  await new Promise((r) => setTimeout(r, 2500));

  const ev = (code) => win.webContents.executeJavaScript(`window.electronAPI.${code}`);

  /* ------------------------------ sistem ----------------------------- */
  const hw = await ev('getHwid()');
  check('getHwid 32 hex', hw.ok && /^[0-9A-F]{32}$/.test(hw.hwid), JSON.stringify(hw));
  const info = await ev('appInfo()');
  check('app-info', info.ok && Boolean(info.version) && Boolean(info.portalUrl), JSON.stringify(info));
  check('kasir.db dibuat di userData', fs.existsSync(path.join(USER_DATA, 'kasir.db')));

  /* ----------------------------- lisensi ----------------------------- */
  const notAct = await ev('checkLicense()');
  check('belum aktivasi -> NOT_ACTIVATED', notAct.code === 'NOT_ACTIVATED', JSON.stringify(notAct));

  // paksa status aktif agar bisa menguji layar POS
  db.license.save({
    serial_key: 'KPRO-TEST-TEST-TEST',
    hwid: hw.hwid,
    is_activated: 1,
    nama_toko: 'Toko Uji Coba',
    pembeli_nama: 'Tester',
    paket_type: 'bundle',
    license_type: 'sekali',
  });
  // muat ulang supaya UI membaca lisensi yang baru disetel
  await win.webContents.reload();
  await new Promise((r) => setTimeout(r, 2000));

  const act = await ev('checkLicense()');
  check('HWID cocok -> OK', act.ok === true && act.code === 'OK', JSON.stringify(act).slice(0, 160));
  check('lisensi tersimpan di SQLite', db.license.get().serial_key === 'KPRO-TEST-TEST-TEST');

  // HWID beda -> terkunci
  db.license.save({ hwid: 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF' });
  const mismatch = await ev('checkLicense()');
  check('HWID beda -> HWID_MISMATCH', mismatch.code === 'HWID_MISMATCH', JSON.stringify(mismatch).slice(0, 120));
  db.license.save({ hwid: hw.hwid });

  /* ------------------------------ produk ----------------------------- */
  const created = await ev(`products.create({ barcode: '8991234567897', name: 'Roti Bakar', category: 'Snack', price: 8000, cost: 5000, stock: 12, min_stock: 3, unit: 'pcs' })`);
  check('products.create', created.ok && created.data.name === 'Roti Bakar', JSON.stringify(created).slice(0, 140));

  const byBarcode = await ev(`products.findByBarcode('8991234567897')`);
  check('products.findByBarcode', byBarcode.ok && byBarcode.data.id === created.data.id);

  const list = await ev(`products.list('', false)`);
  check('products.list (3 seed + 1)', list.ok && list.data.length === 4, String(list.data?.length));

  const cats = await ev(`products.categories()`);
  check('products.categories', cats.ok && cats.data.includes('Snack'), JSON.stringify(cats.data));

  const upd = await ev(`products.update('${created.data.id}', { price: 9000 })`);
  check('products.update', upd.ok && upd.data.price === 9000);

  const adjust = await ev(`products.adjustStock('${created.data.id}', -2)`);
  check('products.adjustStock', adjust.ok && adjust.data.stock === 10, String(adjust.data?.stock));

  /* ---------------------------- transaksi --------------------------- */
  const tx = await ev(`transactions.create({
      lines: [
        { product_id: '${created.data.id}', barcode: '8991234567897', name: 'Roti Bakar', price: 9000, cost: 5000, qty: 2, discount: 0 },
        { product_id: null, barcode: null, name: 'Air Kaleng', price: 5000, cost: 3500, qty: 1, discount: 0 }
      ],
      discountType: 'fixed', discountValue: 3000, paymentMethod: 'cash', paid: 30000,
      note: 'e2e', cashierName: 'Tester'
    })`);
  check('transactions.create', tx.ok && tx.data.transaction.total === 20000, JSON.stringify(tx).slice(0, 180));
  check('kembalian 10000', tx.ok && tx.data.changeDue === 10000);
  const stockAfter = await ev(`products.get('${created.data.id}')`);
  check('stok 10 -> 8', stockAfter.data.stock === 8, String(stockAfter.data?.stock));

  const txList = await ev(`transactions.list({ limit: 10 })`);
  check('transactions.list', txList.ok && txList.data.length === 1);

  const txGet = await ev(`transactions.get('${tx.data.transaction.id}')`);
  check('transactions.get + items', txGet.ok && txGet.items.length === 2 && String(txGet.data.invoice_no).startsWith('INV-'), JSON.stringify(txGet).slice(0, 160));

  /* ----------------------------- laporan ---------------------------- */
  const sum = await ev(`reports.summary({})`);
  check('reports.summary', sum.ok && sum.data.total_omzet === 20000 && sum.data.jumlah_transaksi === 1, JSON.stringify(sum.data));
  const top = await ev(`reports.topProducts({})`);
  check('reports.topProducts', top.ok && top.data[0].name === 'Roti Bakar');
  const daily = await ev(`reports.daily({})`);
  check('reports.daily', daily.ok && daily.data.length === 1);
  const byPay = await ev(`reports.byPayment({})`);
  check('reports.byPayment', byPay.ok && byPay.data[0].metode === 'cash');
  const cnt = await ev(`transactions.count({})`);
  check('transactions.count', cnt.ok && cnt.data === 1);

  /* ----------------------------- settings ---------------------------- */
  await ev(`settings.set('storeName', 'Toko Uji Coba')`);
  const st = await ev(`settings.get('storeName', 'x')`);
  check('settings set/get', st.ok && st.data === 'Toko Uji Coba');
  const all = await ev(`settings.all()`);
  check('settings.all', all.ok && all.data.storeName === 'Toko Uji Coba');

  /* ------------------------------- void ------------------------------ */
  const voided = await ev(`transactions.void('${tx.data.transaction.id}')`);
  check('transactions.void', voided.ok && voided.data.status === 'void');
  const stockBack = await ev(`products.get('${created.data.id}')`);
  check('stok kembali 10', stockBack.data.stock === 10, String(stockBack.data?.stock));
  const sumVoid = await ev(`reports.summary({})`);
  check('laporan tidak ikut transaksi void', sumVoid.data.jumlah_transaksi === 0);

  /* --------------------- UI: pindah tab setelah lisensi OK ---------- */
  const text = await win.webContents.executeJavaScript(
    'document.body.innerText.replace(/\\n{2,}/g, "\\n").slice(0, 500)',
  );
  check('UI masuk POS Kasir', text.includes('KasirPro') && text.includes('Keranjang'), text.slice(0, 120));
  const shot1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'shot-kasir.png'), shot1.toPNG());
  check('screenshot kasir dibuat', shot1.toPNG().length > 10000, String(shot1.toPNG().length));

  // klik tab Produk
  const clicked = await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Produk');
    if (!btn) return 'tidak ada tombol Produk';
    btn.click();
    return 'ok';
  })()`);
  check('pindah tab Produk', clicked === 'ok', clicked);
  await new Promise((r) => setTimeout(r, 2200));
  const textProduk = await win.webContents.executeJavaScript('document.body.innerText.slice(0, 1500)');
  check('tab Produk berisi data', textProduk.includes('Roti Bakar'), textProduk.slice(0, 160).replace(/\n/g, ' | '));
  const shot2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'shot-produk.png'), shot2.toPNG());

  // tab Laporan
  await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Laporan');
    if (btn) btn.click();
  })()`);
  await new Promise((r) => setTimeout(r, 2200));
  const textLaporan = await win.webContents.executeJavaScript('document.body.innerText.slice(0, 1500)');
  check('tab Laporan terbuka', textLaporan.includes('Omzet') || textLaporan.includes('Laporan'), textLaporan.slice(0, 160).replace(/\n/g, ' | '));
  const shot3 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'shot-laporan.png'), shot3.toPNG());

  /* ------------------------- layar aktivasi ------------------------- */
  await ev('resetLicense()');
  await win.webContents.reload();
  await new Promise((r) => setTimeout(r, 2000));
  const textAktivasi = await win.webContents.executeJavaScript('document.body.innerText.slice(0, 400)');
  check('balik ke layar Aktivasi', textAktivasi.includes('Aktivasi Sekarang') || textAktivasi.includes('Serial Key'), textAktivasi.slice(0, 140).replace(/\n/g, ' | '));
  const shot4 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'shot-activation.png'), shot4.toPNG());

  check('tidak ada error console', consoleErrors.length === 0, consoleErrors.join(' || ').slice(0, 300));

  console.log(failed === 0 ? '\nE2E: SEMUA LULUS' : `\nE2E: ${failed} TES GAGAL`);
  db.close();
  fs.rmSync(USER_DATA, { recursive: true, force: true });
  app.exit(failed === 0 ? 0 : 1);
});

app.on('window-all-closed', () => {});
