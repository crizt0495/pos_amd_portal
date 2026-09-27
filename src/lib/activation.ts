'use client';

import { getDB, saveActivation, saveHwidCache, META_KEYS, getMeta, setMeta } from '@/lib/db/local';
import { getHwid } from '@/lib/hwid';
import { normalizeSerialKey } from '@/lib/serial';
import { createClient } from '@/lib/supabase/client';
import { APP_VERSION, round2 } from '@/lib/utils';
import type { ActivateResponse, LicenseType, PaketType } from '@/types';

/**
 * Aktivasi lisensi.
 * WAJIB online (server adalah satu-satunya sumber kebenaran HWID).
 * Setelah berhasil, HWID disimpan di 2 tempat: Dexie (lokal) + Supabase (server).
 */
export async function activateLicense(serialKeyInput: string): Promise<ActivateResponse> {
  const serialKey = normalizeSerialKey(serialKeyInput);

  if (!serialKey) {
    return { ok: false, code: 'INVALID_KEY', message: 'Serial Key wajib diisi.' };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      code: 'OFFLINE',
      message: 'Aktivasi WAJIB terhubung internet. Hubungkan jaringan lalu coba lagi.',
    };
  }

  const hwid = await getHwid();

  // Simpan HWID ke cache lokal SEBELUM call server, supaya ada bukti perangkat
  // walau server gagal.
  await saveHwidCache({
    hwid: hwid.hwid,
    source: hwid.source,
    deviceName: hwid.deviceName,
    raw: hwid.raw,
    appVersion: APP_VERSION,
  });

  let token: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  } catch {
    token = null;
  }

  let body: ActivateResponse;
  try {
    const res = await fetch('/api/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        serialKey,
        hwid: hwid.hwid,
        deviceName: hwid.deviceName,
        appVersion: APP_VERSION,
      }),
    });
    body = (await res.json()) as ActivateResponse;
    if (!res.ok && !body.code) {
      return { ok: false, code: 'NETWORK', message: `Server menolak (${res.status}).` };
    }
  } catch (err) {
    return {
      ok: false,
      code: 'NETWORK',
      message: err instanceof Error ? err.message : 'Gagal menghubungi server aktivasi.',
    };
  }

  if (!body.ok || !body.license) return body;

  const lic = body.license;
  const existing = await getDB().licenses_cache.toArray();
  const cached = existing.find((l) => l.id === lic.id);
  const now = new Date().toISOString();

  await getDB().licenses_cache.put({
    id: lic.id,
    serial_key: serialKey,
    partner_id: lic.partnerId,
    store_id: lic.storeId,
    store_name: lic.storeName,
    owner_name: lic.ownerName,
    hwid_locked: lic.hwidLocked ?? hwid.hwid,
    status: 'active',
    paket_type: lic.paketType as PaketType,
    license_type: lic.licenseType as LicenseType,
    expires_at: lic.expiresAt,
    activated_at: cached?.activated_at ?? now,
    price_idr: cached?.price_idr ?? 0,
    commission_idr: cached?.commission_idr ?? 0,
    checked_at: now,
  });

  await saveActivation({
    licenseId: lic.id,
    serialKey,
    partnerId: lic.partnerId,
    storeId: lic.storeId,
    storeName: lic.storeName,
    ownerName: lic.ownerName,
    paketType: lic.paketType,
    licenseType: lic.licenseType,
    hwid: hwid.hwid,
    expiresAt: lic.expiresAt,
    priceIdr: cached?.price_idr ?? 0,
    commissionIdr: cached?.commission_idr ?? 0,
  });

  // Nama toko default untuk struk
  if (lic.storeName && !(await getMeta<string | null>(META_KEYS.storeName, null))) {
    await setMeta(META_KEYS.storeName, lic.storeName);
  }
  if (!getMeta<string | null>(META_KEYS.cashierName, null)) {
    await setMeta(META_KEYS.cashierName, lic.ownerName || 'Kasir');
  }

  return body;
}

/** Cek ulang lisensi di server (tanpa mengubah HWID). */
export async function verifyLicenseOnline(serialKey: string, hwid: string): Promise<ActivateResponse> {
  let token: string | null = null;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  } catch {
    token = null;
  }

  const res = await fetch('/api/pos/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ serialKey, hwid }),
  });
  return (await res.json()) as ActivateResponse;
}

/** Cek kedaluwarsa langganan secara lokal. */
export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export function monthsLeft(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, round2(diff / (1000 * 60 * 60 * 24 * 30.44)));
}
