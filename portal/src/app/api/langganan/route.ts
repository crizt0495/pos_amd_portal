import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth } from '@/lib/supabase/guard';
import { createClient } from '@/lib/supabase/server';
import type { CatatLanggananResponse } from '@/types';

/**
 * POST /api/langganan
 * Dipakai tombol "Catat Bulan Berikutnya" di halaman Aktivasi untuk mencatat
 * bahwa pelanggan langganan sudah membayar bulan ini.
 *
 * Semua logika ada di RPC `catat_langganan_bulan()` (schema.sql bagian 9.1):
 *   1) cek lisensi milik toko yang sedang login dan bertipe 'langganan'
 *  2) tentukan nomor bulan berikutnya (minimal 2)
 *  3) hitung komisi dari harga acuan x tier_rate yang tersimpan di lisensi
 *  4) tambah ke partners.komisi_total
 *
 * Route handler ini hanya menerjemahkan kode error Postgres menjadi pesan yang
 * bisa dibaca toko. Nomor bulan dan nominal komisi tidak pernah datang dari
 * klien, jadi tidak bisa dipalsukan.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  license_id: z.string().uuid('ID lisensi tidak valid'),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json<CatatLanggananResponse>(
      { ok: false, message: auth.error },
      { status: auth.status },
    );
  }

  const supabase = createClient();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json<CatatLanggananResponse>(
      { ok: false, message: 'Body JSON tidak valid.' },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<CatatLanggananResponse>(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' },
      { status: 422 },
    );
  }

  const { data, error } = await supabase.rpc('catat_langganan_bulan', {
    p_license_id: parsed.data.license_id,
  });

  if (error) {
    const msg = error.message ?? '';

    if (msg.includes('LICENSE_NOT_FOUND')) {
      return NextResponse.json<CatatLanggananResponse>(
        { ok: false, message: 'Lisensi tidak ditemukan atau bukan milik toko Anda.' },
        { status: 404 },
      );
    }
    if (msg.includes('NOT_SUBSCRIPTION')) {
      return NextResponse.json<CatatLanggananResponse>(
        { ok: false, message: 'Key ini bukan langganan, jadi tidak ada komisi bulanan.' },
        { status: 400 },
      );
    }
    if (msg.includes('SUBSCRIPTION_DONE')) {
      return NextResponse.json<CatatLanggananResponse>(
        { ok: false, message: 'Langganan ini sudah lengkap 12 bulan.' },
        { status: 400 },
      );
    }
    if (msg.includes('ALREADY_RECORDED')) {
      return NextResponse.json<CatatLanggananResponse>(
        { ok: false, message: 'Bulan ini sudah pernah dicatat. Muat ulang halaman.' },
        { status: 409 },
      );
    }
    if (/catat_langganan_bulan|PGRST202|PGRST204/i.test(msg)) {
      return NextResponse.json<CatatLanggananResponse>(
        {
          ok: false,
          message:
            'Fungsi catat_langganan_bulan belum ada di database. Jalankan ulang portal/supabase/schema.sql di Supabase SQL Editor.',
        },
        { status: 500 },
      );
    }
    if (msg.includes('PARTNER_NOT_FOUND')) {
      return NextResponse.json<CatatLanggananResponse>(
        { ok: false, message: 'Data toko tidak ditemukan. Hubungi admin.' },
        { status: 403 },
      );
    }

    return NextResponse.json<CatatLanggananResponse>(
      { ok: false, message: `Gagal mencatat pembayaran: ${msg}` },
      { status: 500 },
    );
  }

  // RPC mengembalikan nominal komisi. Nomor bulan diambil ulang di sisi klien
  // lewat router.refresh(), jadi tidak perlu dikirim balik di sini.
  const komisi = Number(Array.isArray(data) ? data[0] : data) || 0;

  return NextResponse.json<CatatLanggananResponse>({
    ok: true,
    message: komisi > 0 ? `Komisi ${komisi} tercatat.` : 'Pembayaran tercatat.',
    komisi,
  });
}
