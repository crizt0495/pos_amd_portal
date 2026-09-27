/**
 * Domain types shared between the Next.js web app, the POS client and the
 * Electron main process.
 */

export type AppRole = 'super_admin' | 'partner' | 'owner';
export type LicenseStatus = 'unused' | 'active' | 'blocked' | 'expired' | 'revoked';
export type PaketType = 'bundle_pc_app' | 'app_only';
export type LicenseType = 'permanent' | 'subscription';
export type TxStatus = 'completed' | 'void';
export type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'debit' | 'credit';
export type DiscountType = 'none' | 'percent' | 'fixed';
export type PayoutStatus = 'pending' | 'paid';
export type SyncState = 'pending' | 'syncing' | 'synced' | 'error';

export interface Profile {
  id: string;
  role: AppRole;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: string;
  user_id: string | null;
  nama_toko: string;
  alamat: string | null;
  no_hp: string | null;
  license_quota: number;
  license_granted: number;
  commission_rate: number;
  status: 'active' | 'suspended';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  partner_id: string | null;
  user_id: string | null;
  store_name: string;
  owner_name: string;
  no_hp: string | null;
  alamat: string | null;
  paket_type: PaketType;
  license_type: LicenseType;
  device_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface License {
  id: string;
  serial_key: string;
  partner_id: string | null;
  store_id: string | null;
  hwid_locked: string | null;
  status: LicenseStatus;
  paket_type: PaketType;
  license_type: LicenseType;
  price_idr: number;
  commission_idr: number;
  period_months: number | null;
  expires_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseWithStore extends License {
  store?: Pick<Store, 'id' | 'store_name' | 'owner_name' | 'no_hp' | 'alamat'> | null;
  partner?: Pick<Partner, 'id' | 'nama_toko' | 'no_hp' | 'commission_rate'> | null;
}

export interface HwidHistoryRow {
  id: string;
  license_id: string;
  hwid: string;
  device_name: string | null;
  app_version: string | null;
  is_current: boolean;
  created_at: string;
}

export interface HwidLogRow {
  id: string;
  license_id: string | null;
  hwid: string;
  ip_address: string | null;
  user_agent: string | null;
  result: string;
  detail: string | null;
  activated_at: string;
}

export interface Product {
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
}

export interface Transaction {
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
  created_at: string;
  synced_at: string | null;
}

export interface TransactionItem {
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
}

export interface Payout {
  id: string;
  partner_id: string;
  amount: number;
  period_from: string | null;
  period_to: string | null;
  status: PayoutStatus;
  note: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface CartLine {
  /** Baris keranjang lokal: product_id bisa null untuk item manual. */
  product_id: string | null;
  barcode: string | null;
  name: string;
  price: number;
  cost: number;
  qty: number;
  discount: number;
  unit: string;
}

/* ------------------------------------------------------------------ */
/* Pricing / commission rules                                          */
/* ------------------------------------------------------------------ */

/** Harga jual paket ke end user (IDR). */
export const PAKET_PRICE: Record<PaketType, number> = {
  bundle_pc_app: 3_500_000,
  app_only: 2_500_000,
};

/** Jatah komisi untuk toko partner (IDR). */
export const PAKET_COMMISSION: Record<PaketType, number> = {
  bundle_pc_app: 2_500_000,
  app_only: 500_000,
};

/** MARKUP — berapa jatah lisensi yang dibeli per lisensi terjual. */
export const LICENSE_MARKUP = 1;

export const DEFAULT_PERIOD_MONTHS: Record<LicenseType, number | null> = {
  permanent: null,
  subscription: 12,
};

export const QUOTA_LOW_WARNING = 1;
export const TOPUP_AMOUNT = 5;

export const PAKET_LABEL: Record<PaketType, string> = {
  bundle_pc_app: 'Bundle PC + APP',
  app_only: 'Aplikasi Saja',
};

export const LICENSE_TYPE_LABEL: Record<LicenseType, string> = {
  permanent: 'Aktif Selamanya',
  subscription: 'Langganan',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  debit: 'Kartu Debit',
  credit: 'Kartu Kredit',
};

export const STATUS_LABEL: Record<LicenseStatus, string> = {
  unused: 'Belum Dipakai',
  active: 'Aktif',
  blocked: 'Diblokir',
  expired: 'Kedaluwarsa',
  revoked: 'Dicabut',
};

/* ------------------------------------------------------------------ */
/* Activation                                                          */
/* ------------------------------------------------------------------ */

export type ActivationCode =
  | 'ACTIVATED'
  | 'ALREADY_ACTIVE'
  | 'INVALID_KEY'
  | 'NOT_ACTIVE'
  | 'BLOCKED'
  | 'EXPIRED'
  | 'HWID_MISMATCH'
  | 'OFFLINE'
  | 'NETWORK';

export interface ActivateRequest {
  serialKey: string;
  hwid: string;
  deviceName?: string;
  appVersion?: string;
}

export interface ActivateResponse {
  ok: boolean;
  code: ActivationCode;
  message: string;
  license?: {
    id: string;
    partnerId: string | null;
    storeId: string | null;
    storeName: string | null;
    ownerName: string | null;
    paketType: PaketType;
    licenseType: LicenseType;
    hwidLocked: string | null;
    lockedNow: boolean;
    expiresAt: string | null;
  };
  loggedHwid?: string | null;
}

/* ------------------------------------------------------------------ */
/* POS sync                                                            */
/* ------------------------------------------------------------------ */

export interface SyncRequest {
  serialKey: string;
  hwid: string;
  deviceId: string;
  appVersion?: string;
  products: Product[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
}

export interface SyncResponse {
  ok: boolean;
  code: ActivationCode | 'SYNC_OK';
  message: string;
  productsSynced?: number;
  transactionsSynced?: number;
  itemsSynced?: number;
  serverTime?: string;
  storeId?: string | null;
  /** HWID yang tercatat di server (dikirim saat mismatch, untuk ditampilkan). */
  loggedHwid?: string | null;
}

/* ------------------------------------------------------------------ */
/* API response envelope                                                */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
