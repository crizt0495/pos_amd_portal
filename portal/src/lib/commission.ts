import type { PaketType, TierName } from '@/types';

/**
 * ===========================================================================
 *  ATURAN PENGHARGAAN & KOMISI TOKO
 * ===========================================================================
 *  Bronze   : 1 - 5   lisensi terjual  -> komisi 5%
 *  Silver   : 6 - 10  lisensi terjual  -> komisi 10%
 *  Gold     : 11 - 30 lisensi terjual  -> komisi 20%
 *  Platinum : 30+     lisensi terjual  -> komisi 30%
 *
 *  `komisi` pada tabel `licenses` = nilai final yang tercatat saat key dibuat,
 *  jadi riwayat komisi tidak berubah retroactive saat naik tier.
 */

export interface TierRule {
  name: TierName;
  min: number;
  max: number | null;
  rate: number;
  color: string;
  /** Warna latar bulatan mahkota di card tier (kelas Tailwind). */
  chipBg: string;
}

/** Nilai dasar komisi per paket SEBELUM dikali tier rate (IDR). */
export const BASE_COMMISSION: Record<PaketType, number> = {
  bundle: 100_000,
  app_only: 50_000,
};

/** Harga jual paket ke pembeli akhir (IDR) — ditampilkan di form aktivasi. */
export const PAKET_PRICE: Record<PaketType, number> = {
  bundle: 3_500_000,
  app_only: 2_500_000,
};

export const PAKET_LABEL: Record<PaketType, string> = {
  bundle: 'Bundle',
  app_only: 'Aplikasi',
};

export const PAKET_LABEL_PANJANG: Record<PaketType, string> = {
  bundle: 'Bundle PC + Aplikasi',
  app_only: 'Aplikasi Saja',
};

export const LICENSE_TYPE_LABEL: Record<'sekali' | 'langganan', string> = {
  sekali: 'Sekali Bayar',
  langganan: 'Langganan',
};

export const TIER_RULES: TierRule[] = [
  { name: 'Bronze', min: 1, max: 5, rate: 0.05, color: '#a16207', chipBg: 'bg-amber-100' },
  { name: 'Silver', min: 6, max: 10, rate: 0.1, color: '#64748b', chipBg: 'bg-gray-100' },
  { name: 'Gold', min: 11, max: 30, rate: 0.2, color: '#ca8a04', chipBg: 'bg-yellow-100' },
  { name: 'Platinum', min: 30, max: null, rate: 0.3, color: '#0f172a', chipBg: 'bg-slate-200' },
];

/** Tier toko berdasarkan total lisensi yang sudah dibuat. */
export function tierOf(totalTerjual: number): TierRule {
  const n = Math.max(0, totalTerjual || 0);
  if (n >= 30) return TIER_RULES[3]!;
  if (n >= 11) return TIER_RULES[2]!;
  if (n >= 6) return TIER_RULES[1]!;
  return TIER_RULES[0]!;
}

/** Label rentang tier, contoh: "1 - 5 Lisensi" / "30+ Lisensi". */
export function tierRangeLabel(tier: TierRule): string {
  return tier.max === null ? `${tier.min}+ Lisensi` : `${tier.min} - ${tier.max} Lisensi`;
}

/**
 * Label rentang ringkas untuk card tier, contoh: "1-5 lisensi" / "30+ lisensi".
 * Tanpa spasi Around tanda hubung supaya muat di card 4 kolom tanpa wrap.
 */
export function tierRangePendek(tier: TierRule): string {
  return tier.max === null ? `${tier.min}+ lisensi` : `${tier.min}-${tier.max} lisensi`;
}

/** Nominal komisi final untuk 1 lisensi. */
export function hitungKomisi(paket: PaketType, totalTerjual: number): number {
  return Math.round(BASE_COMMISSION[paket] * tierOf(totalTerjual).rate);
}

/** Tanggal berakhir langganan (12 bulan). */
export function hitungMasaLangganan(licenseType: 'sekali' | 'langganan'): string | null {
  if (licenseType !== 'langganan') return null;
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
