'use client';

import { createClient } from '@/lib/supabase/client';
import { toNumber } from '@/lib/utils';
import type { LicenseStatus, LicenseWithStore, License, Payout, Store } from '@/types';

/* ------------------------------------------------------------------ */
/* Reads — RLS membatasi partner hanya ke datanya sendiri               */
/* ------------------------------------------------------------------ */

export async function fetchLicenses(partnerId?: string | null): Promise<LicenseWithStore[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('licenses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as License[];
  if (partnerId) {
    return rows
      .filter((l) => l.partner_id === partnerId)
      .map((l) => ({ ...l }) as LicenseWithStore);
  }
  return rows as LicenseWithStore[];
}

export async function fetchStores(partnerId: string): Promise<Store[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Store[];
}

/** Riwayat transfer komisi ke partner ini (RLS: partner hanya lihat payout-nya). */
export async function fetchPayouts(partnerId?: string | null): Promise<Payout[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('payouts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Payout[];
  if (partnerId) return rows.filter((p) => p.partner_id === partnerId);
  return rows;
}

export async function fetchHwidHistory(licenseId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('hwid_history')
    .select('*')
    .eq('license_id', licenseId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Commission summary                                                  */
/* ------------------------------------------------------------------ */

export interface CommissionSummary {
  total: number;
  byPaket: {
    bundle_pc_app: { count: number; revenue: number; commission: number; ourShare: number };
    app_only: { count: number; revenue: number; commission: number; ourShare: number };
  };
  byMonth: Array<{ month: string; label: string; count: number; revenue: number; commission: number }>;
  byStatus: Record<LicenseStatus, number>;
  pendingPayout: number;
  paidPayout: number;
}

export function summarizeCommissions(
  licenses: LicenseWithStore[],
  payouts: Array<{ amount: number; status: 'pending' | 'paid' }> = [],
): CommissionSummary {
  const summary: CommissionSummary = {
    total: 0,
    byPaket: {
      bundle_pc_app: { count: 0, revenue: 0, commission: 0, ourShare: 0 },
      app_only: { count: 0, revenue: 0, commission: 0, ourShare: 0 },
    },
    byMonth: [],
    byStatus: { unused: 0, active: 0, blocked: 0, expired: 0, revoked: 0 },
    pendingPayout: 0,
    paidPayout: 0,
  };

  const monthMap = new Map<string, { count: number; revenue: number; commission: number }>();

  for (const l of licenses) {
    const price = toNumber(l.price_idr);
    const commission = toNumber(l.commission_idr);

    summary.total += commission;
    summary.byStatus[l.status] = (summary.byStatus[l.status] ?? 0) + 1;

    const bucket = summary.byPaket[l.paket_type];
    if (bucket) {
      bucket.count += 1;
      bucket.revenue += price;
      bucket.commission += commission;
      bucket.ourShare += price - commission;
    }

    if (l.created_at) {
      const key = l.created_at.slice(0, 7);
      const row = monthMap.get(key) ?? { count: 0, revenue: 0, commission: 0 };
      row.count += 1;
      row.revenue += price;
      row.commission += commission;
      monthMap.set(key, row);
    }
  }

  summary.byMonth = [...monthMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12)
    .map(([month, v]) => ({
      month,
      label: new Date(`${month}-01`).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
      ...v,
    }))
    .reverse();

  for (const p of payouts) {
    if (p.status === 'paid') summary.paidPayout += toNumber(p.amount);
    else summary.pendingPayout += toNumber(p.amount);
  }

  return summary;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export interface CreateLicensePayload {
  namaTokoPembeli: string;
  namaPembeli: string;
  noHp: string;
  alamat: string;
  paket: 'bundle_pc_app' | 'app_only';
  licenseType: 'permanent' | 'subscription';
  periodMonths?: number;
  deviceNote?: string;
  partnerId?: string;
}

export interface CreateLicenseResult {
  ok: boolean;
  message: string;
  license?: License;
  store?: Store;
  quota?: number | null;
  code?: string;
}

export async function createLicenseForPartner(
  payload: CreateLicensePayload,
): Promise<CreateLicenseResult> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;

  const res = await fetch('/api/partner/licenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      ok: false,
      message: body.error ?? 'Gagal membuat lisensi.',
      code: body.code,
    };
  }

  return {
    ok: true,
    message: body.message ?? 'Lisensi berhasil dibuat.',
    license: body.license as License,
    store: body.store as Store,
    quota: body.quota ?? null,
  };
}
