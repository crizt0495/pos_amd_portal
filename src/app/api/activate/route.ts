import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { clientIpFromRequest, userAgentFromRequest } from '@/lib/supabase/session';
import { normalizeSerialKey } from '@/lib/serial';
import { APP_VERSION } from '@/lib/utils';
import type { ActivateResponse, LicenseType, PaketType } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  serialKey: z.string().min(6, 'Serial Key terlalu pendek').max(64),
  hwid: z
    .string()
    .min(8, 'HWID tidak valid')
    .max(128)
    .regex(/^[A-Za-z0-9-]+$/, 'HWID tidak valid'),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(32).optional(),
});

function fail(
  code: ActivateResponse['code'],
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status });
}

interface LicenseRow {
  id: string;
  partner_id: string | null;
  store_id: string | null;
  hwid_locked: string | null;
  status: string;
  paket_type: PaketType;
  license_type: LicenseType;
  expires_at: string | null;
}

/**
 * POST /api/activate
 * Dipanggil aplikasi client saat user memasukkan Serial Key.
 * WAJIB online. Server mengunci HWID ke lisensi.
 *
 * Alur:
 *  - serial_key valid + status `unused` -> kunci HWID, catat hwid_history + hwid_logs
 *  - status `active` + HWID sama       -> boleh masuk (idempoten)
 *  - status `active` + HWID beda       -> HWID_MISMATCH (aplikasi dicopy)
 *  - status `blocked` / `expired`      -> tolak
 */
