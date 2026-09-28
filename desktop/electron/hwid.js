'use strict';

const crypto = require('node:crypto');
const os = require('node:os');

/**
 * ===========================================================================
 *  Hardware ID (HWID) untuk hardware locking lisensi
 * ===========================================================================
 *  Sumber utama  : node-machine-id -> UUID motherboard/BIOS (paling stabil)
 *  Sumber cadangan: hash hostname + platform + arch + CPU + MAC address
 *
 *  Semua HWID dinormalisasi menjadi 32 karakter heksadesimal huruf besar
 *  supaya formatnya sama dengan yang disimpan di portal (KPRO).
 */

let machineId = null;
try {
  machineId = require('node-machine-id');
} catch {
  machineId = null;
}

/** Ubah string mentah (UUID motherboard) -> 32 hex char uppercase. */
function normalizeHwid(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';

  const compact = trimmed.replace(/[^a-fA-F0-9]/g, '');
  if (compact.length === 32) return compact.toUpperCase();

  return crypto.createHash('sha256').update(trimmed).digest('hex').slice(0, 32).toUpperCase();
}

function osName() {
  switch (process.platform) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return process.platform;
  }
}

/** Nama perangkat ringkas untuk ditampilkan di layar aktivasi. */
function deviceName() {
  let cpu = '';
  try {
    const cpus = os.cpus();
    cpu = cpus && cpus.length ? ` • ${cpus[0].model.split(' ').slice(0, 3).join(' ')}` : '';
  } catch {
    /* abaikan */
  }
  return `${osName()} ${os.hostname()}${cpu}`.trim();
}

let cache = null;

/**
 * Ambil HWID perangkat. Hasil di-cache karena nilainya tidak berubah
 * selama aplikasi berjalan.
 */
async function getHwid() {
  if (cache) return cache;

  if (machineId) {
    try {
      const original = machineId.machineIdSync({ original: true });
      cache = {
        ok: true,
        hwid: normalizeHwid(original),
        source: 'motherboard-uuid',
        deviceName: deviceName(),
        raw: original,
      };
      return cache;
    } catch (err) {
      console.warn('[KasirPro] motherboard UUID gagal:', err.message);
    }

    try {
      const id = machineId.machineIdSync();
      cache = {
        ok: true,
        hwid: normalizeHwid(id),
        source: 'machine-id',
        deviceName: deviceName(),
        raw: id,
      };
      return cache;
    } catch (err) {
      console.warn('[KasirPro] machine-id gagal:', err.message);
    }
  }

  try {
    const parts = [
      os.hostname(),
      os.platform(),
      os.arch(),
      (os.cpus()[0] || {}).model || '',
      Object.values(os.networkInterfaces())
        .flat()
        .filter(Boolean)
        .map((n) => n.mac)
        .filter(Boolean)
        .sort()
        .join(','),
    ].join('|');

    cache = {
      ok: true,
      hwid: normalizeHwid(parts),
      source: 'fallback',
      deviceName: deviceName(),
      raw: parts,
    };
    return cache;
  } catch (err) {
    cache = { ok: false, error: 'HWID tidak dapat dibaca pada perangkat ini.' };
    return cache;
  }
}

module.exports = { getHwid, normalizeHwid, deviceName };
