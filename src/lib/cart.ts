'use client';

import {
  ensureDeviceId,
  getDB,
  nextInvoiceNo,
  type LocalProduct,
  type LocalTransaction,
  type LocalTransactionItem,
} from '@/lib/db/local';
import { round2, uuidv4 } from '@/lib/utils';
import type { CartLine, DiscountType, PaymentMethod } from '@/types';

/* ------------------------------------------------------------------ */
/* Cart math                                                           */
/* ------------------------------------------------------------------ */

export interface CartTotals {
  subtotal: number;
  itemDiscount: number;
  discountAmount: number;
  total: number;
  totalCost: number;
  itemCount: number;
  profit: number;
}

export function computeTotals(
  lines: CartLine[],
  discountType: DiscountType,
  discountValue: number,
): CartTotals {
  const subtotal = round2(
    lines.reduce((sum, l) => sum + (l.price - l.discount) * l.qty, 0),
  );
  const itemDiscount = round2(lines.reduce((sum, l) => sum + l.discount * l.qty, 0));
  const totalCost = round2(lines.reduce((sum, l) => sum + l.cost * l.qty, 0));

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = round2((subtotal * Math.min(Math.max(discountValue, 0), 100)) / 100);
  } else if (discountType === 'fixed') {
    discountAmount = round2(Math.min(Math.max(discountValue, 0), subtotal));
  }

  const total = round2(Math.max(0, subtotal - discountAmount));

  return {
    subtotal,
    itemDiscount,
    discountAmount,
    total,
    totalCost,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    profit: round2(total - totalCost),
  };
}

export function computeChange(total: number, paid: number): number {
  return round2(Math.max(0, paid - total));
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

export interface CheckoutInput {
  lines: CartLine[];
  discountType: DiscountType;
  discountValue: number;
  paymentMethod: PaymentMethod;
  paid: number;
  note?: string | null;
  cashierName: string;
  storeId: string;
  /** Void transaksi tertentu (retur / pembatalan). */
  status?: 'completed' | 'void';
}

export interface CheckoutResult {
  transaction: LocalTransaction;
  items: LocalTransactionItem[];
  totals: CartTotals;
  changeDue: number;
}

/**
 * Simpan transaksi ke Dexie.js DULU (offline-first), tandai `_dirty = 1`.
 * Sync ke Supabase dilakukan terpisah oleh sync engine.
 * Stok produk juga dikurangi di Dexie dalam transaksi DB yang sama.
 */
export async function saveCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!input.lines.length) throw new Error('Keranjang masih kosong.');
  if (!input.storeId) throw new Error('Toko belum terdaftar pada lisensi ini. Hubungi admin.');

  const db = getDB();
  const totals = computeTotals(input.lines, input.discountType, input.discountValue);
  const changeDue = computeChange(totals.total, input.paid);
  const invoiceNo = await nextInvoiceNo();
  const deviceId = await ensureDeviceId();
  const now = new Date().toISOString();

  const transactionId = uuidv4();
  const isVoid = input.status === 'void';

  const tx: LocalTransaction = {
    id: transactionId,
    store_id: input.storeId,
    invoice_no: invoiceNo,
    subtotal: totals.subtotal,
    discount_type: input.discountType,
    discount_value: input.discountValue,
    discount_amount: totals.discountAmount,
    total: totals.total,
    total_cost: totals.totalCost,
    paid: input.paid,
    change_due: changeDue,
    payment_method: input.paymentMethod,
    note: input.note ?? null,
    cashier_name: input.cashierName,
    device_id: deviceId,
    status: isVoid ? 'void' : 'completed',
    created_at: now,
    synced_at: null,
    _dirty: 1,
  };

  const items: LocalTransactionItem[] = input.lines.map((l) => ({
    id: uuidv4(),
    transaction_id: transactionId,
    store_id: input.storeId,
    product_id: l.product_id,
    barcode: l.barcode,
    product_name: l.name,
    price: l.price,
    cost: l.cost,
    qty: l.qty,
    discount: l.discount,
    subtotal: round2((l.price - l.discount) * l.qty),
    _dirty: 1,
  }));

  await db.transaction('rw', [db.transactions, db.transaction_items, db.products], async () => {
    await db.transactions.put(tx);
    await db.transaction_items.bulkPut(items);

    if (!isVoid) {
      // Kurangi stok untuk produk yang benar-benar ada di DB lokal
      for (const line of input.lines) {
        if (!line.product_id) continue;
        const p = await db.products.get(line.product_id);
        if (!p) continue;
        await db.products.update(line.product_id, {
          stock: Math.max(0, (p.stock ?? 0) - line.qty),
          updated_at: now,
          _dirty: 1,
        });
      }
    }
  });

  return { transaction: tx, items, totals, changeDue };
}

/** Batalkan transaksi: kembalikan stok, tandai void, kirim ke server. */
export async function voidTransaction(transactionId: string): Promise<LocalTransaction | null> {
  const db = getDB();
  const tx = await db.transactions.get(transactionId);
  if (!tx) return null;
  if (tx.status === 'void') return tx;

  const items = await db.transaction_items.where('transaction_id').equals(transactionId).toArray();
  const now = new Date().toISOString();

  await db.transaction('rw', [db.transactions, db.transaction_items, db.products], async () => {
    await db.transactions.update(transactionId, { status: 'void', _dirty: 1 });
    for (const it of items) {
      if (!it.product_id) continue;
      const p = await db.products.get(it.product_id);
      if (!p) continue;
      await db.products.update(it.product_id, {
        stock: (p.stock ?? 0) + it.qty,
        updated_at: now,
        _dirty: 1,
      });
    }
  });

  return (await db.transactions.get(transactionId)) ?? null;
}

/* ------------------------------------------------------------------ */
/* Cart line helpers                                                   */
/* ------------------------------------------------------------------ */

export function mergeLine(existing: CartLine, incoming: CartLine): CartLine {
  return { ...existing, qty: round2(existing.qty + incoming.qty) };
}

export function addToCart(lines: CartLine[], incoming: CartLine[]): CartLine[] {
  const next = [...lines];
  for (const item of incoming) {
    const idx = next.findIndex(
      (l) =>
        (item.product_id && l.product_id === item.product_id) ||
        (!item.product_id && l.barcode === item.barcode),
    );
    if (idx >= 0) {
      next[idx] = mergeLine(next[idx]!, item);
    } else {
      next.push({ ...item });
    }
  }
  return next;
}

export function stockOf(products: LocalProduct[] | undefined, id: string | null): number | null {
  if (!id || !products) return null;
  return products.find((p) => p.id === id)?.stock ?? null;
}
