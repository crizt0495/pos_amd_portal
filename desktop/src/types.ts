/**
 * ===========================================================================
 *  Types renderer untuk KasirPro Desktop
 * ===========================================================================
 *  Bentuk data ini SALINAN dari tabel SQLite di electron/db.js.
 *  Renderer tidak pernah bicara langsung dengan file database — semua lewat
 *  `window.electronAPI` (lihat src/lib/api.ts).
 */

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  unit: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type ProductInput = {
  barcode?: string | null;
  name: string;
  category?: string;
  price: number;
  cost: number;
  stock: number;
  min_stock?: number;
  unit?: string;
  is_active?: boolean;
};

export type DiscountType = 'none' | 'percent' | 'fixed';
export type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'debit' | 'credit';
export type TxStatus = 'completed' | 'void';

export interface CartLine {
  product_id: string | null;
  barcode: string | null;
  name: string;
  price: number;
  cost: number;
  qty: number;
  discount: number;
  unit: string;
  /** Stok saat ditambahkan (untuk membatasi tombol +). */
  stock: number | null;
}

export interface Transaction {
  id: string;
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
  status: TxStatus;
  created_at: string;
}

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string | null;
  barcode: string | null;
  product_name: string;
  price: number;
  cost: number;
  qty: number;
  discount: number;
  subtotal: number;
}

export interface AppLicense {
  id: number;
  serial_key: string | null;
  hwid: string | null;
  is_activated: number;
  activated_at: string | null;
  nama_toko: string | null;
  pembeli_nama: string | null;
  paket_type: string | null;
  license_type: string | null;
  expires_at: string | null;
  app_version: string | null;
  last_check_at: string | null;
}

export type LicenseCode =
  | 'OK'
  | 'NOT_ACTIVATED'
  | 'HWID_MISMATCH'
  | 'EXPIRED'
  | 'HWID_ERROR'
  | 'INVALID_KEY'
  | 'BLOCKED'
  | 'NETWORK'
  | 'TIMEOUT'
  | string;

export interface LicenseStatus {
  ok: boolean;
  code: LicenseCode;
  message: string;
  license?: AppLicense | null;
  lockedHwid?: string | null;
  device?: { hwid: string; deviceName: string };
}

export interface ReportSummary {
  jumlah_transaksi: number;
  total_omzet: number;
  total_laba: number;
  total_diskon: number;
  total_terima: number;
  total_item: number;
  rata_rata: number;
}

export interface TopProduct {
  name: string;
  product_id: string | null;
  qty: number;
  omzet: number;
}

export interface DailyReport {
  tanggal: string;
  transaksi: number;
  omzet: number;
  laba: number;
}

export interface PaymentReport {
  metode: PaymentMethod;
  n: number;
  omzet: number;
}

export interface CartTotals {
  subtotal: number;
  discountAmount: number;
  total: number;
  totalCost: number;
  itemCount: number;
  profit: number;
}

export interface ReceiptData {
  invoiceNo: string;
  createdAt: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  cashierName: string;
  items: { name: string; price: number; qty: number; discount: number; subtotal: number }[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paid: number;
  changeDue: number;
  paymentMethod: string;
  note?: string | null;
  serialKey?: string;
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  debit: 'Kartu Debit',
  credit: 'Kartu Kredit',
};
