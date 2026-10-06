import 'server-only';

import { cache } from 'react';

import { tierOf, type TierRule } from '@/lib/commission';
import { createClient } from '@/lib/supabase/server';
import type { License, Partner, RekapToko } from '@/types';

/**
 * ===========================================================================
 *  getTokoStats — SATU sumber data untuk angka kuota toko
 * ===========================================================================
 *  Home, Profile, dan halaman Aktivasi memanggil fungsi ini. Jangan menghitung
 *  ulang angka di dalam halaman: begitu query-nya sedikit berbeda di satu
 *  halaman, angka Home dan Profile bisa tidak cocok — persis seperti bug yang
 *  dulu membuat kartu Home jadi 0/0 sementara Profile benar.
 *
 *  SEMUA ANGKA DIAMBIL DARI VIEW `toko_rekap`
 *  (supabase/schema.sql bagian 10). Alasannya, bukan sekadar "`view` lebih
 *  enak":
 *
 *  1. `terjual` = JUMLAH baris `licenses`, bukan counter `partners.total_terjual`.
 *     Counter itu bisa melenceng -- key yang dibuat lewat SQL/import atau lewat
 *     seed tidak menaikkan counter, dan ujungnya tier toko ikut salah karena
 *     tier dibaca dari angka yang sama.
 *  2. `komisi` dijumlahkan dari `SUM(licenses.komisi_amount)` +
 *     `SUM(langganan_pembayaran.komisi_toko)`, jadi tidak bergantung pada
 *     counter `komisi_total` yang bisa tertinggal.
 *  3. Hitungannya terjadi di database, jadi Home dan Profile MUSTAHIL berbeda
 *     hanya karena salah satu pemanggilnya gagal.
 *
 *  Yang TIDAK disimpan di database tetap diturunkan:
 *  - `sisa`    : `partners.license_quota` (dikurangi RPC `generate_license`)
 *  - `kuotaAwal`: `sisa + terjual`
 *
 *  PENTING — jangan pakai embedded query PostgREST untuk daftar key.
 *  Bentuk seperti `licenses(order: created_at.desc, limit: 20, ...)` di dalam
 *  `select()` itu salah: PostgREST membaca isi kurung sebagai DAFTAR KOLOM,
 *  jadi `order:` dan `limit:` diperlakukan sebagai nama kolom dan seluruh
 *  query gagal (42703) -> `data` null -> semua angka ikut jadi 0. `order` dan
 *  `limit` untuk tabel yang di-embed hanya bisa lewat query parameter
 *  (`&licenses.order=...&licenses.limit=...`) yang tidak bisa ditulis di
 *  postgrest-js. Karena itu daftar key diambil sebagai query terpisah.
 */

export interface TokoStats {
  /** Baris `partners` milik user ini, atau null bila akun belum punya toko. */
  partner: Partner | null;
  /** Sisa kuota lisensi yang boleh dibuat lagi. */
  sisa: number;
  /** Jumlah key yang sudah terjual = jumlah baris licenses. */
  terjual: number;
  /** Kuota awal = sisa + terjual (diturunkan, tidak disimpan). */
  kuotaAwal: number;
  /** Total komisi = komisi penjualan + komisi langganan. */
  komisiTotal: number;
  /** Bagian komisi dari penjualan key (sekali bayar + bulan 1 langganan). */
  komisiPenjualan: number;
  /** Akumulasi komisi langganan bulan 2 ke atas. */
  komisiLangganan: number;
  /** Tier mengikuti `terjual`, jadi sama dengan yang dipakai di Profile. */
  tier: TierRule;
  /** Key terbaru (maks. 20) — untuk daftar "Riwayat Key". */
  licenses: License[];
  /** Jumlah SELURUH key bertipe bundle (bukan hanya 20 terbaru). */
  bundleCount: number;
  /** Jumlah SELURUH key bertipe aplikasi saja. */
  appCount: number;
  /** Jumlah semua key toko. */
  totalKey: number;
  /**
   * Bulan langganan terakhir per lisensi: `{ "<license_id>": bulan }`.
   * `0`/hilang berarti bulan 1 saja (langganan baru dibuat).
   */
  langgananPerKey: Record<string, number>;
  /** True kalau angka dibaca lewat hitungan manual (view belum ada). */
  modeCadangan: boolean;
}

