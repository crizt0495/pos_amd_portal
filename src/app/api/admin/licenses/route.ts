import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { bearerFromRequest, getSessionInfo } from '@/lib/supabase/session';
import type { LicenseRow, Store } from '@/lib/admin-types';
import type { LicenseStatus } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  licenseId: z.string().uuid(),
  action: z.enum(['block', 'unblock', 'reset_hwid', 'extend', 'set_status', 'delete']),
  status: z.enum(['unused', 'active', 'blocked', 'expired', 'revoked']).optional(),
  months: z.number().int().min(1).max(120).optional(),
});

function fail(error: string, status = 400, code = 'BAD_REQUEST') {
  return NextResponse.json({ error, code }, { status });
}

/** GET /api/admin/licenses?status=&partnerId=&q=&limit=&offset= */
export async function GET(req: Request) {
  if (!hasServiceRole()) return fail('Server belum dikonfigurasi.', 500, 'NO_SERVICE_ROLE');
  const session = await getSessionInfo(bearerFromRequest(req));
  if (!session) return fail('Sesi tidak valid.', 401, 'UNAUTHORIZED');
  if (session.role !== 'super_admin') return fail('Akses khusus Super Admin.', 403, 'FORBIDDEN');

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const partnerId = url.searchParams.get('partnerId');
  const q = url.searchParams.get('q');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10) || 100, 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

  const admin = createAdminClient();

  // 1. Ambil lisensi (dengan filter)
  let query = admin
    .from('licenses')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== 'all') query = query.eq('status', status as LicenseStatus);
  if (partnerId) query = query.eq('partner_id', partnerId);
  if (q) {
    const clean = q.replace(/[%_,]/g, ' ').trim();
    if (clean) query = query.or(`serial_key.ilike.%${clean}%,hwid_locked.ilike.%${clean}%`);
  }

  const { data, error, count } = await query;
  if (error) return fail(error.message, 500, 'QUERY_FAILED');

  const rows = (data ?? []) as unknown as LicenseRow[];

  // 2. Ambil store & partner terkait dalam 2 query (lebih tahan schema)
  const storeIds = [...new Set(rows.map((r) => r.store_id).filter((v): v is string => Boolean(v)))];
  const partnerIds = [...new Set(rows.map((r) => r.partner_id).filter((v): v is string => Boolean(v)))];

  const storeMap: Record<string, Store> = {};
  if (storeIds.length) {
    const { data: stores } = await admin
      .from('stores')
      .select('id, store_name, owner_name, no_hp, alamat, paket_type, license_type')
      .in('id', storeIds);
    for (const s of (stores ?? []) as unknown as Store[]) storeMap[s.id] = s;
  }
  const partnerMap: Record<string, { id: string; nama_toko: string; no_hp: string | null; commission_rate: number }> = {};
  if (partnerIds.length) {
    const { data: partners } = await admin
      .from('partners')
      .select('id, nama_toko, no_hp, commission_rate')
      .in('id', partnerIds);
    for (const p of (partners ?? []) as unknown as { id: string; nama_toko: string; no_hp: string | null; commission_rate: number }[]) {
      partnerMap[p.id] = p;
    }
  }

  const licenses = rows.map((r) => ({
    ...r,
    store: r.store_id ? storeMap[r.store_id] ?? null : null,
    partner: r.partner_id ? partnerMap[r.partner_id] ?? null : null,
  }));

  return NextResponse.json({ ok: true, licenses, total: count ?? 0 });
}

/** PATCH /api/admin/licenses — blokir / buka blokir / reset HWID / perpanjang */
export async function PATCH(req: Request) {
  if (!hasServiceRole()) return fail('Server belum dikonfigurasi.', 500, 'NO_SERVICE_ROLE');
  const session = await getSessionInfo(bearerFromRequest(req));
  if (!session) return fail('Sesi tidak valid.', 401, 'UNAUTHORIZED');
  if (session.role !== 'super_admin') return fail('Akses khusus Super Admin.', 403, 'FORBIDDEN');

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('Body JSON tidak valid.', 400);
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 422, 'VALIDATION');
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: license, error: readErr } = await admin
    .from('licenses')
    .select('*')
    .eq('id', input.licenseId)
    .maybeSingle();
  if (readErr) return fail(readErr.message, 500, 'QUERY_FAILED');
  if (!license) return fail('Lisensi tidak ditemukan.', 404, 'NOT_FOUND');

  let message = '';
  let patch: Record<string, unknown> = {};

  switch (input.action) {
    case 'block':
      patch = { status: 'blocked' };
      message = `Lisensi ${license.serial_key} diblokir.`;
      break;
    case 'unblock':
      patch = { status: license.hwid_locked ? 'active' : 'unused' };
      message = `Lisensi ${license.serial_key} dibuka.`;
      break;
    case 'reset_hwid':
      patch = { hwid_locked: null, status: 'unused', activated_at: null };
      message = `HWID lisensi ${license.serial_key} direset — bisa diaktifkan ulang.`;
      break;
    case 'set_status':
      if (!input.status) return fail('Parameter status wajib diisi.', 422, 'VALIDATION');
      patch = { status: input.status };
      message = `Status lisensi ${license.serial_key} diubah ke ${input.status}.`;
      break;
    case 'extend': {
      const months = input.months ?? 12;
      const base = license.expires_at && new Date(license.expires_at).getTime() > Date.now()
        ? new Date(license.expires_at)
        : new Date();
      const next = new Date(base);
      next.setMonth(next.getMonth() + months);
      patch = { expires_at: next.toISOString(), status: license.status === 'expired' ? 'active' : license.status };
      message = `Lisensi ${license.serial_key} diperpanjang ${months} bulan (sampai ${next.toLocaleDateString('id-ID')}).`;
      break;
    }
    case 'delete': {
      const { error: delErr } = await admin.from('licenses').delete().eq('id', input.licenseId);
      if (delErr) return fail(delErr.message, 500, 'DELETE_FAILED');
      await admin.from('activity_logs').insert({
        actor_id: session.userId,
        actor_email: session.email,
        action: 'license.delete',
        entity: 'license',
        entity_id: input.licenseId,
        meta: { serial_key: license.serial_key },
      });
      return NextResponse.json({ ok: true, message: `Lisensi ${license.serial_key} dihapus.` });
    }
    default:
      return fail('Action tidak dikenal.', 422, 'VALIDATION');
  }

  const { data: updated, error: updErr } = await admin
    .from('licenses')
    .update(patch)
    .eq('id', input.licenseId)
    .select()
    .single();
  if (updErr) return fail(updErr.message, 500, 'UPDATE_FAILED');

  //HWID history dibersihkan saat reset
  if (input.action === 'reset_hwid') {
    await admin.from('hwid_history').update({ is_current: false }).eq('license_id', input.licenseId);
  }

  await admin.from('activity_logs').insert({
    actor_id: session.userId,
    actor_email: session.email,
    action: `license.${input.action}`,
    entity: 'license',
    entity_id: input.licenseId,
    meta: { serial_key: license.serial_key, patch },
  });

  return NextResponse.json({ ok: true, message, license: updated });
}
