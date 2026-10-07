/**
 * Domain types untuk KasirPro Portal.
 * Sumber kebenaran: supabase/schema.sql
 */

/** Status lisensi. `unused` = key sudah dijual, belum dipakai di komputer kasir. */
export type LicenseStatus = 'unused' | 'active' | 'blocked' | 'revoked';

/**
 * Paket yang dibeli pembeli akhir.
 *  - `bundle`   : Bundle (PC + Aplikasi)
 *  - `app_only` : Aplikasi Saja
 * Nilai ini sama persis dengan yang disimpan di kolom `licenses.paket_type`.
 */
export type PaketType = 'bundle' | 'app_only';

/** Masa lisensi: sekali bayar (permanen) atau langganan. */
export type LicenseType = 'sekali' | 'langganan';

/** Tingkat penghargaan toko berdasarkan jumlah lisensi terjual. */
export type TierName = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';

export interface Partner {
  id: string;
  user_id: string | null;
  email: string | null;
  username: string | null;
  nama_toko: string;
  no_hp: string | null;
  alamat: string | null;
  /** Tidak lagi dipakai — kolomnya sisa fitur upload logo. */
  logo_url: string | null;
  license_quota: number;
  total_terjual: number;
  komisi_total: number;
  status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
}

export interface License {
  id: string;
  serial_key: string;
  partner_id: string;
  status: LicenseStatus;
  hwid_locked: string | null;
  hwid_locked_at: string | null;
  device_name: string | null;
  app_version: string | null;
  activated_at: string | null;
  paket_type: PaketType;
  license_type: LicenseType;
  pembeli_nama: string;
  pembeli_hp: string | null;
  alamat: string | null;
  komisi_amount: number;
  /** Nama tier saat key dibuat (snapshot). Bisa juga 'Tanpa Tier' bila admin belum mengatur. */
  tier: string;
  tier_rate: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  /** Katalog produk yang dipakai sebagai acuan harga. */
  produk_id: string | null;
  /**
   * Harga acuan saat transaksi, disimpan sebagai snapshot.
   * NULL = lisensi dibuat sebelum harga dicatat di database.
   */
  harga_jual: number | null;
}

/**
 * Baris view `toko_rekap` (lihat supabase/schema.sql bagian 10).
 *
 * Semua angka toko dihitung di database, jadi Home dan Profile membaca angka
 * yang sama dan tidak bisa berbeda karena salah satu query gagal.
 * - `sisa`          = partners.license_quota
 * - `total_key`     = JUMLAH baris licenses (bukan counter total_terjual)
 * - `total_komisi`  = komisi_penjualan + komisi_langganan (akumulasi)
 * - `langganan_per_key` = { "<license_id>": bulan_terakhir } untuk badge
 */
export interface RekapToko {
  partner_id: string;
  user_id: string | null;
  email: string | null;
  nama_toko: string;
  no_hp: string | null;
  alamat: string | null;
  status: 'active' | 'suspended';
  sisa: number;
  total_terjual_counter: number;
  komisi_total_counter: number;
  total_key: number;
  bundle_count: number;
  app_count: number;
  komisi_penjualan: number;
  komisi_langganan: number;
  total_komisi: number;
  langganan_per_key: Record<string, number>;
}

/** Satu catatan pembayaran langganan per bulan. */
export interface CatatanLangganan {
  id: string;
  license_id: string;
  partner_id: string;
  bulan_ke: number;
  dibayar_pada: string;
  komisi_toko: number;
}

/* ------------------------------------------------------------------ */
/* Aktivasi (dipanggil aplikasi desktop / Komputer Kasir)              */
/* ------------------------------------------------------------------ */

export type ActivationCode =
  | 'ACTIVATED'
  | 'ALREADY_ACTIVE'
  | 'INVALID_KEY'
  | 'NOT_ACTIVE'
  | 'BLOCKED'
  | 'EXPIRED'
  | 'HWID_MISMATCH'
  | 'NETWORK';

export interface ActivateRequest {
  serial_key: string;
  hwid: string;
  device_name?: string;
  app_version?: string;
}

export interface ActivateResponse {
  ok: boolean;
  /** Alias `ok` supaya klien lama/newan sama-sama bisa pakai. */
  success: boolean;
  code: ActivationCode;
  message: string;
  license?: {
    serial_key: string;
    partner_id: string;
    nama_toko: string | null;
    pembeli_nama: string | null;
    paket_type: PaketType;
    license_type: LicenseType;
    status: LicenseStatus;
    hwid_locked: string | null;
    locked_now: boolean;
    activated_at: string | null;
    expires_at: string | null;
  };
  /** HWID yang sudah terdaftar di server (dikirim saat mismatch). */
  locked_hwid?: string | null;
  server_time?: string;
}

/* ------------------------------------------------------------------ */
/* Generate serial key (form halaman Aktivasi)                          */
/* ------------------------------------------------------------------ */

export interface GenerateLicenseRequest {
  nama: string;
  telepon: string;
  alamat: string;
  paket: PaketType;
  tipe: LicenseType;
}

export interface GenerateLicenseResponse {
  ok: boolean;
  message: string;
  license?: License;
  quota?: number;
  /** Nama tier saat key dibuat; 'Tanpa Tier' bila admin belum mengatur. */
  tier?: string;
  komisi?: number;
  /** Harga acuan yang dipakai menghitung komisi key ini. */
  harga?: number | null;
}

/* ------------------------------------------------------------------ */
/* Langganan bulanan (komisi per bulan)                                */
/* ------------------------------------------------------------------ */

export interface CatatLanggananRequest {
  license_id: string;
}

export interface CatatLanggananResponse {
  ok: boolean;
  message: string;
  /** Nomor bulan yang baru dicatat (2 = bulan kedua). */
  bulan_ke?: number;
  /** Nominal komisi yang ditambahkan ke total. */
  komisi?: number;
}