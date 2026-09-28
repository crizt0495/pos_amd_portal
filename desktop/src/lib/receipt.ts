import { settingsApi } from './api';
import { rupiah } from './format';
import type { CartLine, ReceiptData, Transaction, TransactionItem } from '../types';

/**
 * ===========================================================================
 *  Penyusun data struk
 * ===========================================================================
 *  Semua perhitungan هنا SAMA dengan perhitungan di electron/db.js saat
 *  transaksi disimpan (lihat computeTotals) supaya angka di struk tidak
 *  pernah berbeda dengan angka di database.
 */

export interface StoreMeta {
  name: string;
  address: string;
  phone: string;
  cashier: string;
}

export function linesToItems(lines: CartLine[]) {
  return lines.map((l) => ({
    name: l.name,
    price: l.price,
    qty: l.qty,
    discount: l.discount,
    subtotal: Math.round((l.price - (l.discount || 0)) * l.qty),
  }));
}

/** Struk langsung dari keranjang (untuk preview sebelum disimpan). */
export function buildReceiptPreview(args: {
  invoiceNo: string;
  store: StoreMeta;
  lines: CartLine[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paid: number;
  changeDue: number;
  paymentMethod: string;
  note?: string | null;
  serialKey?: string | null;
}): ReceiptData {
  return {
    invoiceNo: args.invoiceNo,
    createdAt: new Date().toISOString(),
    storeName: args.store.name,
    storeAddress: args.store.address,
    storePhone: args.store.phone,
    cashierName: args.store.cashier,
    items: linesToItems(args.lines),
    subtotal: args.subtotal,
    discountAmount: args.discountAmount,
    total: args.total,
    paid: args.paid,
    changeDue: args.changeDue,
    paymentMethod: args.paymentMethod,
    note: args.note ?? null,
    serialKey: args.serialKey ?? undefined,
  };
}

/** Struk dari transaksi yang tersimpan di SQLite. */
export function buildReceiptFromTx(
  tx: Transaction,
  items: TransactionItem[],
  store: StoreMeta,
  serialKey?: string | null,
): ReceiptData {
  return {
    invoiceNo: tx.invoice_no,
    createdAt: tx.created_at,
    storeName: store.name,
    storeAddress: store.address,
    storePhone: store.phone,
    cashierName: tx.cashier_name || store.cashier,
    items: items.map((i) => ({
      name: i.product_name,
      price: i.price,
      qty: i.qty,
      discount: i.discount,
      subtotal: i.subtotal,
    })),
    subtotal: tx.subtotal,
    discountAmount: tx.discount_amount,
    total: tx.total,
    paid: tx.paid,
    changeDue: tx.change_due,
    paymentMethod: tx.payment_method,
    note: tx.note,
    serialKey: serialKey ?? undefined,
  };
}

/** Ringkasan satu baris untuk layar konfirmasi pembayaran. */
export function ringkasStruk(d: ReceiptData): string[] {
  const lines: string[] = [];
  for (const it of d.items) {
    lines.push(`${it.qty} x ${it.name}`);
    lines.push(`   ${rupiah(it.price)} = ${rupiah(it.subtotal)}`);
  }
  return lines;
}

/** Ambil metadata toko (dipakai saat cetak ulang struk dari Laporan). */
export async function loadStoreMeta(fallbackName = 'KasirPro'): Promise<StoreMeta> {
  const [name, address, phone, cashier] = await Promise.all([
    settingsApi.get<string>('storeName', fallbackName),
    settingsApi.get<string>('storeAddress', ''),
    settingsApi.get<string>('storePhone', ''),
    settingsApi.get<string>('cashierName', 'Kasir'),
  ]);
  return { name: name || fallbackName, address: address || '', phone: phone || '', cashier: cashier || 'Kasir' };
}
