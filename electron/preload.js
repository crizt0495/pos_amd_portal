'use strict';

/**
 * Preload script — satu-satunya jembatan renderer <-> main process.
 * Semua API diekspos lewat contextBridge dengan validasi argumen minimal.
 * Node integration di matikan; contextIsolation aktif.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Bungkus pemanggilan IPC agar error tidak pernah keluar sebagai exception. */
function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).catch((err) => ({
    ok: false,
    error: (err && err.message) || 'Gagal communicate dengan proses utama.',
  }));
}

const electronAPI = {
  /** HWID perangkat (motherboard/BIOS UUID) untuk hardware locking lisensi. */
  getHwid: () => invoke('kasirpro:get-hwid'),

  /** Cetak struk thermal 58mm. */
  printReceipt: (payload) => invoke('kasirpro:print-receipt', payload),

  /** Buka URL di browser default (tantuan / tautan eksternal). */
  openExternal: (url) => invoke('kasirpro:open-external', { url }),

  /** Informasi versi aplikasi. */
  appInfo: () => invoke('kasirpro:app-info'),

  /** Restart aplikasi setelah aktivasi (berguna setelah reinstall lisensi). */
  reload: () => invoke('kasirpro:reload'),

  /** Platform info untuk deteksi tampilan. */
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
