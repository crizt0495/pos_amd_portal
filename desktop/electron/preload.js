'use strict';

/**
 * Preload script — satu-satunya jembatan renderer <-> main process.
 * Node integration dimatikan, contextIsolation aktif: renderer hanya bisa
 * memakai API yang didefinisikan di bawah (tidak ada akses fs/network bebas).
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Bungkus IPC agar error tidak pernah melempar exception ke renderer. */
async function invoke(channel, payload) {
  try {
    return await ipcRenderer.invoke(channel, payload);
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Gagal communicate dengan proses utama.' };
  }
}

const electronAPI = {
  platform: process.platform,
  isElectron: true,

  /* ------------------------------ sistem ------------------------------ */
  getHwid: () => invoke('get-hwid'),
  appInfo: () => invoke('app-info'),

  /* ----------------------------- lisensi ------------------------------ */
  /** Aktivasi online (butuh internet 1x). */
  activateLicense: (serialKey) => invoke('activate-license', { serialKey }),
  /** Cek lokal: HWID lock + masa langganan. */
  checkLicense: () => invoke('check-license'),
  resetLicense: () => invoke('reset-license'),

  /* ------------------------------ produk ------------------------------ */
  products: {
    list: (search = '', includeInactive = false) =>
      invoke('products:list', { search, includeInactive }),
    get: (id) => invoke('products:get', { id }),
    findByBarcode: (barcode) => invoke('products:find-barcode', { barcode }),
    categories: () => invoke('products:categories'),
    lowStock: () => invoke('products:low-stock'),
    create: (data) => invoke('products:create', data),
    update: (id, data) => invoke('products:update', { id, ...data }),
    remove: (id) => invoke('products:remove', { id }),
    adjustStock: (id, delta) => invoke('products:adjust-stock', { id, delta }),
  },

  /* ---------------------------- transaksi ----------------------------- */
  transactions: {
    create: (data) => invoke('transactions:create', data),
    list: (filter = {}) => invoke('transactions:list', filter),
    count: (filter = {}) => invoke('transactions:count', filter),
    get: (id) => invoke('transactions:get', { id }),
    void: (id) => invoke('transactions:void', { id }),
  },

  /* ----------------------------- laporan ------------------------------ */
  reports: {
    summary: (range = {}) => invoke('reports:summary', range),
    topProducts: (range = {}) => invoke('reports:top-products', { ...range, limit: 10 }),
    daily: (range = {}) => invoke('reports:daily', range),
    byPayment: (range = {}) => invoke('reports:by-payment', range),
  },

  /* --------------------------- pengaturan ----------------------------- */
  settings: {
    get: (key, fallback = null) => invoke('settings:get', { key, fallback }),
    set: (key, value) => invoke('settings:set', { key, value }),
    all: () => invoke('settings:all'),
  },

  /* ------------------------------ cetak ------------------------------- */
  printReceipt: (data, port) => invoke('print-receipt', { data, port }),
  printTest: (port) => invoke('print-test', { port }),

  /* ------------------------------ lain -------------------------------- */
  openExternal: (url) => invoke('open-external', { url }),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
