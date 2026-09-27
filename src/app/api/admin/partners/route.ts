import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireSuperAdmin } from '@/lib/supabase/guard';
import { env } from '@/lib/env';
import type { AdminPartnerRow as PartnerRow } from '@/lib/admin-types';
import type { Partner } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreatePartnerSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter').max(72),
  namaToko: z.string().min(2, 'Nama toko wajib diisi').max(120),
  noHp: z.string().max(30).optional().default(''),
  alamat: z.string().max(300).optional().default(''),
  licenseQuota: z.number().int().min(0).max(10_000).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional().default(''),
});


function fail(error: string, status = 400, code = 'BAD_REQUEST', details?: unknown) {
  return NextResponse.json({ error, code, details }, { status });
}

/** GET /api/admin/partners — daftar partner + statistik lisensi */
export async function GET(req: Request) {
  const auth = await requireSuperAdmin(req);
  if ('error' in auth) return fail(auth.error, auth.status, 'FORBIDDEN');
  const { admin } = auth;

  const { data: partners, error } = await admin
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return fail(error.message, 500, 'QUERY_FAILED');

  const ids = (partners ?? []).map((p) => p.id);
  type Stat = Pick<
    PartnerRow,
    'licenses_total' | 'licenses_active' | 'licenses_unused' | 'licenses_blocked' | 'revenue' | 'commission'
  >;
  const emptyStat = (): Stat => ({
    licenses_total: 0,
    licenses_active: 0,
    licenses_unused: 0,
    licenses_blocked: 0,
    revenue: 0,
    commission: 0,
  });
  const licenseStats: Record<string, Stat> = {};
  if (ids.length) {
    const { data: lic } = await admin
      .from('licenses')
      .select('partner_id, status, price_idr, commission_idr')
      .in('partner_id', ids);
    for (const l of lic ?? []) {
      const key = l.partner_id as string;
      const s = (licenseStats[key] ??= emptyStat());
      s.licenses_total += 1;
      if (l.status === 'active') s.licenses_active += 1;
      if (l.status === 'unused') s.licenses_unused += 1;
      if (l.status === 'blocked') s.licenses_blocked += 1;
      s.revenue += Number(l.price_idr ?? 0);
      s.commission += Number(l.commission_idr ?? 0);
    }
  }

  const userIds = (partners ?? []).map((p) => p.user_id).filter((v): v is string => Boolean(v));
  let profiles: Record<string, { email: string | null; full_name: string | null }> = {};
  if (userIds.length) {
    const { data: pr } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds);
    for (const p of pr ?? []) {
      profiles[p.id] = { email: p.email, full_name: p.full_name };
    }
  }

  const rows: PartnerRow[] = (partners ?? []).map((p) => ({
    ...(p as unknown as Partner),
    profiles: p.user_id ? profiles[p.user_id] ?? null : null,
    ...(licenseStats[p.id] ?? emptyStat()),
  }));

  return NextResponse.json({ ok: true, partners: rows });
}

/** POST /api/admin/partners — buat akun partner baru (Supabase Auth + partners) */
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
  const parsed = CreatePartnerSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 422, 'VALIDATION', parsed.error.flatten());
  }
  const input = parsed.data;

  const email = input.email.trim().toLowerCase();

  // 1) cek email sudah terdaftar
  const { data: existingList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = (existingList?.users ?? []).find(
    (u) => (u.email ?? '').toLowerCase() === email,
  );

  let userId: string;

  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { role: 'partner', full_name: input.namaToko },
    });
    if (createErr || !created?.user) {
      return fail(`Gagal membuat akun: ${createErr?.message ?? 'tidak diketahui'}`, 500, 'AUTH_CREATE_FAILED');
    }
    userId = created.user.id;
  }

  // 2) pastikan profile ada & role = partner
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, role: 'partner', email, full_name: input.namaToko }, { onConflict: 'id' });
  if (profileErr) return fail(`Gagal menyimpan profile: ${profileErr.message}`, 500, 'PROFILE_FAILED');

  // 3) upsert baris partner
  const quota = input.licenseQuota ?? env.defaultQuota;
  const { data: partner, error: partnerErr } = await admin
    .from('partners')
    .upsert(
      {
        user_id: userId,
        nama_toko: input.namaToko,
        no_hp: input.noHp || null,
        alamat: input.alamat || null,
        license_quota: quota,
        license_granted: quota,
        commission_rate: input.commissionRate ?? 10,
        status: 'active',
        notes: input.notes || null,
      },
      { onConflict: 'user_id' },
    )
    .select()
    .single();

  if (partnerErr) {
    return fail(`Gagal menyimpan partner: ${partnerErr.message}`, 500, 'PARTNER_FAILED');
  }

  await admin.from('activity_logs').insert({
    actor_id: session.userId,
    actor_email: session.email,
    action: 'partner.create',
    entity: 'partner',
    entity_id: (partner as { id: string }).id,
    meta: { nama_toko: input.namaToko, quota },
  });

  return NextResponse.json(
    { ok: true, message: `Partner ${input.namaToko} dibuat.`, partner },
    { status: 201 },
  );
}
