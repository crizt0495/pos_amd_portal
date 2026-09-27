import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { clientIpFromRequest, userAgentFromRequest } from '@/lib/supabase/session';
import { normalizeSerialKey } from '@/lib/serial';
import { toNumber } from '@/lib/utils';
import type { ActivationCode, SyncResponse } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BATCH = 500;

const ProductSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  category: z.string().max(80).optional().default('Umum'),
  price: z.number().min(0),
  cost: z.number().min(0),
  stock: z.number().int(),
  min_stock: z.number().int().optional().default(0),
  unit: z.string().max(24).optional().default('pcs'),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional().default(true),
  created_at: z.string(),
  updated_at: z.string(),
});

const TxSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  invoice_no: z.string().min(1).max(60),
  subtotal: z.number(),
  discount_type: z.enum(['none', 'percent', 'fixed']),
  discount_value: z.number(),
  discount_amount: z.number(),
  total: z.number(),
  total_cost: z.number(),
  paid: z.number(),
  change_due: z.number(),
  payment_method: z.enum(['cash', 'qris', 'transfer', 'debit', 'credit']),
  note: z.string().nullable().optional(),
  cashier_name: z.string().nullable().optional(),
  device_id: z.string().nullable().optional(),
  status: z.enum(['completed', 'void']),
  created_at: z.string(),
});

const ItemSchema = z.object({
  id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  store_id: z.string().uuid(),
  product_id: z.string().uuid().nullable().optional(),
  barcode: z.string().nullable().optional(),
  product_name: z.string().min(1).max(200),
  price: z.number(),
  cost: z.number().optional().default(0),
  qty: z.number().positive(),
  discount: z.number().optional().default(0),
  subtotal: z.number(),
});

const BodySchema = z.object({
  serialKey: z.string().min(6).max(64),
  hwid: z.string().min(8).max(128).regex(/^[A-Za-z0-9-]+$/),
  deviceId: z.string().min(4).max(80),
  appVersion: z.string().max(32).optional(),
  products: z.array(ProductSchema).max(MAX_BATCH).default([]),
  transactions: z.array(TxSchema).max(MAX_BATCH).default([]),
  transactionItems: z.array(ItemSchema).max(MAX_BATCH * 10).default([]),
});

function fail(code: ActivationCode, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message } satisfies SyncResponse, { status });
}

/**
 * POST /api/pos/sync
 * Mendorong data dari Dexie.js (offline-first) ke Supabase.
 * WAJIB online. Setiap request divalidasi Serial Key + HWID terhadap server,
 * sehingga data hanya bisa ditulis oleh perangkat pemilik lisensi.
 */
