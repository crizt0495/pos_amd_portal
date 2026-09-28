'use strict';

/**
 * ===========================================================================
 *  Cetak Struk Thermal 58mm
 * ===========================================================================
 *  Dua jalur cetak:
 *
 *  1) ESC/POS langsung (opsional) — dipakai bila pengaturan "Printer Port"
 *     diisi, contoh: 192.168.1.10:9100  |  COM3  |  /dev/usb/lp0
 *     Membutuhkan paket `node-thermal-printer` (opsional, lihat package.json).
 *
 *  2) Cetak lewat dialog printer Windows (fallback bawaan) — struk dirender
 *     sebagai HTML ukuran 58mm lalu dicetak oleh `webContents.print()`.
 *     Tidak butuh paket tambahan dan kompatibel dengan semua printer
 *     (termasuk printer thermal generic yang pakai driver Windows).
 *
 *  Bila tidak ada printer sama sekali, fungsi mengembalikan { ok: false }
 *  tanpa melempar error — aplikasi tetap jalan.
 */

const { BrowserWindow } = require('electron');

let ThermalPrinter = null;
try {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  ThermalPrinter = require('node-thermal-printer');
} catch {
  ThermalPrinter = null;
}

const WIDTH = 32; // karakter per baris (font A, 58mm)

/* ----------------------------- format ------------------------------ */

const money = (n) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const pad = (text, len) => {
  const s = String(text ?? '');
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
};

const center = (text) => {
  const s = String(text ?? '').slice(0, WIDTH);
  return ' '.repeat(Math.max(0, Math.floor((WIDTH - s.length) / 2))) + s;
};

const row = (left, right) => `${pad(left, Math.max(1, WIDTH - right.length - 1))} ${right}`;

