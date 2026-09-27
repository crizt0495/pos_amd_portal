/**
 * Tipe baris database mentah (nilai numerik dari Supabase datang sebagai
 * `number` bila kolom numeric, tapi bisa `string` bila dikonversi). Dipakai di
 * sisi server untuk pemetaan yang aman.
 */
import type { LicenseStatus, LicenseType, PaketType, PaymentMethod, DiscountType, TxStatus } from '@/types';

export interface LicenseRow {
  id: string;
  serial_key: string;
  partner_id: string | null;
  store_id: string | null;
  hwid_locked: string | null;
  status: LicenseStatus;
  paket_type: PaketType;
  license_type: LicenseType;
  price_idr: number;
  commission_idr: number;
  period_months: number | null;
  expires_at: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  partner_id: string | null;
  user_id: string | null;
  store_name: string;
  owner_name: string;
  no_hp: string | null;
  alamat: string | null;
  paket_type: PaketType;
  license_type: LicenseType;
  device_note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerRow {
  id: string;
  user_id: string | null;
  nama_toko: string;
  alamat: string | null;
  no_hp: string | null;
  license_quota: number;
  license_granted: number;
  commission_rate: number;
  status: 'active' | 'suspended';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutRow {
  id: string;
  partner_id: string;
  amount: number;
  period_from: string | null;
  period_to: string | null;
  status: 'pending' | 'paid';
  note: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  store_id: string;
  invoice_no: string;
  subtotal: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_amount: number;
  total: number;
  total_cost: number;
  paid: number;
  change_due: number;
  payment_method: PaymentMethod;
  note: string | null;
  cashier_name: string | null;
  device_id: string | null;
  status: TxStatus;
  created_at: string;
  synced_at: string | null;
}

/* ------------------------------------------------------------------ */
/* View-model Panel Super Admin                                         */
/* ------------------------------------------------------------------ */

export interface AdminPartnerRow {
  id: string;
  user_id: string | null;
  nama_toko: string;
  alamat: string | null;
  no_hp: string | null;
  license_quota: number;
  license_granted: number;
  commission_rate: number;
  status: 'active' | 'suspended';
  notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { email: string | null; full_name: string | null } | null;
  licenses_active: number;
  licenses_total: number;
  licenses_unused: number;
  licenses_blocked: number;
  revenue: number;
  commission: number;
}

export interface FinanceTotals {
  licenses: number;
  active: number;
  unused: number;
  blocked: number;
  expired: number;
  revenueTotal: number;
  revenueBundle: number;
  revenueAppOnly: number;
  commissionTotal: number;
  commissionBundle: number;
  commissionAppOnly: number;
  ourShare: number;
  paidOut: number;
  pendingPayout: number;
}

export interface FinancePartnerSummary {
  id: string;
  nama_toko: string;
  licenses: number;
  active: number;
  commission: number;
  paidOut: number;
  pending: number;
  quota: number;
}

export interface RevenueMonth {
  month: string;
  revenue: number;
  commission: number;
  count: number;
}

export interface FinanceSummary {
  totals: FinanceTotals;
  byPartner: FinancePartnerSummary[];
  payouts: PayoutRow[];
  revenueByMonth: RevenueMonth[];
}
