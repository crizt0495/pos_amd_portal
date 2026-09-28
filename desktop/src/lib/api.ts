import type {
  AppLicense,
  CartTotals,
  DailyReport,
  LicenseStatus,
  PaymentReport,
  Product,
  ProductInput,
  ReportSummary,
  TopProduct,
  Transaction,
  TransactionItem,
} from '../types';

/**
 * ===========================================================================
 *  Typed wrapper untuk window.electronAPI (define di electron/preload.js)
 * ===========================================================================
 *  Semua fungsi mengembalikan bentuk seragam:
 *    { ok: true,  data }   -> berhasil
 *    { ok: false, error }  -> gagal (pesan siap tampil ke user)
 */

export interface Ok<T> {
  ok: true;
  data: T;
}
export interface Err {
  ok: false;
  error: string;
}
export type Result<T> = Ok<T> | Err;

interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  getHwid(): Promise<{ ok: boolean; hwid?: string; deviceName?: string; source?: string; error?: string }>;
  appInfo(): Promise<{
    ok: boolean;
    version?: string;
    platform?: string;
    portalUrl?: string;
    dbPath?: string;
    escpos?: boolean;
    error?: string;
  }>;
  activateLicense(serialKey: string): Promise<LicenseStatus>;
  checkLicense(): Promise<LicenseStatus>;
  resetLicense(): Promise<{ ok: boolean; message?: string; error?: string }>;
  products: {
    list(search?: string, includeInactive?: boolean): Promise<Result<Product[]>>;
    get(id: string): Promise<Result<Product | null>>;
    findByBarcode(barcode: string): Promise<Result<Product | null>>;
    categories(): Promise<Result<string[]>>;
    lowStock(): Promise<Result<Product[]>>;
    create(data: ProductInput): Promise<Result<Product>>;
    update(id: string, data: Partial<ProductInput>): Promise<Result<Product>>;
    remove(id: string): Promise<Result<{ id: string }>>;
    adjustStock(id: string, delta: number): Promise<Result<Product>>;
  };
  transactions: {
    create(data: {
      lines: unknown[];
      discountType: string;
      discountValue: number;
      paymentMethod: string;
      paid: number;
      note?: string | null;
      cashierName: string;
    }): Promise<Result<{ transaction: Transaction; totals: unknown; changeDue: number }>>;
    list(filter?: { from?: string; to?: string; limit?: number; offset?: number; status?: string }): Promise<
      Result<Transaction[]>
    >;
    count(filter?: { from?: string; to?: string; status?: string }): Promise<Result<number>>;
    get(id: string): Promise<{
      ok: boolean;
      data?: Transaction | null;
      items?: TransactionItem[];
      error?: string;
    }>;
    void(id: string): Promise<Result<Transaction>>;
  };
  reports: {
    summary(range?: { from?: string; to?: string }): Promise<Result<ReportSummary>>;
    topProducts(range?: { from?: string; to?: string }): Promise<Result<TopProduct[]>>;
    daily(range?: { from?: string; to?: string }): Promise<Result<DailyReport[]>>;
    byPayment(range?: { from?: string; to?: string }): Promise<Result<PaymentReport[]>>;
  };
  settings: {
    get(key: string, fallback?: unknown): Promise<Result<unknown>>;
    set(key: string, value: unknown): Promise<Result<unknown>>;
    all(): Promise<Result<Record<string, unknown>>>;
  };
  printReceipt(
    data: unknown,
    port?: string,
  ): Promise<{ ok: boolean; via?: string; error?: string }>;
  printTest(port?: string): Promise<{ ok: boolean; via?: string; error?: string }>;
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

const OFFLINE_MESSAGE =
  'Tidak bisa communicate dengan proses utama Electron. Jalankan aplikasi lewat `npm run dev` atau file .exe hasil build.';

function api(): ElectronAPI {
  const bridge = window.electronAPI;
  if (!bridge) throw new Error(OFFLINE_MESSAGE);
  return bridge;
}

function unwrap<T>(res: { ok: boolean; data?: unknown; error?: string }): Result<T> {
  if (!res?.ok) return { ok: false, error: res?.error ?? 'Terjadi kesalahan.' };
  return { ok: true, data: res.data as T };
}

