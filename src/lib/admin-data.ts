'use client';

/**
 * Data layer sisi browser untuk Panel Super Admin.
 *
 * Semua request memakai service-role di server, tapi WAJIB menyertakan
 * `Authorization: Bearer <access token>` — server memvalidasi sesi dan
 * memastikan role-nya `super_admin` sebelum menyentuh database.
 */

import { createClient } from '@/lib/supabase/client';
import { toNumber } from '@/lib/utils';
import type { AdminPartnerRow as AdminPartnerStats, FinanceSummary } from '@/lib/admin-types';
import type { LicenseStatus, Payout, Partner, Profile, Store } from '@/types';

/** Didefinisikan sekali di `admin-types` supaya server & browser tidak berbeda. */
export type { FinanceSummary } from '@/lib/admin-types';
export type { AdminPartnerRow as AdminPartnerStats } from '@/lib/admin-types';

/* ------------------------------------------------------------------ */
/* Tipe view-model                                                     */
/* ------------------------------------------------------------------ */

export interface AdminPartnerRow extends AdminPartnerStats {
  /** email partner diambil dari tabel profiles lewat relasi user_id */
  email: string | null;
  full_name: string | null;
}

export interface AdminLicenseRow {
  id: string;
  serial_key: string;
  partner_id: string | null;
  store_id: string | null;
  hwid_locked: string | null;
  status: LicenseStatus;
  paket_type: 'bundle_pc_app' | 'app_only';
  license_type: 'permanent' | 'subscription';
  price_idr: number;
  commission_idr: number;
  period_months: number | null;
  expires_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
  store: Pick<Store, 'id' | 'store_name' | 'owner_name' | 'no_hp' | 'alamat' | 'paket_type' | 'license_type'> | null;
  partner: Pick<Partner, 'id' | 'nama_toko' | 'no_hp' | 'commission_rate'> | null;
}


export interface ActivityLogRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* HTTP helper                                                         */
/* ------------------------------------------------------------------ */

export class AdminApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'ERROR', status = 500) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(path, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    throw new AdminApiError(
      (body.error as string) ?? `Permintaan gagal (${res.status}).`,
      (body.code as string) ?? 'ERROR',
      res.status,
    );
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({ body: JSON.stringify(data) });

/* ------------------------------------------------------------------ */
/* Partners                                                            */
/* ------------------------------------------------------------------ */

export async function fetchAdminPartners(): Promise<AdminPartnerRow[]> {
  const body = await request<{ partners: Array<Record<string, unknown>> }>('/api/admin/partners');
  return (body.partners ?? []).map((p) => ({
    ...(p as unknown as Partner),
    email: (p.profiles as { email?: string | null } | null)?.email ?? null,
    full_name: (p.profiles as { full_name?: string | null } | null)?.full_name ?? null,
    licenses_total: toNumber(p.licenses_total),
    licenses_active: toNumber(p.licenses_active),
    licenses_unused: toNumber(p.licenses_unused),
    licenses_blocked: toNumber(p.licenses_blocked),
    revenue: toNumber(p.revenue),
    commission: toNumber(p.commission),
  }));
}

export interface CreatePartnerInput {
  email: string;
  password: string;
  namaToko: string;
  noHp?: string;
  alamat?: string;
  licenseQuota?: number;
  commissionRate?: number;
  notes?: string;
}

export async function createAdminPartner(
  input: CreatePartnerInput,
): Promise<{ message: string; partner: Partner }> {
  const body = await request<{ message: string; partner: Partner }>('/api/admin/partners', {
    method: 'POST',
    ...json(input),
  });
  return body;
}

export type PartnerAction =
  | 'topup'
  | 'set_quota'
  | 'update'
  | 'suspend'
  | 'activate'
  | 'reset_granted';

export interface PartnerPatchInput {
  action: PartnerAction;
  amount?: number;
  quota?: number;
  namaToko?: string;
  noHp?: string | null;
  alamat?: string | null;
  commissionRate?: number;
  notes?: string | null;
}

export async function patchAdminPartner(
  id: string,
  input: PartnerPatchInput,
): Promise<{ message: string; partner: Partner }> {
  const body = await request<{ message: string; partner: Partner }>(`/api/admin/partners/${id}`, {
    method: 'PATCH',
    ...json(input),
  });
  return body;
}

/* ------------------------------------------------------------------ */
/* Licenses                                                            */
/* ------------------------------------------------------------------ */

export interface LicenseQuery {
  status?: 'all' | LicenseStatus;
  partnerId?: string | null;
  q?: string;
  limit?: number;
  offset?: number;
}

export async function fetchAdminLicenses(
  query: LicenseQuery = {},
): Promise<{ licenses: AdminLicenseRow[]; total: number }> {
  const params = new URLSearchParams();
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.partnerId) params.set('partnerId', query.partnerId);
  if (query.q?.trim()) params.set('q', query.q.trim());
  params.set('limit', String(query.limit ?? 200));
  params.set('offset', String(query.offset ?? 0));

  const body = await request<{ licenses: AdminLicenseRow[]; total: number }>(
    `/api/admin/licenses?${params.toString()}`,
  );
  return body;
}

export type LicenseAction = 'block' | 'unblock' | 'reset_hwid' | 'extend' | 'set_status' | 'delete';

export interface LicensePatchInput {
  licenseId: string;
  action: LicenseAction;
  status?: LicenseStatus;
  months?: number;
}

export async function patchAdminLicense(
  input: LicensePatchInput,
): Promise<{ message: string; license?: Record<string, unknown> }> {
  return request('/api/admin/licenses', { method: 'PATCH', ...json(input) });
}

/* ------------------------------------------------------------------ */
/* Finance & payouts                                                   */
/* ------------------------------------------------------------------ */

export async function fetchFinance(months = 6): Promise<FinanceSummary> {
  return request<FinanceSummary>(`/api/admin/finance?months=${months}`);
}

export async function fetchPayouts(): Promise<Payout[]> {
  const body = await request<{ payouts: Payout[] }>('/api/admin/payouts');
  return body.payouts ?? [];
}

export interface CreatePayoutInput {
  partnerId: string;
  amount: number;
  periodFrom?: string | null;
  periodTo?: string | null;
  note?: string;
  markPaid?: boolean;
}

export async function createPayout(
  input: CreatePayoutInput,
): Promise<{ message: string; payout: Payout }> {
  return request('/api/admin/payouts', { method: 'POST', ...json(input) });
}

export async function patchPayout(
  input: { payoutId: string; action: 'mark_paid' | 'mark_pending' | 'delete'; note?: string },
): Promise<{ message: string; payout?: Payout }> {
  return request('/api/admin/payouts', { method: 'PATCH', ...json(input) });
}

/* ------------------------------------------------------------------ */
/* Stores (baca langsung via RLS super_admin)                         */
/* ------------------------------------------------------------------ */

export async function fetchAllStores(): Promise<Store[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Store[];
}

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export async function fetchActivityLogs(limit = 50): Promise<ActivityLogRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ActivityLogRow[];
}

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export async function fetchAdminProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}
