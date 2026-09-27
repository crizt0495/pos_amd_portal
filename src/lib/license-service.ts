import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { generateSerialKey } from '@/lib/serial';
import type { LicenseType, PaketType } from '@/types';

/**
 * Pembuatan lisensi (serial key) untuk partner.
 *
 * Dipisah dari Route Handler karena Next.js hanya mengizinkan export
 * HTTP-method-specific (GET/POST/...) di berkas route.
 */

export interface CreateLicenseArgs {
  partnerId: string;
  storeId: string;
  paket: PaketType;
  licenseType: LicenseType;
  price: number;
  commission: number;
  periodMonths: number | null;
  expiresAt: string | null;
  actorEmail: string;
}

export type CreateLicenseResult =
  | { license: Record<string, unknown>; quota: number | null }
  | { error: string; status: number; code: string };

const MAX_ATTEMPTS = 5;

/**
 * Buat lisensi dengan serial key acak. Retry bila serial key bentrok
 * (sangat jarang, tapi tetap harus aman).
 *
 * Memakai RPC `create_license` bila tersedia (mengunci kuota secara atomik
 * di sisi database), dengan fallback insert manual untuk schema lama.
 */
export async function createLicenseWithUniqueKey(
  admin: SupabaseClient,
  args: CreateLicenseArgs,
): Promise<CreateLicenseResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const serialKey = generateSerialKey();

    /* 1) Jalur utama: RPC atomik create_license ------------------------- */
    const { data, error } = await admin.rpc('create_license', {
      p_partner_id: args.partnerId,
      p_store_id: args.storeId,
      p_serial_key: serialKey,
      p_paket_type: args.paket,
      p_license_type: args.licenseType,
      p_price_idr: args.price,
      p_commission_idr: args.commission,
      p_period_months: args.periodMonths,
      p_expires_at: args.expiresAt,
      p_actor_email: args.actorEmail,
    });

    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as Record<string, unknown>;
      const { data: q } = await admin
        .from('partners')
        .select('license_quota')
        .eq('id', args.partnerId)
        .maybeSingle();
      return { license: row, quota: (q?.license_quota as number) ?? null };
    }

    const code = error?.code ?? '';
    const msg = error?.message ?? '';

    if (code === 'P0001' && msg.includes('QUOTA_EXHAUSTED')) {
      return {
        error: 'Kuota lisensi habis. Hubungi Super Admin untuk topup.',
        status: 403,
        code: 'QUOTA_EXHAUSTED',
      };
    }
    if (code === 'P0001' && msg.includes('PARTNER_NOT_FOUND')) {
      return { error: 'Data partner tidak ditemukan.', status: 404, code: 'PARTNER_NOT_FOUND' };
    }

    // bentrok serial key -> coba lagi dengan key baru
    if (code === '23505' || msg.toLowerCase().includes('duplicate') || msg.includes('licenses_serial_key')) {
      continue;
    }

    /* 2) Fallback bila RPC tidak tersedia (schema lama) ------------------ */
    const { data: ins, error: insErr } = await admin
      .from('licenses')
      .insert({
        serial_key: serialKey,
        partner_id: args.partnerId,
        store_id: args.storeId,
        paket_type: args.paket,
        license_type: args.licenseType,
        price_idr: args.price,
        commission_idr: args.commission,
        period_months: args.periodMonths,
        expires_at: args.expiresAt,
        status: 'unused',
      })
      .select()
      .single();

    if (insErr) {
      if (insErr.code === '23505') continue;
      return {
        error: `Gagal membuat lisensi: ${insErr.message}`,
        status: 500,
        code: 'LICENSE_CREATE_FAILED',
      };
    }

    const { data: after } = await admin
      .from('partners')
      .select('license_quota')
      .eq('id', args.partnerId)
      .maybeSingle();
    const currentQuota = (after?.license_quota as number | undefined) ?? null;

    if (currentQuota === null) {
      // belum ada partner row (kemungkinan schema tanpa RPC)
      return { license: ins as unknown as Record<string, unknown>, quota: null };
    }

    // kurangi quota secara atomik: update .. where license_quota > 0
    const { data: dec, error: decErr } = await admin
      .from('partners')
      .update({ license_quota: currentQuota - 1 })
      .eq('id', args.partnerId)
      .gt('license_quota', 0)
      .select('license_quota, license_granted')
      .maybeSingle();

    if (decErr) {
      return {
        error: `Gagal mengurangi kuota: ${decErr.message}`,
        status: 500,
        code: 'QUOTA_UPDATE_FAILED',
      };
    }
    if (!dec) {
      // kuota habis saat itu juga -> rollback lisensi
      await admin.from('licenses').delete().eq('id', (ins as { id: string }).id);
      return {
        error: 'Kuota lisensi habis. Hubungi Super Admin untuk topup.',
        status: 403,
        code: 'QUOTA_EXHAUSTED',
      };
    }

    await admin
      .from('partners')
      .update({ license_granted: (dec.license_granted as number) + 1 })
      .eq('id', args.partnerId);

    return {
      license: ins as unknown as Record<string, unknown>,
      quota: dec.license_quota as number,
    };
  }

  return {
    error: 'Gagal membuat serial key unik. Coba lagi.',
    status: 500,
    code: 'SERIAL_COLLISION',
  };
}