/** Jumlah key terbaru yang diambil untuk daftar di Home. */
export const BATAS_DAFTAR_KEY = 20;

/**
 * Kolom yang dipakai daftar key. `id` wajib ikut: `KeyList` memakainya
 * sebagai `key` React dan penanda "sudah disalin".
 */
const KOLOM_KEY = [
  'id',
  'serial_key',
  'status',
  'paket_type',
  'license_type',
  'pembeli_nama',
  'pembeli_hp',
  'alamat',
  'komisi_amount',
  'harga_jual',
  'tier_rate',
  'created_at',
].join(', ');

/** Angka dari database bisa null (kolom lama / belum diisi) -> jadi 0. */
function angka(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** `langganan_per_key` datang sebagai jsonb object, bisa null. */
function petaBulan(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const bulan = Number(n);
    if (Number.isFinite(bulan) && bulan > 0) out[k] = Math.floor(bulan);
  }
  return out;
}

/**
 * Baca view `toko_rekap`.
 *
 * Kalau view belum ada (SQL Editor belum pernah dijalankan ulang), jangan
 * menggagalkan seluruh halaman: kembalikan null supaya pemanggil jatuh ke
 * hitungan manual. Tanpa ini, deploy kode baru sebelum migration SQL akan
 * membuat Home error 500.
 */
async function bacaRekap(userId: string): Promise<RekapToko | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('toko_rekap')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    // 42P01 = undefined_table, PGRST205 = tabel/view tidak ada di schema cache.
    const pesan = error.message ?? '';
    if (error.code === '42P01' || error.code === 'PGRST205' || /toko_rekap/.test(pesan)) {
      console.warn(
        '[toko-stats] view toko_rekap belum ada di database — jalankan ulang ' +
          'portal/supabase/schema.sql di Supabase SQL Editor. Sambil menunggu, ' +
          'angka dihitung manual dari tabel partners + licenses.',
      );
    } else {
      console.error('[toko-stats] gagal baca view toko_rekap:', pesan);
    }
    return null;
  }

  return (data ?? null) as RekapToko | null;
}

/**
 * Ambil angka kuota + daftar key untuk toko milik `userId`.
 *
 * `withLicenses = false` dipakai halaman yang hanya butuh angka (Profile):
 * daftar key dilewati supaya tidak menambah satu panggilan database.
 */
