'use client';

import * as React from 'react';
import { getHwid } from '@/lib/hwid';

/* ------------------------------------------------------------------ */
/* Thermal receipt                                                     */
/* ------------------------------------------------------------------ */

export interface ReceiptItem {
  name: string;
  price: number;
  qty: number;
  discount: number;
  subtotal: number;
}

export interface ReceiptData {
  invoiceNo: string;
  createdAt: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  cashierName: string;
  items: ReceiptItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paid: number;
  changeDue: number;
  paymentMethod: string;
  note?: string | null;
  serialKey?: string | null;
}

function money(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Markup struk thermal 58mm. */
export function ReceiptMarkup({ data }: { data: ReceiptData }) {
  return (
    <div className="receipt" id="print-area">
      <h1>{data.storeName}</h1>
      {data.storeAddress && <p className="center item-meta">{data.storeAddress}</p>}
      {data.storePhone && <p className="center item-meta">Telp. {data.storePhone}</p>}
      <hr />
      <table className="kv">
        <tbody>
          <tr>
            <td>No. Transaksi</td>
            <td>{data.invoiceNo}</td>
          </tr>
          <tr>
            <td>Tanggal</td>
            <td>
              {new Date(data.createdAt).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}{' '}
              {new Date(data.createdAt).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </td>
          </tr>
          <tr>
            <td>Kasir</td>
            <td>{data.cashierName}</td>
          </tr>
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          {data.items.map((it, i) => (
            <React.Fragment key={`${it.name}-${i}`}>
              <tr>
                <td colSpan={2} className="item-name">
                  {it.name}
                </td>
              </tr>
              <tr className="item-meta">
                <td>
                  {it.qty} x {money(it.price)}
                  {it.discount > 0 ? ` (disc ${money(it.discount)})` : ''}
                </td>
                <td style={{ textAlign: 'right' }}>{money(it.subtotal)}</td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td style={{ textAlign: 'right' }}>{money(data.subtotal)}</td>
          </tr>
          {data.discountAmount > 0 && (
            <tr>
              <td>Diskon</td>
              <td style={{ textAlign: 'right' }}>-{money(data.discountAmount)}</td>
            </tr>
          )}
          <tr className="total-row">
            <td>TOTAL</td>
            <td style={{ textAlign: 'right' }}>Rp{money(data.total)}</td>
          </tr>
          <tr>
            <td>{data.paymentMethod}</td>
            <td style={{ textAlign: 'right' }}>{money(data.paid)}</td>
          </tr>
          <tr>
            <td>Kembalian</td>
            <td style={{ textAlign: 'right' }}>{money(data.changeDue)}</td>
          </tr>
        </tbody>
      </table>
      <hr />
      <p className="center item-meta">Terima kasih telah berbelanja!</p>
      {data.serialKey && (
        <p className="center code" style={{ marginTop: 2 }}>
          {data.serialKey}
        </p>
      )}
      {data.note && <p className="center item-meta">{data.note}</p>}
      <p className="center code" style={{ marginTop: 2 }}>
        Powered by KasirPro
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Printing                                                            */
/* ------------------------------------------------------------------ */

export interface PrintResult {
  ok: boolean;
  via: 'electron-thermal' | 'browser-print' | 'failed';
  error?: string;
}

/* --- Host struk untuk mode print browser ---------------------------- */

/**
 * `printReceipt` adalah fungsi biasa (dipanggil dari event handler), bukan
 * komponen, jadi tidak bisa merender `ReceiptMarkup` secara langsung.
 * Modul ini menyimpan struk terakhir di memori lalu memberi tahu `<PrintHost>`
 * yang terpasang di layout POS untuk merendernya ke dalam `#print-area`.
 */
let printTarget: ReceiptData | null = null;
const printListeners = new Set<() => void>();

function setPrintTarget(data: ReceiptData | null) {
  printTarget = data;
  for (const listener of printListeners) listener();
}

/**
 * Pasang sekali di layout POS. `@media print` di `globals.css` menyembunyikan
 * seluruh halaman lalu hanya menampilkan isi `#print-area`.
 */
export function PrintHost() {
  const [data, setData] = React.useState<ReceiptData | null>(printTarget);

  React.useEffect(() => {
    const listener = () => setData(printTarget);
    printListeners.add(listener);
    // Jangan tertinggal kalau `printReceipt` dipanggil sebelum effect berjalan.
    if (printTarget) setData(printTarget);
    return () => {
      printListeners.delete(listener);
    };
  }, []);

  return (
    <div className="print-host" aria-hidden="true">
      {data ? <ReceiptMarkup data={data} /> : null}
    </div>
  );
}

const afterPrint = () => setPrintTarget(null);

/**
 * Cetak struk.
 *  1. Electron -> IPC ke node-thermal-printer (ESC/POS langsung ke printer)
 *  2. Browser  -> render struk ke #print-area lalu window.print() (@page 58mm)
 */
export async function printReceipt(data: ReceiptData, port?: string): Promise<PrintResult> {
  // 1) Electron thermal printer
  if (typeof window !== 'undefined' && window.electronAPI?.printReceipt) {
    try {
      const res = await window.electronAPI.printReceipt({
        data,
        port: port || undefined,
      });
      if (res?.ok) return { ok: true, via: 'electron-thermal' };
      // Printer thermal gagal -> tetap beri struk lewat dialog print browser.
      browserPrint(data);
      return {
        ok: true,
        via: 'browser-print',
        error: res?.error || 'Printer thermal tidak merespons, dicetak lewat dialog print.',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mencetak via printer thermal.';
      browserPrint(data);
      return { ok: true, via: 'browser-print', error: message };
    }
  }

  // 2) Browser
  browserPrint(data);
  return { ok: true, via: 'browser-print' };
}

function browserPrint(data: ReceiptData) {
  if (typeof window === 'undefined') return;

  setPrintTarget(data);
  window.addEventListener('afterprint', afterPrint, { once: true });

  // Tunggu dua frame supaya React sempat commit #print-area ke DOM sebelum
  // dialog print dibuka — kalau tidak, yang tercetak adalah halaman kasir.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        try {
          window.print();
        } finally {
          // Beberapa browser tidak menembakkan `afterprint` (mis. Safari).
          window.setTimeout(() => setPrintTarget(null), 1_000);
        }
      }, 40);
    });
  });
}

/* ------------------------------------------------------------------ */
/* Test connection ke printer (Electron)                               */
/* ------------------------------------------------------------------ */

export async function testPrinter(port?: string): Promise<{ ok: boolean; message: string }> {
  if (typeof window === 'undefined' || !window.electronAPI?.printReceipt) {
    return {
      ok: false,
      message: 'Pengujian printer hanya tersedia di aplikasi desktop (Electron).',
    };
  }
  const res = await window.electronAPI.printReceipt({
    data: {
      invoiceNo: 'TEST-001',
      createdAt: new Date().toISOString(),
      storeName: 'KasirPro',
      storeAddress: 'Test Printer',
      storePhone: '',
      cashierName: 'Sistem',
      items: [
        { name: 'Struk test printer', price: 0, qty: 1, discount: 0, subtotal: 0 },
      ],
      subtotal: 0,
      discountAmount: 0,
      total: 0,
      paid: 0,
      changeDue: 0,
      paymentMethod: 'TEST',
      note: 'Jika struk ini keluar, printer siap dipakai.',
    } satisfies ReceiptData,
    port: port || undefined,
    test: true,
  });
  return res?.ok
    ? { ok: true, message: 'Struk test berhasil dicetak.' }
    : { ok: false, message: res?.error || 'Gagal mencetak struk test.' };
}

/* ------------------------------------------------------------------ */
/* Hardware summary untuk halaman pengaturan                           */
/* ------------------------------------------------------------------ */

export function useHwidInfo() {
  const [info, setInfo] = React.useState<{
    hwid: string;
    source: string;
    deviceName: string;
  } | null>(null);

  React.useEffect(() => {
    void getHwid().then((r) =>
      setInfo({ hwid: r.hwid, source: r.source, deviceName: r.deviceName }),
    );
  }, []);

  return info;
}