export async function POST(req: Request) {
  if (!hasServiceRole()) {
    return fail('NETWORK', 'Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY kosong).', 500);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('INVALID_KEY', 'Body JSON tidak valid.', 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail('INVALID_KEY', parsed.error.issues[0]?.message ?? 'Data aktivasi tidak valid.', 422);
  }

  const { serialKey, hwid, deviceName, appVersion } = parsed.data;
  const normalized = normalizeSerialKey(serialKey);
  if (!normalized) {
    return fail('INVALID_KEY', 'Format Serial Key tidak dikenali. Contoh: KPRO-XXXX-XXXX-XXXX', 422);
  }

  const hwidNormalized = hwid.toUpperCase();
  const ip = clientIpFromRequest(req);
  const ua = userAgentFromRequest(req);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return fail('NETWORK', e instanceof Error ? e.message : 'Gagal membuat koneksi database.', 500);
  }

  const { data: licenseRaw, error: lookupError } = await admin
    .from('licenses')
    .select('*')
    .eq('serial_key', normalized)
    .maybeSingle();

  if (lookupError) {
    return fail('NETWORK', `Database error: ${lookupError.message}`, 500);
  }
  if (!licenseRaw) {
    await logAttempt(admin, null, hwidNormalized, ip, ua, 'invalid_key', 'Serial key tidak ditemukan');
    return fail('INVALID_KEY', 'Serial Key tidak ditemukan. Periksa kembali kode dari toko Anda.', 404);
  }

  const license = licenseRaw as unknown as LicenseRow;

  if (license.status === 'blocked' || license.status === 'revoked') {
    await logAttempt(admin, license.id, hwidNormalized, ip, ua, 'blocked', 'Lisensi diblokir admin');
    return fail('BLOCKED', 'Lisensi ini telah DIBLOKIR oleh admin. Hubungi Super Admin.', 403, {
      loggedHwid: license.hwid_locked,
    });
  }

  const expired = license.expires_at ? new Date(license.expires_at).getTime() < Date.now() : false;
  if (license.status === 'expired' || expired) {
    if (license.status !== 'expired') {
      await admin.from('licenses').update({ status: 'expired' }).eq('id', license.id);
    }
    await logAttempt(admin, license.id, hwidNormalized, ip, ua, 'expired', 'Masa langganan habis');
    return fail('EXPIRED', 'Masa langganan lisensi ini sudah habis. Hubungi toko Anda.', 403);
  }

  // --- Sudah aktif: hanya perangkat yang sama boleh masuk --------------
  if (license.status === 'active' && license.hwid_locked) {
    if (license.hwid_locked === hwidNormalized) {
      return buildSuccess(
        license,
        'ALREADY_ACTIVE',
        'Lisensi sudah aktif di perangkat ini.',
        false,
        admin,
      );
    }
    await logAttempt(
      admin,
      license.id,
      hwidNormalized,
      ip,
      ua,
      'mismatch',
      `HWID tidak cocok. Terkunci: ${license.hwid_locked}`,
    );
    return NextResponse.json(
      {
        ok: false,
        code: 'HWID_MISMATCH',
        message:
          'APLIKASI INI SUDAH DI-COPY KE KOMPUTER LAIN. Lisensi terkunci di perangkat asli. Hubungi Super Admin untuk reset HWID.',
        loggedHwid: license.hwid_locked,
      } satisfies ActivateResponse,
      { status: 403 },
    );
  }

  // --- Kunci HWID secara atomik ----------------------------------------
  // Filter `.eq('status','unused').is('hwid_locked', null)` membuat dua device
  // yang aktivasi bersamaan tidak mungkin berhasil dua-duanya.
  const nowIso = new Date().toISOString();
  const { data: updatedRaw, error: updErr } = await admin
    .from('licenses')
    .update({
      hwid_locked: hwidNormalized,
      status: 'active',
      activated_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', license.id)
    .eq('status', 'unused')
    .is('hwid_locked', null)
    .select()
    .maybeSingle();

  if (updErr) {
    return fail('NETWORK', `Gagal mengunci lisensi: ${updErr.message}`, 500);
  }

  if (!updatedRaw) {
    // Race condition: device lain menang. Ambil state terbaru.
    const { data: fresh } = await admin.from('licenses').select('*').eq('id', license.id).maybeSingle();
    const freshLicense = (fresh ?? license) as unknown as LicenseRow;
    if (freshLicense.hwid_locked && freshLicense.hwid_locked !== hwidNormalized) {
      await logAttempt(admin, license.id, hwidNormalized, ip, ua, 'mismatch', 'Race condition aktivasi');
      return fail('HWID_MISMATCH', 'Lisensi sudah terkunci di perangkat lain. Hubungi admin.', 403, {
        loggedHwid: freshLicense.hwid_locked,
      });
    }
    return buildSuccess(
      freshLicense,
      'ALREADY_ACTIVE',
      'Lisensi sudah aktif di perangkat ini.',
      false,
      admin,
    );
  }

  const updated = updatedRaw as unknown as LicenseRow;

  // --- Audit: hwid_history + hwid_logs ---------------------------------
  await admin.from('hwid_history').update({ is_current: false }).eq('license_id', license.id);
  await admin.from('hwid_history').insert({
    license_id: license.id,
    hwid: hwidNormalized,
    is_current: true,
    device_name: deviceName ?? null,
    app_version: appVersion ?? APP_VERSION,
  });
  await logAttempt(admin, license.id, hwidNormalized, ip, ua, 'success', 'HWID dikunci');

  return buildSuccess(
    updated,
    'ACTIVATED',
    'Lisensi berhasil diaktifkan dan terkunci ke perangkat ini.',
    true,
    admin,
  );
}

/* ------------------------------------------------------------------ */

async function buildSuccess(
  license: LicenseRow,
  code: ActivateResponse['code'],
  message: string,
  lockedNow: boolean,
  admin: ReturnType<typeof createAdminClient>,
): Promise<NextResponse> {
  let storeName: string | null = null;
  let ownerName: string | null = null;

  if (license.store_id) {
    const { data: store } = await admin
      .from('stores')
      .select('store_name, owner_name')
      .eq('id', license.store_id)
      .maybeSingle();
    storeName = store?.store_name ?? null;
    ownerName = store?.owner_name ?? null;
  }

  const payload: ActivateResponse = {
    ok: true,
    code,
    message,
    license: {
      id: license.id,
      partnerId: license.partner_id,
      storeId: license.store_id,
      storeName,
      ownerName,
      paketType: license.paket_type,
      licenseType: license.license_type,
      hwidLocked: license.hwid_locked,
      lockedNow,
      expiresAt: license.expires_at,
    },
  };

  return NextResponse.json(payload, { status: 200 });
}

async function logAttempt(
  admin: ReturnType<typeof createAdminClient>,
  licenseId: string | null,
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
    /* audit log tidak boleh menggagalkan aktivasi */
  }
}
