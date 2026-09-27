import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { bearerFromRequest, getSessionInfo } from '@/lib/supabase/session';
import { createLicenseWithUniqueKey } from '@/lib/license-service';
import {
  DEFAULT_PERIOD_MONTHS,
  PAKET_COMMISSION,
  PAKET_PRICE,
  type LicenseType,
  type LicenseWithStore,
  type PaketType,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  namaTokoPembeli: z.string().min(2, 'Nama toko wajib diisi').max(120),
  namaPembeli: z.string().min(2, 'Nama pembeli wajib diisi').max(120),
  noHp: z.string().min(6, 'No HP minimal 6 digit').max(30),
  alamat: z.string().max(300).optional().default(''),
  paket: z.enum(['bundle_pc_app', 'app_only']),
  licenseType: z.enum(['permanent', 'subscription']),
  periodMonths: z.number().int().min(1).max(60).optional(),
  deviceNote: z.string().max(200).optional().default(''),
  /** Admin boleh membuat lisensi untuk partner lain. */
  partnerId: z.string().uuid().optional(),
});

function fail(error: string, status = 400, code = 'BAD_REQUEST', details?: unknown) {
  return NextResponse.json({ error, code, details }, { status });
}

/**
 * POST /api/partner/licenses
 * Buat store + serial key baru. Kuota partner berkurang 1 (dicek & dikunci
 * secara atomik oleh trigger/SQL di sisi database).
 *
 * Role:
 *  - partner : hanya untuk dirinya sendiri
 *  - super_admin : boleh menambah lisensi untuk partner mana pun
 */
export async function POST(req: Request) {
  if (!hasServiceRole()) return fail('Server belum dikonfigurasi.', 500, 'NO_SERVICE_ROLE');

  const session = await getSessionInfo(bearerFromRequest(req));
  if (!session) return fail('Sesi tidak valid. Silakan login ulang.', 401, 'UNAUTHORIZED');

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('Body JSON tidak valid.', 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 422, 'VALIDATION', parsed.error.flatten());
  }
  const input = parsed.data;

  const admin = createAdminClient();

  /* --- 1. Tentukan partner tujuan ----------------------------------- */
  let partnerId: string | null = null;
  let partnerName = '';

  if (session.role === 'super_admin') {
    partnerId = input.partnerId ?? null;
    if (partnerId) {
      const { data: p } = await admin
        .from('partners')
        .select('id, nama_toko, license_quota, status')
        .eq('id', partnerId)
        .maybeSingle();
      if (!p) return fail('Partner tidak ditemukan.', 404, 'PARTNER_NOT_FOUND');
      partnerName = p.nama_toko;
      if (p.status !== 'active') return fail('Partner berstatus suspended.', 403, 'PARTNER_SUSPENDED');
      if (p.license_quota <= 0) {
        return fail('Kuota lisensi partner sudah habis. Topup dulu di panel admin.', 403, 'QUOTA_EXHAUSTED');
      }
    }
  } else if (session.role === 'partner') {
    const { data: p } = await admin
      .from('partners')
      .select('id, nama_toko, license_quota, status')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (!p) return fail('Data partner tidak ditemukan. Hubungi admin.', 404, 'PARTNER_NOT_FOUND');
    partnerId = p.id;
    partnerName = p.nama_toko;
    if (p.status !== 'active') return fail('Akun partner disuspend.', 403, 'PARTNER_SUSPENDED');
    if (p.license_quota <= 0) {
      return fail(
        'Stok lisensi habis. Hubungi Super Admin untuk topup.',
        403,
        'QUOTA_EXHAUSTED',
      );
    }
  } else {
    return fail('Hanya partner atau admin yang bisa membuat lisensi.', 403, 'FORBIDDEN');
  }

  if (!partnerId) return fail('partnerId wajib diisi untuk admin.', 422, 'PARTNER_REQUIRED');

  /* --- 2. Hitung harga & komisi ------------------------------------ */
  const paket = input.paket as PaketType;
  const licenseType = input.licenseType as LicenseType;
  const price = PAKET_PRICE[paket];
  const commission = PAKET_COMMISSION[paket];

  const periodMonths = licenseType === 'subscription' ? (input.periodMonths ?? DEFAULT_PERIOD_MONTHS.subscription ?? 12) : null;
  const expiresAt =
    licenseType === 'subscription' ? new Date(Date.now() + (periodMonths ?? 12) * 30.44 * 86_400_000).toISOString() : null;

  /* --- 3. Buat store pembeli --------------------------------------- */
  const { data: store, error: storeErr } = await admin
    .from('stores')
    .insert({
      partner_id: partnerId,
      store_name: input.namaTokoPembeli,
      owner_name: input.namaPembeli,
      no_hp: input.noHp,
      alamat: input.alamat || null,
      paket_type: paket,
      license_type: licenseType,
      device_note: input.deviceNote || null,
      is_active: true,
    })
    .select()
    .single();

  if (storeErr || !store) {
    return fail(`Gagal membuat data toko: ${storeErr?.message ?? 'tidak diketahui'}`, 500, 'STORE_CREATE_FAILED');
  }

  /* --- 4. Generate serial key yang unik +atomic create license ------- */
  const result = await createLicenseWithUniqueKey(admin, {
    partnerId,
    storeId: store.id as string,
    paket,
    licenseType,
    price,
    commission,
    periodMonths,
    expiresAt,
    actorEmail: session.email,
  });

  if ('error' in result) {
    // rollback store supaya tidak ada data yatim
    await admin.from('stores').delete().eq('id', store.id);
    return fail(result.error, result.status, result.code);
  }

  const license = result.license;

  return NextResponse.json(
    {
      ok: true,
      message: `Lisensi berhasil dibuat untuk ${partnerName || 'partner'}.`,
      license: license as unknown as LicenseWithStore,
      store,
      quota: result.quota,
    },
    { status: 201 },
  );
}