export async function POST(req: Request) {
  if (!hasServiceRole()) {
    return fail('NETWORK', 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong).', 500);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('NETWORK', 'Body JSON tidak valid.', 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail('NETWORK', `Data tidak valid: ${first?.path?.join('.')} ${first?.message ?? ''}`.trim(), 422);
  }

  const body = parsed.data;
  const serialKey = normalizeSerialKey(body.serialKey);
  const hwid = body.hwid.toUpperCase();

  const admin = createAdminClient();
  const ip = clientIpFromRequest(req);
  const ua = userAgentFromRequest(req);

  /* --- 1. Validasi lisensi + HWID ---------------------------------- */
  const { data: licRaw, error: licErr } = await admin
    .from('licenses')
    .select('id, store_id, hwid_locked, status, expires_at')
    .eq('serial_key', serialKey)
    .maybeSingle();

  if (licErr) return fail('NETWORK', `Database error: ${licErr.message}`, 500);
  if (!licRaw) return fail('INVALID_KEY', 'Serial Key tidak valid.', 404);

  if (licRaw.status === 'blocked' || licRaw.status === 'revoked') {
    await audit(admin, licRaw.id, hwid, ip, ua, 'blocked', 'Sync ditolak: lisensi diblokir');
    return fail('BLOCKED', 'Lisensi diblokir admin. Hubungi Super Admin.', 403);
  }
  if (licRaw.status !== 'active') return fail('NOT_ACTIVE', 'Lisensi belum diaktifkan.', 403);
  if (!licRaw.store_id) return fail('NOT_ACTIVE', 'Lisensi belum terhubung ke data toko.', 403);
  if (licRaw.hwid_locked !== hwid) {
    await audit(admin, licRaw.id, hwid, ip, ua, 'mismatch', `Sync dari HWID lain. Terkunci: ${licRaw.hwid_locked}`);
    return NextResponse.json(
      {
        ok: false,
        code: 'HWID_MISMATCH',
        message: 'Lisensi terkunci di perangkat lain. Data tidak disinkronkan.',
        loggedHwid: licRaw.hwid_locked,
      } satisfies SyncResponse,
      { status: 403 },
    );
  }
  if (licRaw.expires_at && new Date(licRaw.expires_at).getTime() < Date.now()) {
    await admin.from('licenses').update({ status: 'expired' }).eq('id', licRaw.id);
    return fail('EXPIRED', 'Masa langganan habis.', 403);
  }

  const storeId = licRaw.store_id;

  /* --- 2. Buang data yang bukan milik toko ini ---------------------- */
  const products = body.products.filter((p) => p.store_id === storeId);
  const transactions = body.transactions.filter((t) => t.store_id === storeId);
  const txIds = new Set(transactions.map((t) => t.id));
  const items = body.transactionItems.filter((i) => i.store_id === storeId && txIds.has(i.transaction_id));

  if (!products.length && !transactions.length) {
    return NextResponse.json({
      ok: true,
      code: 'SYNC_OK',
      message: 'Tidak ada data baru untuk disinkronkan.',
      productsSynced: 0,
      transactionsSynced: 0,
      itemsSynced: 0,
      storeId,
      serverTime: new Date().toISOString(),
    } satisfies SyncResponse);
  }

  /* --- 3. Upsert produk --------------------------------------------- */
  let productsSynced = 0;
  if (products.length) {
    const { error } = await admin
      .from('products')
      .upsert(
        products.map((p) => ({
          id: p.id,
          store_id: storeId,
          sku: p.sku ?? null,
          barcode: p.barcode ?? null,
          name: p.name,
          category: p.category ?? 'Umum',
          price: toNumber(p.price),
          cost: toNumber(p.cost),
          stock: p.stock | 0,
          min_stock: p.min_stock ?? 0,
          unit: p.unit ?? 'pcs',
          image_url: p.image_url ?? null,
          is_active: p.is_active ?? true,
          created_at: p.created_at,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'id' },
      );
    if (error) return fail('NETWORK', `Gagal menyimpan produk: ${error.message}`, 500);
    productsSynced = products.length;
  }

  /* --- 4. Upsert transaksi ----------------------------------------- */
  const syncedAt = new Date().toISOString();
  let transactionsSynced = 0;
  if (transactions.length) {
    const { error } = await admin
      .from('transactions')
      .upsert(
        transactions.map((t) => ({
          id: t.id,
          store_id: storeId,
          invoice_no: t.invoice_no,
          subtotal: toNumber(t.subtotal),
          discount_type: t.discount_type,
          discount_value: toNumber(t.discount_value),
          discount_amount: toNumber(t.discount_amount),
          total: toNumber(t.total),
          total_cost: toNumber(t.total_cost),
          paid: toNumber(t.paid),
          change_due: toNumber(t.change_due),
          payment_method: t.payment_method,
          note: t.note ?? null,
          cashier_name: t.cashier_name ?? null,
          device_id: body.deviceId,
          status: t.status,
          created_at: t.created_at,
          synced_at: syncedAt,
        })),
        { onConflict: 'id' },
      );
    if (error) return fail('NETWORK', `Gagal menyimpan transaksi: ${error.message}`, 500);
    transactionsSynced = transactions.length;
  }

  /* --- 5. Upsert item transaksi ------------------------------------- */
  let itemsSynced = 0;
  if (items.length) {
    const { error } = await admin
      .from('transaction_items')
      .upsert(
        items.map((i) => ({
          id: i.id,
          transaction_id: i.transaction_id,
          store_id: storeId,
          product_id: i.product_id ?? null,
          barcode: i.barcode ?? null,
          product_name: i.product_name,
          price: toNumber(i.price),
          cost: toNumber(i.cost ?? 0),
          qty: toNumber(i.qty),
          discount: toNumber(i.discount ?? 0),
          subtotal: toNumber(i.subtotal),
        })),
        { onConflict: 'id' },
      );
    if (error) return fail('NETWORK', `Gagal menyimpan detail transaksi: ${error.message}`, 500);
    itemsSynced = items.length;
  }

  return NextResponse.json({
    ok: true,
    code: 'SYNC_OK',
    message: 'Sinkronisasi berhasil.',
    productsSynced,
    transactionsSynced,
    itemsSynced,
    storeId,
    serverTime: syncedAt,
  } satisfies SyncResponse);
}

async function audit(
  admin: ReturnType<typeof createAdminClient>,
  licenseId: string,
  hwid: string,
  ip: string,
  ua: string,
  result: string,
  detail: string,
) {
  try {
    await admin.from('hwid_logs').insert({
      license_id: licenseId,
      hwid,
      ip_address: ip,
      user_agent: ua,
      result,
      detail,
    });
  } catch {
    /* ignore */
  }
}