/** True bila aplikasi dijalankan di dalam Electron (bukan browser biasa). */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
}

export const system = {
  getHwid: () => api().getHwid(),
  appInfo: () => api().appInfo(),
};

export const licenseApi = {
  activate: (serialKey: string) => api().activateLicense(serialKey),
  check: () => api().checkLicense(),
  reset: () => api().resetLicense(),
};

export const productsApi = {
  list: async (search = '', includeInactive = false): Promise<Result<Product[]>> =>
    unwrap<Product[]>(await api().products.list(search, includeInactive)),
  get: async (id: string): Promise<Result<Product | null>> =>
    unwrap<Product | null>(await api().products.get(id)),
  findByBarcode: async (barcode: string): Promise<Result<Product | null>> =>
    unwrap<Product | null>(await api().products.findByBarcode(barcode)),
  categories: async (): Promise<Result<string[]>> =>
    unwrap<string[]>(await api().products.categories()),
  lowStock: async (): Promise<Result<Product[]>> => unwrap<Product[]>(await api().products.lowStock()),
  create: async (data: ProductInput): Promise<Result<Product>> =>
    unwrap<Product>(await api().products.create(data)),
  update: async (id: string, data: Partial<ProductInput>): Promise<Result<Product>> =>
    unwrap<Product>(await api().products.update(id, data)),
  remove: async (id: string): Promise<Result<{ id: string }>> =>
    unwrap<{ id: string }>(await api().products.remove(id)),
  adjustStock: async (id: string, delta: number): Promise<Result<Product>> =>
    unwrap<Product>(await api().products.adjustStock(id, delta)),
};

export interface TxWithItems {
  transaction: Transaction | null;
  items: TransactionItem[];
}

export interface CreatedTx {
  transaction: Transaction;
  totals: CartTotals;
  changeDue: number;
}

export const transactionsApi = {
  create: async (data: Parameters<ElectronAPI['transactions']['create']>[0]): Promise<Result<CreatedTx>> =>
    unwrap<CreatedTx>(await api().transactions.create(data)),
  list: async (filter: Parameters<ElectronAPI['transactions']['list']>[0] = {}): Promise<Result<Transaction[]>> =>
    unwrap<Transaction[]>(await api().transactions.list(filter)),
  count: async (filter: Parameters<ElectronAPI['transactions']['count']>[0] = {}): Promise<Result<number>> =>
    unwrap<number>(await api().transactions.count(filter)),
  get: async (id: string): Promise<Result<TxWithItems>> => {
    const res = await api().transactions.get(id);
    if (!res.ok) return { ok: false, error: res.error ?? 'Gagal memuat transaksi.' };
    return {
      ok: true,
      data: { transaction: res.data ?? null, items: res.items ?? [] },
    };
  },
  void: async (id: string): Promise<Result<Transaction>> =>
    unwrap<Transaction>(await api().transactions.void(id)),
};

export const reportsApi = {
  summary: async (range: { from?: string; to?: string } = {}): Promise<Result<ReportSummary>> =>
    unwrap<ReportSummary>(await api().reports.summary(range)),
  topProducts: async (range: { from?: string; to?: string } = {}): Promise<Result<TopProduct[]>> =>
    unwrap<TopProduct[]>(await api().reports.topProducts(range)),
  daily: async (range: { from?: string; to?: string } = {}): Promise<Result<DailyReport[]>> =>
    unwrap<DailyReport[]>(await api().reports.daily(range)),
  byPayment: async (range: { from?: string; to?: string } = {}): Promise<Result<PaymentReport[]>> =>
    unwrap<PaymentReport[]>(await api().reports.byPayment(range)),
};

export const settingsApi = {
  get: async <T>(key: string, fallback: T): Promise<T> => {
    const res = unwrap<T>(await api().settings.get(key, fallback));
    return res.ok ? (res.data ?? fallback) : fallback;
  },
  set: async (key: string, value: unknown): Promise<Result<unknown>> =>
    unwrap<unknown>(await api().settings.set(key, value)),
  all: async () => unwrap<Record<string, unknown>>(await api().settings.all()),
};

export const printerApi = {
  receipt: (data: unknown, port?: string) => api().printReceipt(data, port),
  test: (port?: string) => api().printTest(port),
};

export type { AppLicense, Product, Transaction, TransactionItem };
