'use strict';

const { portalUrl, appVersion } = require('./config');
const { getHwid } = require('./hwid');
const db = require('./db');

/**
 * ===========================================================================
 *  Aktivasi Lisensi — satu-satunya bagian aplikasi ini yang butuh internet
 * ===========================================================================
 *  Alur:
 *   1. user mengetik Serial Key (KPRO-XXXX-XXXX-XXXX) di Screen Aktivasi
 *   2. main process POST ke  https://<PORTAL>/api/activate
 *      body: { serial_key, hwid, device_name, app_version }
 *   3. kalau server bilang ok  -> simpan ke SQLite tabel `app_license`
 *   4. setelah itu aplikasi berjalan 100% OFFLINE
 *
 *  `checkLicense()` adalah pemeriksaan LOKAL (HWID lock) — tidak butuh internet:
 *   - belum pernah diaktivasi        -> NOT_ACTIVATED  (tampil layar aktivasi)
 *   - HWID di DB != HWID perangkat    -> HWID_MISMATCH (aplikasi ketemu dicopy)
 *   - langganan sudah lewat          -> EXPIRED
 *   - selain itu                      -> OK
 */

const TIMEOUT_MS = 20_000;

function normalizeSerialKey(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';

  let body = raw.startsWith('KPRO') ? raw.slice(4) : raw;
  while (body.startsWith('KPRO')) body = body.slice(4);
  body = body.slice(0, 12);

  const groups = body.match(/.{1,4}/g) ?? [];
  const joined = groups.join('-');
  return joined ? `KPRO-${joined}` : '';
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t < Date.now();
}

/**
 * Aktivasi online. Butuh koneksi internet 1x.
 * @returns {Promise<{ok: boolean, code: string, message: string, license?: object}>}
 */
async function activate(serialKeyInput) {
  const serialKey = normalizeSerialKey(serialKeyInput);

  if (!serialKey) {
    return { ok: false, code: 'INVALID_KEY', message: 'Format Serial Key tidak dikenali.' };
  }

  const hw = await getHwid();
  if (!hw.ok || !hw.hwid) {
    return { ok: false, code: 'HWID_ERROR', message: hw.error || 'HWID tidak dapat dibaca.' };
  }

  const url = `${portalUrl()}/api/activate`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        serial_key: serialKey,
        hwid: hw.hwid,
        device_name: hw.deviceName,
        app_version: appVersion(),
      }),
      signal: controller.signal,
    });

    let json;
    try {
      json = await res.json();
    } catch {
      return {
        ok: false,
        code: 'NETWORK',
        message: `Server membalas status ${res.status} (respons tidak valid).`,
      };
    }

    if (!res.ok || !json.ok) {
      return {
        ok: false,
        code: json.code || 'NETWORK',
        message: json.message || `Aktivasi ditolak (HTTP ${res.status}).`,
        lockedHwid: json.locked_hwid ?? null,
      };
    }

    const saved = db.license.save({
      serial_key: serialKey,
      hwid: hw.hwid,
      is_activated: 1,
      activated_at: new Date().toISOString(),
      nama_toko: json.license?.nama_toko ?? null,
      pembeli_nama: json.license?.pembeli_nama ?? null,
      paket_type: json.license?.paket_type ?? null,
      license_type: json.license?.license_type ?? null,
      expires_at: json.license?.expires_at ?? null,
      app_version: appVersion(),
    });

    // nama toko & kasir default untuk struk
    if (json.license?.nama_toko && !db.settings.get('storeName')) {
      db.settings.set('storeName', json.license.nama_toko);
    }
    if (!db.settings.get('cashierName')) {
      db.settings.set('cashierName', json.license?.pembeli_nama || 'Kasir');
    }

    return {
      ok: true,
      code: json.code || 'ACTIVATED',
      message: json.message || 'Lisensi berhasil diaktifkan.',
      license: saved,
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      code: aborted ? 'TIMEOUT' : 'NETWORK',
      message: aborted
        ? `Server tidak merespons dalam ${TIMEOUT_MS / 1000} detik.`
        : `Tidak bisa menghubungi ${url}. Aktivasi WAJIB terhubung internet.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pemeriksaan lisensi LOKAL (tidak butuh internet).
 * Detectif aplikasi dicopy ke komputer lain lewat perbandingan HWID.
 */
function checkLicense() {
  const lic = db.license.get();

  if (!lic || !lic.is_activated) {
    return { ok: false, code: 'NOT_ACTIVATED', message: 'Aplikasi belum diaktivasi.', license: lic };
  }

  return getHwid().then((hw) => {
    if (!hw.ok || !hw.hwid) {
      return {
        ok: false,
        code: 'HWID_ERROR',
        message: hw.error || 'HWID tidak dapat dibaca.',
        license: lic,
      };
    }

    if (lic.hwid && lic.hwid !== hw.hwid) {
      return {
        ok: false,
        code: 'HWID_MISMATCH',
        message:
          'Lisensi ini aktif di perangkat lain. Aplikasi tidak boleh disalin ke komputer berbeda. Hubungi toko Anda untuk minta reset.',
        license: lic,
        device: { hwid: hw.hwid, deviceName: hw.deviceName },
      };
    }

    if (isExpired(lic.expires_at)) {
      return {
        ok: false,
        code: 'EXPIRED',
        message: 'Masa langganan lisensi sudah habis. Hubungi toko Anda.',
        license: lic,
        device: { hwid: hw.hwid, deviceName: hw.deviceName },
      };
    }

    db.license.touch();

    return {
      ok: true,
      code: 'OK',
      message: 'Lisensi valid.',
      license: db.license.get(),
      device: { hwid: hw.hwid, deviceName: hw.deviceName },
    };
  });
}

function resetLicense() {
  db.license.clear();
  return { ok: true, message: 'Data lisensi lokal dihapus.' };
}

module.exports = { activate, checkLicense, resetLicense, normalizeSerialKey, portalUrl };
