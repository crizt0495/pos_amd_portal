import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAuth } from '@/lib/supabase/guard';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/langganan/perpanjang
 *
 * Dipakai tombol "Perpanjang +1 Tahun" di Profile untuk memperpanjang
 * lisensi langganan satu tahun. Logika di RPC `perpanjang_langganan`
 * (schema.sql bagian 9.2).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  license_id: z.string().uuid('ID lisensi tidak valid'),
});

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }

  const supabase = createClient();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' },
      { status: 422 },
    );
  }

  const { data, error } = await supabase.rpc('perpanjang_langganan', {
    p_license_id: parsed.data.license_id,
  });

  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('LICENSE_NOT_FOUND')) {
      return NextResponse.json(
        { ok: false, message: 'Lisensi tidak ditemukan atau bukan milik Anda.' },
        { status: 404 },
      );
    }
    if (msg.includes('NOT_SUBSCRIPTION')) {
      return NextResponse.json(
        { ok: false, message: 'Hanya lisensi langganan yang bisa diperpanjang.' },
        { status: 400 },
      );
    }
    if (msg.includes('PARTNER_NOT_FOUND')) {
      return NextResponse.json(
        { ok: false, message: 'Data toko tidak ditemukan. Hubungi admin.' },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { ok: false, message: `Gagal memperpanjang: ${msg}` },
      { status: 500 },
    );
  }

  // RPC returns array of rows; ambil baris pertama.
  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  const expiresAt = row?.expires_at ?? null;
  const komisi = Number(row?.komisi ?? 0);

  return NextResponse.json({
    ok: true,
    message: `Langganan diperpanjang 1 tahun. Komisi Rp ${komisi.toLocaleString('id-ID')} tercatat.`,
    expires_at: expiresAt,
    komisi,
  });
}
