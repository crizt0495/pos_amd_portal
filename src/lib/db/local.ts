'use client';

import Dexie, { type Table } from 'dexie';
import type {
  LicenseStatus,
  LicenseType,
  PaketType,
  PaymentMethod,
  DiscountType,
  TxStatus,
} from '@/types';

export const LOCAL_DB_NAME = 'kasirpro_local';
export const LOCAL_DB_VERSION = 1;
export const SYNC_BATCH_SIZE = 200;

/* ------------------------------------------------------------------ */
/* Tabel lokal                                                         */
/* ------------------------------------------------------------------ */

export interface LocalProduct {
  id: string;
  store_id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** 0 = belum pernah sync, 1 = sudah tersinkron ke server */
  _dirty: 0 | 1;
  _deleted?: 0 | 1;
}

export interface LocalTransaction {
  id: string;
  store_id: string;
  invoice_no: string;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  total: number;
  total_cost: number;
  paid: number;
  change_due: number;
  payment_method: PaymentMethod;
  note: string | null;
  cashier_name: string | null;
  device_id: string | null;
  status: TxStatus;
  /** waktu transaksi menurut perangkat (bukan waktu server) */
  created_at: string;
  synced_at: string | null;
  _dirty: 0 | 1;
  _deleted?: 0 | 1;
}

export interface LocalTransactionItem {
  id: string;
  transaction_id: string;
  store_id: string;
  product_id: string | null;
  barcode: string | null;
  product_name: string;
  price: number;
  cost: number;
  qty: number;
  discount: number;
  subtotal: number;
  _dirty: 0 | 1;
  _deleted?: 0 | 1;
}

/** Cache lisensi — dipakai untuk validasi offline & tampilan info toko. */
export interface LocalLicense {
  id: string;
  serial_key: string;
  partner_id: string | null;
  store_id: string | null;
  store_name: string | null;
  owner_name: string | null;
  hwid_locked: string | null;
  status: LicenseStatus;
  paket_type: PaketType;
  license_type: LicenseType;
  expires_at: string | null;
  activated_at: string | null;
  price_idr: number;
  commission_idr: number;
  checked_at: string | null;
}

/** Cache HWID — nilai ini yang dibandingkan tiap aplikasi dibuka. */
export interface LocalHwid {
  id: string; // 'current'
  hwid: string;
  source: string;
  device_name: string;
  raw: string | null;
  first_seen: string;
  last_checked: string;
  app_version: string | null;
}

/** Key/value bebas untuk pengaturan lokal, dll. */
export interface LocalMeta {
  key: string;
  value: unknown;
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

export class KasirProDB extends Dexie {
  products!: Table<LocalProduct, string>;
  transactions!: Table<LocalTransaction, string>;
  transaction_items!: Table<LocalTransactionItem, string>;
  licenses_cache!: Table<LocalLicense, string>;
  hwid_cache!: Table<LocalHwid, string>;
  meta!: Table<LocalMeta, string>;

  constructor() {
    super(LOCAL_DB_NAME);
    this.version(LOCAL_DB_VERSION).stores({
      products: 'id, store_id, barcode, name, category, is_active, _dirty, updated_at',
      transactions:
        'id, store_id, invoice_no, created_at, status, payment_method, _dirty, [store_id+created_at]',
      transaction_items: 'id, transaction_id, store_id, product_id, _dirty',
      licenses_cache: 'id, serial_key, store_id, status',
      hwid_cache: 'id, hwid',
      meta: 'key',
    });
  }
}

let db: KasirProDB | null = null;

export function getDB(): KasirProDB {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB tidak tersedia di lingkungan ini.');
  }
  if (!db) db = new KasirProDB();
  return db;
}

/* ------------------------------------------------------------------ */
/* Meta helpers                                                        */
/* ------------------------------------------------------------------ */

export const META_KEYS = {
  activated: 'activated',
  deviceId: 'device_id',
  cashierName: 'cashier_name',
  storeName: 'store_name',
  lastInvoiceSeq: 'last_invoice_seq',
  lastSyncAt: 'last_sync_at',
  shopAddress: 'shop_address',
  shopPhone: 'shop_phone',
  printerPort: 'printer_port',
  printerWidth: 'printer_width',
} as const;

