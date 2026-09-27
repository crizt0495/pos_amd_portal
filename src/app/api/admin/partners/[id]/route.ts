import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { bearerFromRequest, getSessionInfo } from '@/lib/supabase/session';
import { TOPUP_AMOUNT } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchSchema = z.object({
  action: z.enum(['topup', 'set_quota', 'update', 'suspend', 'activate', 'reset_granted']),
  amount: z.number().int().min(0).max(10_000).optional(),
  quota: z.number().int().min(0).max(10_000).optional(),
  namaToko: z.string().min(2).max(120).optional(),
  noHp: z.string().max(30).nullable().optional(),
  alamat: z.string().max(300).nullable().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).nullable().optional(),
});

function fail(error: string, status = 400, code = 'BAD_REQUEST') {
  return NextResponse.json({ error, code }, { status });
}

/**
 * PATCH /api/admin/partners/[id]
 *  action=topup        -> +N lisensi (default +5)
 *  action=set_quota    -> set absolut
 *  action=update       -> ubah data toko
 *  action=suspend      -> nonaktifkan partner
 *  action=activate     -> aktifkan partner
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  if (!hasServiceRole()) return fail('Server belum dikonfigurasi.', 500, 'NO_SERVICE_ROLE');

  const session = await getSessionInfo(bearerFromRequest(req));
  if (!session) return fail('Sesi tidak valid.', 401, 'UNAUTHORIZED');
  if (session.role !== 'super_admin') return fail('Akses khusus Super Admin.', 403, 'FORBIDDEN');

  const id = ctx.params?.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return fail('ID partner tidak valid.', 422, 'VALIDATION');

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

  const { data: partner, error: readErr } = await admin
    .from('partners')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return fail(readErr.message, 500, 'QUERY_FAILED');
  if (!partner) return fail('Partner tidak ditemukan.', 404, 'NOT_FOUND');

  const currentQuota = partner.license_quota as number;
  const currentGranted = partner.license_granted as number;
  let patch: Record<string, unknown> = {};
  let message = '';

  switch (input.action) {
    case 'topup': {
      const amount = input.amount ?? TOPUP_AMOUNT;
      patch = {
        license_quota: currentQuota + amount,
        license_granted: currentGranted + amount,
      };
      message = `Topup ${amount} lisensi untuk ${partner.nama_toko}.`;
      break;
    }
    case 'set_quota': {
      if (input.quota === undefined) return fail('Parameter quota wajib diisi.', 422, 'VALIDATION');
      const delta = input.quota - currentQuota;
      patch = {
        license_quota: input.quota,
        license_granted: Math.max(0, currentGranted + delta),
      };
      message = `Kuota ${partner.nama_toko} diset ke ${input.quota}.`;
      break;
    }
    case 'reset_granted': {
      patch = { license_granted: input.amount ?? 0 };
      message = `Counter lisensi-terjual direset.`;
      break;
    }
    case 'suspend': {
      patch = { status: 'suspended' };
      message = `Partner ${partner.nama_toko} disuspend.`;
      break;
    }
    case 'activate': {
      patch = { status: 'active' };
      message = `Partner ${partner.nama_toko} diaktifkan.`;
      break;
    }
    case 'update': {
      if (input.namaToko !== undefined) patch.nama_toko = input.namaToko;
      if (input.noHp !== undefined) patch.no_hp = input.noHp;
      if (input.alamat !== undefined) patch.alamat = input.alamat;
      if (input.commissionRate !== undefined) patch.commission_rate = input.commissionRate;
      if (input.notes !== undefined) patch.notes = input.notes;
      message = `Data ${partner.nama_toko} diperbarui.`;
      if (!Object.keys(patch).length) return fail('Tidak ada field yang diubah.', 422, 'NO_CHANGES');
      break;
    }
    default:
      return fail('Action tidak dikenal.', 422, 'VALIDATION');
  }

  const { data: updated, error: updErr } = await admin
    .from('partners')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (updErr) return fail(updErr.message, 500, 'UPDATE_FAILED');

  await admin.from('activity_logs').insert({
    actor_id: session.userId,
    actor_email: session.email,
    action: `partner.${input.action}`,
    entity: 'partner',
    entity_id: id,
    meta: patch,
  });

  return NextResponse.json({ ok: true, message, partner: updated });
}
