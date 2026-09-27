'use strict';

/**
 * ===========================================================================
 *  KasirPro — Thermal Printer (ESC/POS)
 * ===========================================================================
 *  Dipakai oleh main process. Mengubah ReceiptData dari renderer menjadi
 *  teks ESC/POS 58mm lalu mengirimkannya ke printer.
 *
 *  Dukungan port:
 *   - tcp://192.168.1.10:9100  (printer jaringan / LAN)
 *   - 192.168.1.10:9100         (sama seperti di atas, tcp:// otomatis)
 *   - /dev/usb/lp0, /dev/ttyUSB0 (Linux), COM3 / \\\\.\\COM3 (Windows)
 *
 *  Bila `node-thermal-printer` tidak tersedia (mis. di dalam ASAR tanpa
 *  unpack), fungsi ini tidak akan melempar error fatal — pemanggil cukup
 *  menerima { ok: false } dan aplikasi jatuh ke browser printing.
 */

const ThermalPrinter = optionalRequire('node-thermal-printer');

/** require yang tidak melempat error. */
function optionalRequire(name) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(name);
  } catch {
    return null;
  }
}

const WIDTH = 32; // karakter per baris untuk 58mm (font A)

function money(n) {
  const v = Math.round(Number(n) || 0);
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(v);
}

function pad(text, len) {
  const s = String(text ?? '');
  if (s.length >= len) return s.slice(0, len);
  return s + ' '.repeat(len - s.length);
}

function center(text) {
  const s = String(text ?? '').slice(0, WIDTH);
  return ' '.repeat(Math.max(0, Math.floor((WIDTH - s.length) / 2))) + s;
}

function line(left, right) {
  return pad(left, WIDTH - right.length - 1) + ' ' + right;
}

function fmtDateTime(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '-';
  return (
    d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  );
}

function fmtTime(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Bangun isi struk (ESC/POS newline) dari data yang dikirim renderer. */
function buildReceiptText(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const L = [];

  L.push({ text: '\n' });
  L.push({ text: center(data.storeName || 'KasirPro'), options: { bold: true, align: 'center', characterSet: 0 } });
  if (data.storeAddress) L.push({ text: center(data.storeAddress) });
  if (data.storePhone) L.push({ text: center('Telp. ' + data.storePhone) });
  L.push({ text: '\n' });

  L.push({ text: line('No. Transaksi', String(data.invoiceNo ?? '-')) });
  L.push({ text: line('Tanggal', fmtDateTime(data.createdAt)) });
  L.push({ text: line('Kasir', String(data.cashierName ?? '-')) });
  L.push({ text: '-'.repeat(WIDTH) });

  for (const it of items) {
    L.push({ text: String(it.name ?? '').slice(0, WIDTH), options: { bold: false } });
    const qty = `${money(it.qty)} x ${money(it.price)}`;
    const sub = money(it.subtotal);
    let left = qty;
    if (it.discount > 0) left += ` (disc ${money(it.discount)})`;
    L.push({ text: pad(left, WIDTH - sub.length - 1) + ' ' + sub });
  }

  L.push({ text: '-'.repeat(WIDTH) });
  L.push({ text: line('Subtotal', money(data.subtotal)) });
  if (Number(data.discountAmount) > 0) {
    L.push({ text: line('Diskon', '-' + money(data.discountAmount)) });
  }
  L.push({ text: line('TOTAL', 'Rp' + money(data.total)), options: { bold: true } });
  L.push({ text: line(String(data.paymentMethod ?? ''), money(data.paid)) });
  L.push({ text: line('Kembalian', money(data.changeDue)) });
  L.push({ text: '-'.repeat(WIDTH) });
  L.push({ text: center('Terima kasih telah berbelanja!') });
  if (data.serialKey) L.push({ text: center(String(data.serialKey)) });
  if (data.note) L.push({ text: center(String(data.note)) });
  L.push({ text: center('Powered by KasirPro') });
  L.push({ text: '\n\n\n\n' });

  return L;
}

function normalizePort(port) {
  const raw = String(port || '').trim();
  if (!raw) return '';
  if (/^(tcp|usb|serial):/i.test(raw)) return raw;
  if (/^COM\d+$/i.test(raw)) return '\\\\.\\' + raw;
  if (/^\\\\/i.test(raw)) return raw;
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(raw)) return 'tcp://' + raw;
  if (/^\//.test(raw)) return 'usb://' + raw; // /dev/usb/lp0
  return raw;
}

/**
 * Cetak struk thermal.
 * @returns {Promise<{ok: boolean, error?: string, via?: string}>}
 */
async function printReceipt(payload) {
  const data = (payload && payload.data) || {};
  const port = normalizePort(payload && payload.port);

  if (!ThermalPrinter) {
    return {
      ok: false,
      error: 'Modul printer thermal (node-thermal-printer) tidak tersedia di paket ini.',
    };
  }

  if (!port) {
    return {
      ok: false,
      error: 'Port printer belum diisi. Atur di Kasir > Pengaturan > Printer Thermal.',
    };
  }

  let printer = null;
  try {
    const options = {
      // Beberapa printer thermal rumah tangga tidak mendukung duplex dan
      // character set 0 adalah yang paling kompatibel.
      removeExtraLine: true,
      characterSet: 0,
    };

    printer = new ThermalPrinter.Printer(ThermalPrinter.Printer.THERMAL, port, options);

    printer.on('error', () => {
      /* error ditangani oleh catch di bawah */
    });

    printer.print(buildReceiptText(data));
    if (typeof printer.flush === 'function') printer.flush();
    if (typeof printer.close === 'function') printer.close();

    return { ok: true, via: 'thermal', at: fmtTime(new Date().toISOString()) };
  } catch (err) {
    try {
      if (printer && typeof printer.close === 'function') printer.close();
    } catch {
      /* abaikan */
    }
    return { ok: false, error: (err && err.message) || 'Gagal mencetak ke printer thermal.' };
  }
}

/** Cetak halaman uji coba (untuk tombol "Cetak Struk Test"). */
async function printTest(payload) {
  return printReceipt({
    port: payload && payload.port,
    data: {
      invoiceNo: 'TEST-001',
      createdAt: new Date().toISOString(),
      storeName: 'KasirPro',
      storeAddress: 'Uji Printer Thermal 58mm',
      storePhone: '',
      cashierName: 'Sistem',
      items: [{ name: 'Struk uji coba printer', price: 0, qty: 1, discount: 0, subtotal: 0 }],
      subtotal: 0,
      discountAmount: 0,
      total: 0,
      paid: 0,
      changeDue: 0,
      paymentMethod: 'TEST',
      note: 'Jika struk ini keluar, printer siap dipakai.',
    },
  });
}

module.exports = { printReceipt, printTest, buildReceiptText, normalizePort };
