import type { PaketType } from '@/types';

/**
 * ===========================================================================
 *  ATURAN TIER & KOMISI — TIDAK ADA ANGKA PERSENTASE DI BERKAS INI
 * ===========================================================================
 *  Dulu berkas ini memuat `TIER_RULES` (rate 0.05 / 0.1 / 0.2 / 0.3) dan
 *  `tierOf()`, jadi portal menghitung sendiri nama tier + persen komisi dari
 *  salinan angka di TypeScript. Begitu admin mengubah persentase di database,
 *  Home & Profile tetap menampilkan angka lama — dua sumber, dua jawaban.
 *
 *  Sekarang angka itu HANYA ada di database:
 *
 *    - Nama + persen tier dibaca lewat RPC `tier_daftar` (tabel
 *      `tier_konfigurasi`, lihat supabase/schema.sql bagian 5). Kalau RPC itu
 *      belum ada di database, portal memakai RPC lama `tier_name_of` /
 *      `tier_rate_of` — dua-duanya juga milik database, bukan kode ini.
 *    - Harga acuan komisi ada di tabel `produk` (dikelola admin portal),
 *      dibaca RPC `generate_license` dan disimpan snapshot di
 *      `licenses.harga_jual`.
 *
 *  `STRUKTUR_TIER` di bawah HANYA nama + rentang + warna untuk tata letak
 *  kotak tier di Profile. Ia TIDAK memuat persentase sama sekali; begitu RPC
 *  `tier_daftar` tersedia, struktur ini diabaikan sepenuhnya dan seluruh daftar
 *  tier (termasuk nama & rentang) datang dari database.
 */

export interface TierAturan {
  /** Nama tier, persis seperti di database. */
  nama: string;
  /** Ambang bawah jumlah lisensi terjual. */
  min: number;
  /** Batas atas, `null` = tier tertinggi tanpa batas. */
  max: number | null;
  /**
   * Persentase komisi dari database, atau `null` kalau admin belum mengisinya.
   * `null` WAJIB ditampilkan sebagai "Belum diatur admin" — bukan diganti angka
   * default.
   */
  rate: number | null;
  /** Warna bulatan mahkota di card tier. */
  color: string;
  /** Warna latar bulatan mahkota (kelas Tailwind). */
  chipBg: string;
}

/** Label paket untuk teks di UI. */
export const PAKET_LABEL: Record<PaketType, string> = {
  bundle: 'Bundle',
  app_only: 'Aplikasi',
};

export const LICENSE_TYPE_LABEL: Record<'sekali' | 'langganan', string> = {
  sekali: 'Sekali Bayar',
  langganan: 'Langganan',
};

/**
 * Warna per tier. Ini murni gaya tampilan, bukan angka komisi, jadi tetap di
 * kode. Tier yang namanya tidak ada di sini dapat warna netral.
 */
const WARNA_TIER: Record<string, { color: string; chipBg: string }> = {
  Bronze: { color: '#a16207', chipBg: 'bg-amber-100' },
  Silver: { color: '#64748b', chipBg: 'bg-gray-100' },
  Gold: { color: '#ca8a04', chipBg: 'bg-yellow-100' },
  Platinum: { color: '#0f172a', chipBg: 'bg-slate-800' },
};

const WARNA_DEFAULT = { color: '#71717a', chipBg: 'bg-zinc-100' };

/** Bentuk baris `tier_konfigurasi` / objek dari RPC tier. */
export interface BarisTier {
  nama: string;
  min: number | null;
  max: number | null;
  rate: number | null;
}

/**
 * Struktur tier HANYA untuk tata letak (nama + rentang). Tanpa persentase.
 *
 * Dipakai sebagai cadangan tampilan kalau RPC `tier_daftar` belum ada di
 * database (schema.sql belum dijalankan ulang). Persentase tiap tier TETAP
 * dibaca dari database lewat RPC `tier_rate_of`.
 */
export const STRUKTUR_TIER: BarisTier[] = [
  { nama: 'Bronze', min: 1, max: 5, rate: null },
  { nama: 'Silver', min: 6, max: 10, rate: null },
  { nama: 'Gold', min: 11, max: 29, rate: null },
  { nama: 'Platinum', min: 30, max: null, rate: null },
];

/**
 * Ubah baris dari database menjadi `TierAturan`.
 *
 * `rate` tidak pernah diisi default: kalau NULL, tetap NULL supaya tampilan
 * bisa bilang "Belum diatur admin" alih-alih mengarang persentase.
 */
export function tierDariBaris(baris: BarisTier): TierAturan {
  const warna = WARNA_TIER[baris.nama] ?? WARNA_DEFAULT;
  const rate = baris.rate === null || baris.rate === undefined ? null : Number(baris.rate);

  return {
    nama: baris.nama,
    min: Number(baris.min ?? 0),
    max: baris.max === null || baris.max === undefined ? null : Number(baris.max),
    rate: rate !== null && Number.isFinite(rate) ? rate : null,
    color: warna.color,
    chipBg: warna.chipBg,
  };
}

/** Urutkan aturan tier naik menurut ambang bawah. */
export function urutkanTier(daftar: TierAturan[]): TierAturan[] {
  return [...daftar].sort((a, b) => a.min - b.min);
}

/**
 * Label rentang tier, contoh: "1 - 5 Lisensi" / "30+ Lisensi".
 */
export function tierRangeLabel(tier: TierAturan): string {
  return tier.max === null ? `${tier.min}+ Lisensi` : `${tier.min} - ${tier.max} Lisensi`;
}

/**
 * Label rentang ringkas untuk card tier, contoh: "1-5 lisensi" / "30+ lisensi".
 * Tanpa spasi di sekitar tanda hubung supaya muat di card 4 kolom tanpa wrap.
 */
export function tierRangePendek(tier: TierAturan): string {
  return tier.max === null ? `${tier.min}+ lisensi` : `${tier.min}-${tier.max} lisensi`;
}

/**
 * Persentase tier untuk teks.
 *
 * Kalau admin belum mengisi rate, teksnya "Belum diatur admin" — bukan 0 dan
 * bukan angka default, supaya toko tahu datanya belum lengkap.
 */
export function tierRateLabel(tier: TierAturan): string {
  return tier.rate === null ? 'Belum diatur admin' : `${tier.rate}%`;
}

/** Tanggal berakhir langganan (12 bulan). */
export function hitungMasaLangganan(licenseType: 'sekali' | 'langganan'): string | null {
  if (licenseType !== 'langganan') return null;
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