function fmtDateTime(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* --------------------------- ESC/POS text -------------------------- */

function buildReceiptText(data) {
  const items = Array.isArray(data.items) ? data.items : [];
  const L = [];
  const push = (text) => L.push({ text: `${text}\n` });

  push('');
  push(center(data.storeName || 'KasirPro'));
  if (data.storeAddress) push(center(data.storeAddress));
  if (data.storePhone) push(center(`Telp. ${data.storePhone}`));
  push('');
  push('-' * WIDTH);
  push(row(data.invoiceNo || '-', fmtDateTime(data.createdAt)));
  if (data.cashierName) push(row('Kasir', data.cashierName));
  push('-' * WIDTH);

  for (const it of items) {
    push(it.name.slice(0, WIDTH));
    push(row(`${it.qty} x ${money(it.price)}`, money(it.subtotal)));
  }

  push('-' * WIDTH);
  push(row('Subtotal', money(data.subtotal)));
  if (data.discountAmount > 0) push(row('Diskon', '-' + money(data.discountAmount)));
  push(row('TOTAL', money(data.total)));
  push(row(data.paymentMethod || 'Tunai', money(data.paid)));
  if (Number(data.changeDue) > 0) push(row('Kembali', money(data.changeDue)));
  if (data.note) {
    push('');
    push(`Catatan: ${data.note}`.slice(0, WIDTH));
  }
  if (data.serialKey) {
    push('');
    push(center('Bukti Lisensi'));
    push(center(String(data.serialKey).slice(0, WIDTH)));
  }
  push('');
  push(center('Terima kasih telah berbelanja!'));
  push('');
  push('');
  push('');

  return L;
}

/* ------------------------------ HTML ------------------------------- */

function buildReceiptHtml(data) {
  const items = (Array.isArray(data.items) ? data.items : [])
    .map(
      (it) => `<tr>
        <td class="n">${esc(it.name)}</td>
        <td class="q">${it.qty} x ${money(it.price)}</td>
        <td class="r">${money(it.subtotal)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Struk ${esc(data.invoiceNo || '')}</title>
<style>
  @page { size: 58mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body {
    width: 58mm; margin: 0; padding: 0 2mm;
    font-family: "Consolas", "Courier New", monospace;
    font-size: 10pt; line-height: 1.35; color: #000; background: #fff;
  }
  h1 { font-size: 12pt; text-align: center; margin: 0 0 2px; }
  .sub { text-align: center; font-size: 9pt; margin: 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; font-size: 10pt; }
  td.q { text-align: right; white-space: nowrap; padding-left: 4px; }
  td.r { text-align: right; white-space: nowrap; }
  .meta { display: flex; justify-content: space-between; font-size: 10pt; }
  .total { font-size: 12pt; font-weight: bold; }
  .foot { text-align: center; margin-top: 8px; font-size: 9pt; }
  .lic { text-align: center; margin-top: 6px; font-size: 9pt; }
</style></head>
<body>
  <h1>${esc(data.storeName || 'KasirPro')}</h1>
  ${data.storeAddress ? `<p class="sub">${esc(data.storeAddress)}</p>` : ''}
  ${data.storePhone ? `<p class="sub">Telp. ${esc(data.storePhone)}</p>` : ''}
  <hr />
  <div class="meta"><span>${esc(data.invoiceNo || '-')}</span><span>${fmtDateTime(data.createdAt)}</span></div>
  ${data.cashierName ? `<div class="meta"><span>Kasir</span><span>${esc(data.cashierName)}</span></div>` : ''}
  <hr />
  <table>${items}</table>
  <hr />
  <div class="meta"><span>Subtotal</span><span>${money(data.subtotal)}</span></div>
  ${data.discountAmount > 0 ? `<div class="meta"><span>Diskon</span><span>-${money(data.discountAmount)}</span></div>` : ''}
  <div class="meta total"><span>TOTAL</span><span>${money(data.total)}</span></div>
  <div class="meta"><span>${esc(data.paymentMethod || 'Tunai')}</span><span>${money(data.paid)}</span></div>
  ${Number(data.changeDue) > 0 ? `<div class="meta"><span>Kembali</span><span>${money(data.changeDue)}</span></div>` : ''}
  ${data.note ? `<p class="sub" style="text-align:left;margin-top:6px">Catatan: ${esc(data.note)}</p>` : ''}
  ${data.serialKey ? `<div class="lic">Bukti Lisensi<br /><b>${esc(data.serialKey)}</b></div>` : ''}
  <p class="foot">Terima kasih telah berbelanja!</p>
</body></html>`;
}

/* ------------------------------ cetak ------------------------------ */

/**
 * Terjemahkan string port ke opsi node-thermal-printer.
 *  "192.168.1.10:9100"        -> network
 *  "192.168.1.10"             -> network (port default 9100)
 *  "COM3" / "\\\\.\\COM3"     -> port Windows
 *  "/dev/usb/lp0"             -> port Linux
 */
function parsePort(port) {
  const value = String(port || '').trim();

  const netMatch = value.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/);
  if (netMatch) {
    return { type: 'network', interface: netMatch[1], port: Number(netMatch[2] || 9100) };
  }

  if (/^(\\\\.\\)?COM\d+$/i.test(value) || value.startsWith('/dev/')) {
    return { type: 'port', port: value };
  }

  if (value) return { type: 'network', interface: value, port: 9100 };
  return null;
}

async function printViaEscpos(data, port) {
  const target = parsePort(port);

  if (!ThermalPrinter || !target) {
    return { ok: false, via: 'none', error: 'Format printer port tidak dikenali.' };
  }

  let printer;
  try {
    printer = new ThermalPrinter({
      ...target,
      width: 32,
      characterSet: 0,
      removeSpecialChars: false,
      lineHeight: 30,
    });

    printer.on('error', (err) => console.warn('[KasirPro] printer error:', err?.message));
    await printer.print(buildReceiptText(data));
    await printer.cut();
    await printer.close();

    return { ok: true, via: 'escpos', port };
  } catch (err) {
    return { ok: false, via: 'escpos', error: err?.message || 'Gagal mencetak via ESC/POS.' };
  }
}

async function printViaSystem(data) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, javascript: false, images: true },
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildReceiptHtml(data))}`);

    return await new Promise((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, deviceName: undefined },
        (success, failureReason) => {
          resolve(
            success
              ? { ok: true, via: 'system' }
              : { ok: false, via: 'system', error: failureReason || 'Pencetakan dibatalkan.' },
          );
        },
      );
    });
  } catch (err) {
    return { ok: false, via: 'system', error: err?.message || 'Gagal membuka dialog cetak.' };
  } finally {
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy();
    }, 1000);
  }
}

/**
 * Cetak struk.
 * @param {object} data  isi struk
 * @param {{port?: string}} options  port thermal (opsional)
 */
async function printReceipt(data, options = {}) {
  const port = String(options.port ?? '').trim();

  if (port && ThermalPrinter) {
    const viaEscpos = await printViaEscpos(data, port);
    if (viaEscpos.ok) return viaEscpos;
    console.warn('[KasirPro] ESC/POS gagal, fallback ke dialog printer:', viaEscpos.error);
  }

  return printViaSystem(data);
}

/** Cetak struk contoh (untuk tes printer). */
async function printTest(options = {}) {
  return printReceipt(
    {
      storeName: 'KasirPro',
      storeAddress: 'Jl. Contoh No. 1',
      storePhone: '0800-0000-0000',
      invoiceNo: 'TES-001',
      createdAt: new Date().toISOString(),
      cashierName: 'Kasir',
      items: [
        { name: 'Contoh Produk A', qty: 2, price: 15000, subtotal: 30000 },
        { name: 'Contoh Produk B', qty: 1, price: 25000, subtotal: 25000 },
      ],
      subtotal: 55000,
      discountAmount: 0,
      total: 55000,
      paid: 60000,
      changeDue: 5000,
      paymentMethod: 'Tunai',
    },
    options,
  );
}

module.exports = { printReceipt, printTest, hasEscpos: Boolean(ThermalPrinter) };