export async function getMeta<T = unknown>(key: string, fallback: T): Promise<T> {
  try {
    const row = await getDB().meta.get(key);
    return (row?.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await getDB().meta.put({ key, value });
}

export async function deleteMeta(key: string): Promise<void> {
  await getDB().meta.delete(key);
}

/** Device ID stabil (dipakai server untuk audit). */
export function getDeviceId(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export async function ensureDeviceId(): Promise<string> {
  const existing = await getMeta<string | null>(META_KEYS.deviceId, null);
  if (existing) return existing;
  const id = getDeviceId();
  await setMeta(META_KEYS.deviceId, id);
  return id;
}

/* ------------------------------------------------------------------ */
/* Aktivasi lokal                                                      */
/* ------------------------------------------------------------------ */

export interface LocalActivation {
  activated: boolean;
  serialKey: string;
  licenseId: string | null;
  storeId: string | null;
  storeName: string | null;
  ownerName: string | null;
  partnerId: string | null;
  paketType: PaketType | null;
  licenseType: LicenseType | null;
  hwid: string;
  expiresAt: string | null;
  activatedAt: string | null;
}

export async function saveActivation(data: {
  licenseId: string;
  serialKey: string;
  partnerId: string | null;
  storeId: string | null;
  storeName: string | null;
  ownerName: string | null;
  paketType: PaketType;
  licenseType: LicenseType;
  hwid: string;
  expiresAt: string | null;
  priceIdr: number;
  commissionIdr: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const database = getDB();

  await database.licenses_cache.put({
    id: data.licenseId,
    serial_key: data.serialKey,
    partner_id: data.partnerId,
    store_id: data.storeId,
    store_name: data.storeName,
    owner_name: data.ownerName,
    hwid_locked: data.hwid,
    status: 'active',
    paket_type: data.paketType,
    license_type: data.licenseType,
    expires_at: data.expiresAt,
    activated_at: now,
    price_idr: data.priceIdr,
    commission_idr: data.commissionIdr,
    checked_at: now,
  });

  await setMeta(META_KEYS.activated, {
    activated: true,
    serialKey: data.serialKey,
    licenseId: data.licenseId,
    partnerId: data.partnerId,
    storeId: data.storeId,
    storeName: data.storeName,
    ownerName: data.ownerName,
    paketType: data.paketType,
    licenseType: data.licenseType,
    hwid: data.hwid,
    expiresAt: data.expiresAt,
    activatedAt: now,
  } satisfies LocalActivation);
}

export async function getActivation(): Promise<LocalActivation | null> {
  const v = await getMeta<LocalActivation | null>(META_KEYS.activated, null);
  return v;
}

export async function clearActivation(): Promise<void> {
  const database = getDB();
  await database.transaction(
    'rw',
    [database.licenses_cache, database.hwid_cache, database.meta],
    async () => {
      await database.licenses_cache.clear();
      await database.hwid_cache.clear();
      await database.meta.delete(META_KEYS.activated);
    },
  );
}

/** HWID lokal saat ini (dari bridge Electron / fingerprint browser). */
export async function getCachedHwid(): Promise<LocalHwid | null> {
  return (await getDB().hwid_cache.get('current')) ?? null;
}

export async function saveHwidCache(data: {
  hwid: string;
  source: string;
  deviceName: string;
  raw: string | null;
  appVersion: string | null;
}): Promise<LocalHwid> {
  const database = getDB();
  const existing = await database.hwid_cache.get('current');
  const now = new Date().toISOString();
  const row: LocalHwid = {
    id: 'current',
    hwid: data.hwid,
    source: data.source,
    device_name: data.deviceName,
    raw: data.raw,
    first_seen: existing?.first_seen ?? now,
    last_checked: now,
    app_version: data.appVersion,
  };
  await database.hwid_cache.put(row);
  return row;
}

/* ------------------------------------------------------------------ */
/* Invoice                                                              */
/* ------------------------------------------------------------------ */

export async function nextInvoiceNo(): Promise<string> {
  const seq = await getMeta<number>(META_KEYS.lastInvoiceSeq, 0);
  const next = seq + 1;
  await setMeta(META_KEYS.lastInvoiceSeq, next);
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `INV-${ymd}-${String(next).padStart(4, '0')}`;
}
