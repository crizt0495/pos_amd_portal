import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/guard';
import { generateSerialKey } from '@/lib/serial';
import { POLA_HP, hanyaDigit } from '@/lib/validasi';
import type { GenerateLicenseResponse, License } from '@/types';

/**
 * POST /api/licenses
 * Dipakai form "Aktivasi" untuk membuat Serial Key baru.
 * Perhitungan kuota + tier dilakukan RPC `generate_license` (atomic, anti race-condition).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  nama: z.string().trim().min(3, 'Nama pembeli minimal 3 karakter').max(80),
  // Pakai aturan yang sama dengan form (lib/validasi) supaya server tidak
  // menerima nomor di luar pola 08xx walau request datang di luar UI.
  // `.regex(/^\d*$/)` menolak karakter non-digit lebih dulu — `hanyaDigit`
  // di refine berikutnya hanya memeriksa pola 08xx, jadi tanpa regex ini
  // "08ab1234567890" akan lolos setelah hurufnya dibuang.
  telepon: z
    .string()
    .trim()
    .min(1, 'Nomor HP wajib diisi')
    .regex(/^\d+$/, 'Nomor HP hanya boleh berisi angka')
    .refine((v) => POLA_HP.test(hanyaDigit(v)), 'Nomor HP harus diawali 08 dan 10-13 digit (mis. 081234567890).'),
  alamat: z.string().trim().min(10, 'Alamat minimal 10 karakter').max(240),
  paket: z.enum(['bundle', 'app_only']),
  tipe: z.enum(['sekali', 'langganan']),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json<GenerateLicenseResponse>(
      { ok: false, message: auth.error },
      { status: auth.status },
    );
  }

  const supabase = createClient();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json<GenerateLicenseResponse>(
      { ok: false, message: 'Body JSON tidak valid.' },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json<GenerateLicenseResponse>(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' },
      { status: 422 },
    );
  }

  const { nama, telepon, alamat, paket, tipe } = parsed.data;

  // 5 percobaan bila serial key kebetulan bentrok (sangat jarang, tapi tetap aman)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const serialKey = generateSerialKey();

    const { data, error } = await supabase.rpc('generate_license', {
      p_serial_key: serialKey,
      p_pembeli_nama: nama,
      p_pembeli_hp: telepon,
      p_alamat: alamat,
      p_paket_type: paket,
      p_license_type: tipe,
    });

    if (error) {
      const msg = error.message ?? '';

      if (msg.includes('QUOTA_EXHAUSTED')) {
        return NextResponse.json<GenerateLicenseResponse>(
          { ok: false, message: 'Sisa kuota lisensi toko Anda habis. Hubungi admin untuk topup.' },
          { status: 403 },
        );
      }
      if (msg.includes('PARTNER_NOT_FOUND')) {
        return NextResponse.json<GenerateLicenseResponse>(
          { ok: false, message: 'Data toko tidak ditemukan. Hubungi admin.' },
          { status: 403 },
        );
      }
      if (/generate_license|PGRST202/i.test(msg)) {
        return NextResponse.json<GenerateLicenseResponse>(
          {
            ok: false,
            message:
              'Fungsi generate_license belum ada di database. Jalankan portal/supabase/schema.sql di Supabase SQL Editor.',
          },
          { status: 500 },
        );
      }
      if (error.code === '23505') continue; // serial key bentrok -> generate ulang

      return NextResponse.json<GenerateLicenseResponse>(
        { ok: false, message: `Gagal membuat Serial Key: ${msg}` },
        { status: 500 },
      );
    }

    const row = (Array.isArray(data) ? data[0] : data) as License | null;
    if (!row) continue;

    const { data: after } = await supabase
      .from('partners')
      .select('license_quota')
      .eq('id', auth.user.partner!.id)
      .maybeSingle();

    return NextResponse.json<GenerateLicenseResponse>({
      ok: true,
      message: 'Serial Key berhasil dibuat.',
      license: row as License,
      quota: (after?.license_quota as number) ?? 0,
      tier: row.tier,
      komisi: Number(row.komisi_amount ?? 0),
      // Harga acuan yang dipakai menghitung komisi ini, supaya modal berhasil
      // bisa menampilkan "Harga" + "Komisi" tanpa menebak.
      harga: row.harga_jual == null ? null : Number(row.harga_jual),
    });
  }

  return NextResponse.json<GenerateLicenseResponse>(
    { ok: false, message: 'Gagal membuat Serial Key unik. Coba lagi.' },
    { status: 500 },
  );
}

/** GET /api/licenses — daftar key toko (dipakai debugging / daftar seller). */
export async function GET() {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('licenses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, licenses: data ?? [] });
}