export const getTokoStats = cache(
  async (userId: string, withLicenses = true): Promise<TokoStats> => {
    const supabase = createClient();

    const kosong = (partner: Partner | null): TokoStats => ({
      partner,
      sisa: 0,
      terjual: 0,
      kuotaAwal: 0,
      komisiTotal: 0,
      komisiPenjualan: 0,
      komisiLangganan: 0,
      tier: tierOf(0),
      licenses: [],
      bundleCount: 0,
      appCount: 0,
      totalKey: 0,
      langgananPerKey: {},
      modeCadangan: false,
    });

    // Panggilan 1: semua angka toko dalam satu baris.
    const rekap = await bacaRekap(userId);

    // Panggilan 2 (hanya kalau perlu daftar key): 20 key terbaru.
    const daftar = withLicenses
      ? await supabase
          .from('licenses')
          .select(KOLOM_KEY)
          .eq(
            'partner_id',
            rekap?.partner_id ?? '00000000-0000-0000-0000-000000000000',
          )
          .order('created_at', { ascending: false })
          .limit(BATAS_DAFTAR_KEY)
      : { data: null, error: null };

    if (daftar.error) {
      console.error('[toko-stats] gagal baca daftar key:', daftar.error.message);
    }

    // Client Supabase di portal ini tidak diberi tipe Database, jadi hasil
    // `.select()` dengan kolom dinamis berakhir sebagai `GenericStringError`.
    // Bentuk barisnya sudah pasti oleh daftar kolom di atas.
    const licenses = (daftar.data ?? []) as unknown as License[];

    /* ---------------- jalur utama: view toko_rekap ---------------- */
    if (rekap) {
      const sisa = angka(rekap.sisa);
      const terjual = angka(rekap.total_key);
      return {
        partner: {
          id: rekap.partner_id,
          user_id: rekap.user_id,
          email: rekap.email,
          username: null,
          nama_toko: rekap.nama_toko,
          no_hp: rekap.no_hp,
          alamat: rekap.alamat,
          logo_url: null,
          license_quota: sisa,
          total_terjual: terjual,
          komisi_total: angka(rekap.total_komisi),
          status: rekap.status,
          created_at: '',
          updated_at: '',
        },
        sisa,
        terjual,
        kuotaAwal: sisa + terjual,
        komisiTotal: angka(rekap.total_komisi),
        komisiPenjualan: angka(rekap.komisi_penjualan),
        komisiLangganan: angka(rekap.komisi_langganan),
        tier: tierOf(terjual),
        licenses,
        bundleCount: angka(rekap.bundle_count),
        appCount: angka(rekap.app_count),
        totalKey: angka(rekap.total_key),
        langgananPerKey: petaBulan(rekap.langganan_per_key),
        modeCadangan: false,
      };
    }

    /* ---------------- cadangan: view belum ada ---------------- */

    const { data: partnerRow, error: errorPartner } = await supabase
      .from('partners')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (errorPartner) {
      console.error('[toko-stats] gagal baca baris partners:', errorPartner.message);
    }

    const partner = (partnerRow ?? null) as Partner | null;
    if (!partner) return kosong(null);

    const partnerId = partner.id;

    // Jumlah per tipe + komisi. Count pakai `head: true` (PostgREST hanya
    // menghitung, tidak mengirim baris) dan dicakup `.eq('partner_id', ...)`
    // supaya tidak ikut key toko lain walau RLS longgar.
    const [bundle, aplikasi, semua, catatan] = await Promise.all([
      supabase
        .from('licenses')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('paket_type', 'bundle'),
      supabase
        .from('licenses')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('paket_type', 'app_only'),
      // Tanpa `limit`: SUM harus menghitung SELURUH key, bukan 20 terbaru.
      supabase.from('licenses').select('komisi_amount').eq('partner_id', partnerId),
      supabase.from('langganan_pembayaran').select('license_id, komisi_toko').eq('partner_id', partnerId),
    ]);

    if (catatan.error) {
      console.error('[toko-stats] gagal baca catatan langganan:', catatan.error.message);
    }

    const baris = (semua.data ?? []) as unknown as { komisi_amount: number | null }[];
    const komisiPenjualan = baris.reduce((s, b) => s + angka(b.komisi_amount), 0);

    const bulanPerKey: Record<string, number> = {};
    let komisiLangganan = 0;
    for (const c of (catatan.data ?? []) as unknown as {
      license_id: string;
      bulan_ke?: number;
      komisi_toko: number | null;
    }[]) {
      komisiLangganan += angka(c.komisi_toko);
      bulanPerKey[c.license_id] = Math.max(bulanPerKey[c.license_id] ?? 0, angka(c.bulan_ke));
    }

    const totalKey = semua.count ?? 0;
    const sisa = angka(partner.license_quota);
    const terjual = totalKey;

    return {
      partner,
      sisa,
      terjual,
      kuotaAwal: sisa + terjual,
      komisiTotal: komisiPenjualan + komisiLangganan,
      komisiPenjualan,
      komisiLangganan,
      tier: tierOf(terjual),
      licenses,
      bundleCount: bundle.count ?? 0,
      appCount: aplikasi.count ?? 0,
      totalKey,
      langgananPerKey: bulanPerKey,
      modeCadangan: true,
    };
  },
);
