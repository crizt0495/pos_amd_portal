import 'server-only';

import { cache } from 'react';

import { tierOf, type TierRule } from '@/lib/commission';
import { createClient } from '@/lib/supabase/server';
import type { License, Partner } from '@/types';

/**
 * ===========================================================================
 *  getTokoStats — SATU sumber data untuk angka kuota toko
 * ===========================================================================
 *  Home dan Profile menampilkan angka yang sama (sisa kuota, total terjual,
 *  komisi), jadi keduanya memanggil fungsi ini. Jangan menghitung ulang angka
 *  di dalam halaman: begitu query-nya sedikit berbeda di satu halaman, angka
 *  Home dan Profile bisa tidak cocok — persis seperti bug yang dulu membuat
 *  kartu Home jadi 0/0 sementara Profile benar.
 *
 *  ANGKA DIAMBIL DARI MANA
 *  - `sisa`    : `partners.license_quota` — satu-satunya angka yang benar.
 *                Dikurangi 1 setiap key dibuat, di dalam RPC `generate_license`
 *                (baris partner dikunci `for update` jadi anti race-condition).
 *                JANGAN dihitung ulang dari jumlah key.
 *  - `terjual` : `partners.total_terjual` — counter yang sama dinaikkan RPC.
 *  - `kuotaAwal`: TIDAK disimpan di database, jadi diturunkan:
 *                `sisa + terjual`.
 *
 *  PENTING — jangan pakai embedded query PostgREST untuk daftar key.
 *  Bentuk seperti `licenses(order: created_at.desc, limit: 20, ...)` di dalam
 *  `select()` itu salah: PostgREST membaca isi kurung sebagai DAFTAR KOLOM,
 *  jadi `order:` dan `limit:` diperlakukan sebagai nama kolom dan seluruh
 *  query gagal (42703) -> `data` null -> semua angka ikut jadi 0. `order` dan
 *  `limit` untuk tabel yang di-embed hanya bisa lewat query parameter
 *  (`&licenses.order=…&licenses.limit=…`) yang tidak bisa ditulis di
 *  postgrest-js. Karena itu daftar key diambil sebagai query terpisah.
 */

export interface TokoStats {
  /** Baris `partners` milik user ini, atau null bila akun belum punya toko. */
  partner: Partner | null;
  /** Sisa kuota lisensi yang boleh dibuat lagi. */
  sisa: number;
  /** Jumlah key yang sudah terjual. */
  terjual: number;
  /** Kuota awal = sisa + terjual (diturunkan, tidak disimpan). */
  kuotaAwal: number;
  /** Total komisi dari kolom terdenormalisasi `partners.komisi_total`. */
  komisiTotal: number;
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
  'created_at',
].join(', ');

/** Angka dari database bisa null (kolom lama / belum diisi) -> jadi 0. */
function angka(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Ambil angka kuota + daftar key untuk toko milik `userId`.
 *
 * `withLicenses = false` dipakai halaman yang hanya butuh angka (Profile):
 * daftar key dan hitungan per tipe dilewati supaya tidak menambah 3 panggilan
 * database yang tidak terpakai.
 */
export const getTokoStats = cache(
  async (userId: string, withLicenses = true): Promise<TokoStats> => {
    const supabase = createClient();

    // Panggilan 1: baris toko. Sengaja tanpa embed — query ini yang jadi
    // sumber angka, jadi tidak boleh ikut gagal karena masalah relasi.
    const { data: partnerRow, error: errorPartner } = await supabase
      .from('partners')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (errorPartner) {
      console.error('[toko-stats] gagal baca baris partners:', errorPartner.message);
    }

    const partner = (partnerRow ?? null) as Partner | null;

    const kosong: TokoStats = {
      partner,
      sisa: 0,
      terjual: 0,
      kuotaAwal: 0,
      komisiTotal: 0,
      tier: tierOf(0),
      licenses: [],
      bundleCount: 0,
      appCount: 0,
      totalKey: 0,
    };

    if (!partner) return kosong;

    if (!withLicenses) {
      const terjual = angka(partner.total_terjual);
      const sisa = angka(partner.license_quota);
      return {
        ...kosong,
        sisa,
        terjual,
        kuotaAwal: sisa + terjual,
        komisiTotal: angka(partner.komisi_total),
        tier: tierOf(terjual),
      };
    }

    // Panggilan 2-4: paralel. Daftar key dibatasi 20 (payload), sedangkan
    // jumlah per tipe dihitung untuk SELURUH key dengan `head: true`
    // (PostgREST hanya menghitung, tidak mengirim baris) dan dicakup
    // `.eq('partner_id', …)` supaya tidak ikut key toko lain walau RLS longgar.
    const [daftar, bundle, aplikasi] = await Promise.all([
      supabase
        .from('licenses')
        .select(KOLOM_KEY)
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false })
        .limit(BATAS_DAFTAR_KEY),
      supabase
        .from('licenses')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partner.id)
        .eq('paket_type', 'bundle'),
      supabase
        .from('licenses')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partner.id)
        .eq('paket_type', 'app_only'),
    ]);

    if (daftar.error) console.error('[toko-stats] gagal baca daftar key:', daftar.error.message);

    // Client Supabase di portal ini tidak diberi tipe Database, jadi hasil
    // `.select()` dengan kolom dinamis berakhir sebagai `GenericStringError`.
    // Bentuk barisnya sudah pasti oleh daftar kolom di atas.
    const licenses = (daftar.data ?? []) as unknown as License[];
    const bundleCount = bundle.count ?? 0;
    const appCount = aplikasi.count ?? 0;
    const totalKey = bundleCount + appCount;

    // Fallback: counter `total_terjual` bisa masih 0 (mis. key dibuat lewat
    // SQL/import, bukan RPC) sementara key-nya sudah ada. Kalau begitu pakai
    // hitungan key yang benar-benar ada, supaya kartu tidak 0 padahal ada
    // transaksi.
    const terjual = angka(partner.total_terjual) || totalKey;

    // `license_quota` tidak punya kolom cadangan "kuota awal", jadi kalau null
    // sisa awal toko tidak bisa diketahui lagi — hasilnya 0, sama seperti
    // perlakuan RPC yang menyatakan kuota kosong sebagai habis.
    const sisa = angka(partner.license_quota);

    return {
      partner,
      sisa,
      terjual,
      kuotaAwal: sisa + terjual,
      komisiTotal: angka(partner.komisi_total),
      tier: tierOf(terjual),
      licenses,
      bundleCount,
      appCount,
      totalKey,
    };
  },
);
