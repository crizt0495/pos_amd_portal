import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireSuperAdmin } from '@/lib/supabase/guard';
import type { PayoutRow } from '@/lib/admin-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  partnerId: z.string().uuid(),
  amount: z.number().min(0).max(1_000_000_000),
  periodFrom: z.string().max(30).nullable().optional(),
  periodTo: z.string().max(30).nullable().optional(),
  note: z.string().max(300).optional().default(''),
  markPaid: z.boolean().optional().default(false),
});

const PatchSchema = z.object({
  payoutId: z.string().uuid(),
  action: z.enum(['mark_paid', 'mark_pending', 'delete']),
  note: z.string().max(300).optional(),
});

function fail(error: string, status = 400, code = 'BAD_REQUEST') {
  return NextResponse.json({ error, code }, { status });
}

/** GET /api/admin/payouts */
export async function GET(req: Request) {
  const auth = await requireSuperAdmin(req);
  if ('error' in auth) return fail(auth.error, auth.status, 'FORBIDDEN');
  const { admin } = auth;

  const { data, error } = await admin.from('payouts').select('*').order('created_at', { ascending: false });
  if (error) return fail(error.message, 500, 'QUERY_FAILED');
  return NextResponse.json({ ok: true, payouts: (data ?? []) as unknown as PayoutRow[] });
}

/** POST /api/admin/payouts — catat transfer komisi ke partner */
export async function POST(req: Request) {
  const auth = await requireSuperAdmin(req);
  if ('error' in auth) return fail(auth.error, auth.status, 'FORBIDDEN');
  const { admin, session } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('Body JSON tidak valid.', 400);
  }
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 422, 'VALIDATION');
  const input = parsed.data;

  const { data, error } = await admin
    .from('payouts')
    .insert({
      partner_id: input.partnerId,
      amount: input.amount,
      period_from: input.periodFrom || null,
      period_to: input.periodTo || null,
      note: input.note || null,
      status: input.markPaid ? 'paid' : 'pending',
      paid_at: input.markPaid ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return fail(error.message, 500, 'CREATE_FAILED');

  await admin.from('activity_logs').insert({
    actor_id: session.userId,
    actor_email: session.email,
    action: 'payout.create',
    entity: 'payout',
    entity_id: (data as { id: string }).id,
    meta: { partner: input.partnerId, amount: input.amount, markPaid: input.markPaid },
  });

  return NextResponse.json({ ok: true, message: 'Payout dicatat.', payout: data }, { status: 201 });
}

/** PATCH /api/admin/payouts */
export async function PATCH(req: Request) {
  const auth = await requireSuperAdmin(req);
  if ('error' in auth) return fail(auth.error, auth.status, 'FORBIDDEN');
  const { admin, session } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('Body JSON tidak valid.', 400);
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 422, 'VALIDATION');
  const input = parsed.data;

  if (input.action === 'delete') {
    const { error } = await admin.from('payouts').delete().eq('id', input.payoutId);
    if (error) return fail(error.message, 500, 'DELETE_FAILED');
    return NextResponse.json({ ok: true, message: 'Payout dihapus.' });
  }

  const patch =
    input.action === 'mark_paid'
      ? { status: 'paid', paid_at: new Date().toISOString(), ...(input.note ? { note: input.note } : {}) }
      : { status: 'pending', paid_at: null };

  const { data, error } = await admin
    .from('payouts')
    .update(patch)
    .eq('id', input.payoutId)
    .select()
    .single();
  if (error) return fail(error.message, 500, 'UPDATE_FAILED');

  await admin.from('activity_logs').insert({
    actor_id: session.userId,
    actor_email: session.email,
    action: `payout.${input.action}`,
    entity: 'payout',
    entity_id: input.payoutId,
    meta: patch,
  });

  return NextResponse.json({ ok: true, message: 'Payout diperbarui.', payout: data });
}
