import { NextResponse } from 'next/server';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { bearerFromRequest, getSessionInfo } from '@/lib/supabase/session';
import { toNumber } from '@/lib/utils';
import type { FinanceSummary, LicenseRow, PayoutRow } from '@/lib/admin-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: string, status = 400, code = 'BAD_REQUEST') {
  return NextResponse.json({ error, code }, { status });
}


/** GET /api/admin/finance?months=6 — laporan keuangan & komisi */
export async function GET(req: Request) {
  if (!hasServiceRole()) return fail('Server belum dikonfigurasi.', 500, 'NO_SERVICE_ROLE');
  const session = await getSessionInfo(bearerFromRequest(req));
  if (!session) return fail('Sesi tidak valid.', 401, 'UNAUTHORIZED');
  if (session.role !== 'super_admin') return fail('Akses khusus Super Admin.', 403, 'FORBIDDEN');

  const url = new URL(req.url);
  const months = Math.min(Math.max(parseInt(url.searchParams.get('months') ?? '6', 10) || 6, 1), 36);

  const admin = createAdminClient();

  const { data: licRaw, error: licErr } = await admin
    .from('licenses')
    .select('id, partner_id, status, paket_type, price_idr, commission_idr, created_at')
    .order('created_at', { ascending: false });
  if (licErr) return fail(licErr.message, 500, 'QUERY_FAILED');

  const licenses = (licRaw ?? []) as unknown as Array<
    Pick<LicenseRow, 'id' | 'partner_id' | 'status' | 'paket_type' | 'price_idr' | 'commission_idr' | 'created_at'>
  >;

  const { data: partnersRaw } = await admin
    .from('partners')
    .select('id, nama_toko, license_quota, status, commission_rate')
    .order('nama_toko');
  const partners = (partnersRaw ?? []) as unknown as Array<{
    id: string;
    nama_toko: string;
    license_quota: number;
    status: string;
    commission_rate: number;
  }>;

  const { data: payoutsRaw } = await admin
    .from('payouts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  const payouts = (payoutsRaw ?? []) as unknown as PayoutRow[];

  /* --- agregasi ----------------------------------------------------- */
  const totals = {
    licenses: licenses.length,
    active: licenses.filter((l) => l.status === 'active').length,
    unused: licenses.filter((l) => l.status === 'unused').length,
    blocked: licenses.filter((l) => l.status === 'blocked').length,
    expired: licenses.filter((l) => l.status === 'expired').length,
    revenueTotal: 0,
    revenueBundle: 0,
    revenueAppOnly: 0,
    commissionTotal: 0,
    commissionBundle: 0,
    commissionAppOnly: 0,
    ourShare: 0,
    paidOut: 0,
    pendingPayout: 0,
  };

  const perPartner = new Map<
    string,
    { id: string; nama_toko: string; licenses: number; active: number; commission: number; paidOut: number; pending: number; quota: number }
  >();

  for (const p of partners) {
    perPartner.set(p.id, {
      id: p.id,
      nama_toko: p.nama_toko,
      licenses: 0,
      active: 0,
      commission: 0,
      paidOut: 0,
      pending: 0,
      quota: p.license_quota ?? 0,
    });
  }

  for (const l of licenses) {
    const price = toNumber(l.price_idr);
    const comm = toNumber(l.commission_idr);
    const isBundle = l.paket_type === 'bundle_pc_app';

    totals.revenueTotal += price;
    totals.commissionTotal += comm;
    totals.ourShare += price - comm;
    if (isBundle) {
      totals.revenueBundle += price;
      totals.commissionBundle += comm;
    } else {
      totals.revenueAppOnly += price;
      totals.commissionAppOnly += comm;
    }

    if (l.partner_id && perPartner.has(l.partner_id)) {
      const row = perPartner.get(l.partner_id)!;
      row.licenses += 1;
      if (l.status === 'active') row.active += 1;
      row.commission += comm;
    }
  }

  for (const po of payouts) {
    const row = perPartner.get(po.partner_id);
    if (!row) continue;
    if (po.status === 'paid') {
      row.paidOut += toNumber(po.amount);
      totals.paidOut += toNumber(po.amount);
    } else {
      row.pending += toNumber(po.amount);
      totals.pendingPayout += toNumber(po.amount);
    }
  }

  /* --- revenue per bulan -------------------------------------------- */
  const revenueByMonth: FinanceSummary['revenueByMonth'] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    revenueByMonth.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      revenue: 0,
      commission: 0,
      count: 0,
    });
  }
  const monthIndex = new Map(revenueByMonth.map((m, i) => [m.month, i]));
  for (const l of licenses) {
    if (!l.created_at) continue;
    const key = l.created_at.slice(0, 7);
    const idx = monthIndex.get(key);
    if (idx === undefined) continue;
    revenueByMonth[idx]!.revenue += toNumber(l.price_idr);
    revenueByMonth[idx]!.commission += toNumber(l.commission_idr);
    revenueByMonth[idx]!.count += 1;
  }

  const summary: FinanceSummary = {
    totals,
    byPartner: [...perPartner.values()].sort((a, b) => b.commission - a.commission),
    payouts,
    revenueByMonth,
  };

  return NextResponse.json({ ok: true, ...summary });
}
