import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { getTokoStats } from '@/lib/supabase/toko-stats';
import type { PaketType } from '@/types';

/**
 * ===========================================================================
 *  getLanggananToko — daftar langganan aktif untuk halaman Aktivasi
 * ===========================================================================
 *  Dipakai supaya toko bisa mencatat komisi langganan tiap bulan. Bedanya
 *  dengan `getTokoStats`: yang ini butuh daftar LISENSI langganan (bukan 20
 *  key terbaru, karena key langganan bisa saja bukan yang terbaru), jadi
 *  query-nya dipisah.
 *
 *  Angka bulan + komisi tetap dibaca dari database (`langganan_pembayaran`),
 *  tidak dihitung ulang dari tanggal. Kalau tabelnya belum ada (SQL Editor
 *  belum dijalankan ulang), daftar tetap tampil dengan bulan 0 dan catatan
 *  komisi kosong — bukan halaman error.
 */

/** Jumlah langganan yang ditampilkan di halaman Aktivasi. */
export const BATAS_LANGGANAN = 25;

/** Saran tampil: berapa lama langganan boleh dicatat (12 bulan). */
export const MAKS_BULAN_LANGGANAN = 12;

export interface LanggananToko {
  id: string;
  serial_key: string;
  pembeli_nama: string;
  paket_type: PaketType;
  /** Persen tier saat transaksi ini dibuat (bukan tier toko sekarang). */
  tier_rate: number;
  harga_jual: number | null;
  /** Tanggal key dibuat (dipakai untuk baris "Mulai ..."). */
  created_at: string;
  /** Masa berlaku langganan (12 bulan dari saat key dibuat). */
  expires_at: string | null;
  /** Nomor bulan terakhir yang tercatat. 0 = baru dibuat (bulan 1 saja). */
  bulanTerakhir: number;
  /** Nomor bulan yang akan dicatat kalau toko menekan tombol. */
  bulanBerikutnya: number;
  /** Komisi bulan `bulanBerikutnya` — pratinjau, angka resmi dari RPC. */
  komisiBerikutnya: number;
  /** Total komisi langganan yang sudah tercatat untuk lisensi ini. */
  komisiTerkumpul: number;
  /** Sudah sampai bulan 12 -> tombol catat disembunyikan. */
  selesai: boolean;
}

export const getLanggananToko = cache(async (userId: string): Promise<LanggananToko[]> => {
  // `getTokoStats` dibungkus `cache()`, jadi kalau halaman yang sama sudah
  // memanggilnya (mis. untuk angka di Home), baris toko tidak dibaca dua kali.
  const { partner } = await getTokoStats(userId, false);
  if (!partner) return [];

  const supabase = createClient();

  const [daftar, catatan] = await Promise.all([
    supabase
      .from('licenses')
      .select('id, serial_key, pembeli_nama, paket_type, tier_rate, harga_jual, expires_at, created_at')
      .eq('partner_id', partner.id)
      .eq('license_type', 'langganan')
      .order('created_at', { ascending: false })
      .limit(BATAS_LANGGANAN),
    supabase
      .from('langganan_pembayaran')
      .select('license_id, bulan_ke, komisi_toko')
      .eq('partner_id', partner.id),
  ]);

  if (daftar.error) {
    console.error('[langganan] gagal baca daftar langganan:', daftar.error.message);
    return [];
  }

  // Tabel langganan_pembayaran belum ada -> anggap belum ada pembayaran.
  if (catatan.error) {
    console.warn(
      '[langganan] tabel langganan_pembayaran belum ada — jalankan ulang ' +
        'portal/supabase/schema.sql di Supabase SQL Editor.',
    );
  }

  type BarisCatatan = { license_id: string; bulan_ke: number | null; komisi_toko: number | null };
  const perKey = new Map<string, { bulan: number; komisi: number }>();

  for (const c of (catatan.data ?? []) as unknown as BarisCatatan[]) {
    const bulan = Number(c.bulan_ke) || 0;
    const komisi = Number(c.komisi_toko) || 0;
    const lama = perKey.get(c.license_id) ?? { bulan: 0, komisi: 0 };
    perKey.set(c.license_id, {
      bulan: Math.max(lama.bulan, bulan),
      komisi: lama.komisi + komisi,
    });
  }

  type BarisLisensi = {
    id: string;
    serial_key: string;
    pembeli_nama: string;
    paket_type: PaketType;
    tier_rate: number | null;
    harga_jual: number | null;
    expires_at: string | null;
    created_at: string;
  };

  return ((daftar.data ?? []) as unknown as BarisLisensi[]).map((l) => {
    const catatanKey = perKey.get(l.id) ?? { bulan: 0, komisi: 0 };

    // Bulan 1 sudah dibayar saat pendaftaran (tercatat di
    // licenses.komisi_amount), jadi pencatatan berikutnya mulai bulan 2.
    const bulanBerikutnya = Math.max(catatanKey.bulan + 1, 2);

    // Pratinjau komisi, formula sama dengan RPC catat_langganan_bulan().
    // Angka resmi tetap yang dikembalikan RPC.
    const hargaBulanan = Math.round((Number(l.harga_jual) || 0) / 12);
    const komisiBerikutnya = Math.round((hargaBulanan * (Number(l.tier_rate) || 0)) / 100);

    return {
      id: l.id,
      serial_key: l.serial_key,
      pembeli_nama: l.pembeli_nama,
      paket_type: l.paket_type,
      tier_rate: Number(l.tier_rate) || 0,
      harga_jual: l.harga_jual == null ? null : Number(l.harga_jual),
      created_at: l.created_at,
      expires_at: l.expires_at,
      bulanTerakhir: catatanKey.bulan,
      bulanBerikutnya,
      komisiBerikutnya,
      komisiTerkumpul: catatanKey.komisi,
      selesai: bulanBerikutnya > MAKS_BULAN_LANGGANAN,
    };
  });
});
