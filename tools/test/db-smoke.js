'use strict';
/* Smoke test db.js memakai Node bawaan Electron (ABI sama dengan better-sqlite3) */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const db = require(path.join(REPO, 'desktop', 'electron', 'db.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kasirpro-test-'));

let failed = 0;
function check(name, cond, extra = '') {
  if (cond) console.log('  OK  ', name);
  else {
    failed += 1;
    console.log('  FAIL', name, extra);
  }
}

db.open(dir);
check('db file dibuat', fs.existsSync(path.join(dir, 'kasir.db')));
check('produk contoh ter-seed', db.products.list().length === 3, String(db.products.list().length));

/* ------------------------------ produk ------------------------------ */
const p = db.products.create({
  barcode: '1234567890123',
  name: 'Kopi Susu',
  category: 'Minuman',
  price: 15000,
  cost: 9000,
  stock: 10,
  min_stock: 2,
  unit: 'pcs',
});
check('create produk', p.id && p.name === 'Kopi Susu');
check('findByBarcode', db.products.findByBarcode('1234567890123')?.id === p.id);
check('findByBarcode tidak ada', db.products.findByBarcode('TIDAK-ADA') === null);

const upd = db.products.update(p.id, { price: 17000 });
check('update harga', upd.price === 17000 && upd.stock === 10);

db.products.update(p.id, { min_stock: 99 });
const low = db.products.lowStock().map((x) => x.id);
check('lowStock terdeteksi', low.includes(p.id), JSON.stringify(low));
db.products.update(p.id, { min_stock: 2 });
check('lowStock hilang setelah min diturunkan', !db.products.lowStock().some((x) => x.id === p.id));

/* --------------------------- transaksi ------------------------------ */
const lines = [
  { product_id: p.id, barcode: p.barcode, name: 'Kopi Susu', price: 17000, cost: 9000, qty: 2, discount: 0 },
  { product_id: null, barcode: null, name: 'Manual', price: 5000, cost: 3000, qty: 1, discount: 0 },
];
const tx1 = db.transactions.create({
  lines,
  discountType: 'percent',
  discountValue: 10,
  paymentMethod: 'cash',
  paid: 40000,
  cashierName: 'Sari',
  note: 'test',
});
check('invoice no format', /^INV-\d{8}-0001$/.test(tx1.transaction.invoice_no), tx1.transaction.invoice_no);
check('subtotal 39000', tx1.totals.subtotal === 39000, String(tx1.totals.subtotal));
check('diskon 10% = 3900', tx1.totals.discountAmount === 3900, String(tx1.totals.discountAmount));
check('total 35100', tx1.totals.total === 35100, String(tx1.totals.total));
check('kembali 4900', tx1.changeDue === 4900, String(tx1.changeDue));
check('stok berkurang 10 -> 8', db.products.get(p.id).stock === 8, String(db.products.get(p.id).stock));
check('item transaksi tersimpan', db.transactions.items(tx1.transaction.id).length === 2);
check('total_cost 21000', tx1.totals.totalCost === 21000, String(tx1.totals.totalCost));

/* bayar kurang harus ditolak */
let ditolak = false;
try {
  db.transactions.create({ lines, discountType: 'none', discountValue: 0, paymentMethod: 'cash', paid: 1000 });
} catch {
  ditolak = true;
}
check('tolak bayar kurang', ditolak);

/* invoice kedua = 0002 */
const tx2 = db.transactions.create({
  lines: [{ product_id: p.id, barcode: p.barcode, name: 'Kopi Susu', price: 17000, cost: 9000, qty: 1, discount: 0 }],
  discountType: 'none',
  discountValue: 0,
  paymentMethod: 'qris',
  paid: 17000,
  cashierName: 'Sari',
});
check('invoice kedua 0002', tx2.transaction.invoice_no.endsWith('-0002'), tx2.transaction.invoice_no);
check('stok 8 -> 7', db.products.get(p.id).stock === 7, String(db.products.get(p.id).stock));

/* ------------------------------ void -------------------------------- */
db.transactions.void(tx2.transaction.id);
check('status void', db.transactions.get(tx2.transaction.id).status === 'void');
check('stok kembali 8', db.products.get(p.id).stock === 8, String(db.products.get(p.id).stock));

/* ---------------------------- laporan ------------------------------- */
const s = db.reports.summary({});
check('summary 1 transaksi', s.jumlah_transaksi === 1, JSON.stringify(s));
check('omzet 35100', s.total_omzet === 35100, String(s.total_omzet));
check('laba 14100', s.total_laba === 14100, String(s.total_laba));
check('total item 3', s.total_item === 3, String(s.total_item));

const top = db.reports.topProducts({ limit: 5 });
check('top produk urut', top[0].name === 'Kopi Susu' && top[0].qty === 2, JSON.stringify(top));
const daily = db.reports.daily({});
check('laporan harian', daily.length === 1 && daily[0].tanggal.length === 10, JSON.stringify(daily));
const byPay = db.reports.byPayment({});
check('metode bayar', byPay.length === 1 && byPay[0].metode === 'cash', JSON.stringify(byPay));

/* ---------------------------- lisensi ------------------------------- */
const lic = db.license.save({
  serial_key: 'KPRO-ABCD-2345-6XYZ',
  hwid: 'ABCDEF0123456789ABCDEF0123456789',
  is_activated: 1,
  nama_toko: 'Toko Berkah',
  pembeli_nama: 'Budi',
  paket_type: 'bundle',
  license_type: 'sekali',
});
check('lisensi tersimpan', lic.serial_key === 'KPRO-ABCD-2345-6XYZ' && lic.is_activated === 1);
check('hwid tersimpan', lic.hwid.length === 32);
const lic2 = db.license.save({ nama_toko: 'Toko Berkah 2' });
check('update lisensi partial', lic2.serial_key === 'KPRO-ABCD-2345-6XYZ' && lic2.nama_toko === 'Toko Berkah 2');

/* --------------------------- settings ------------------------------- */
db.settings.set('storeName', 'Toko Berkah');
db.settings.set('autoPrint', false);
db.settings.set('printerPort', '');
check('settings json', db.settings.get('storeName') === 'Toko Berkah');
check('settings bool', db.settings.get('autoPrint') === false);
check('settings fallback', db.settings.get('tidak-ada', 'x') === 'x');
check('settings empty string', db.settings.get('printerPort', 'fallback') === '');

/* ----------------------------- cetak -------------------------------- */
const { buildReceiptText } = { buildReceiptText: null };
void buildReceiptText;

db.close();
check('db ditutup', true);

fs.rmSync(dir, { recursive: true, force: true });

console.log(failed === 0 ? '\nSEMUA TES LULUS' : `\n${failed} TES GAGAL`);
process.exit(failed === 0 ? 0 : 1);
