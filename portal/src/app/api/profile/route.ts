import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/guard';

/**
 * PATCH /api/profile — ubah data toko (nama, no HP, alamat).
 * Menulis lewat sesi user sehingga RLS (`partners_update_own`) yang mengunci akses.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  nama_toko: z.string().trim().min(2, 'Nama toko terlalu pendek').max(80),
  // Hanya digit. Server menolak karakter apa pun (huruf, spasi, `-`, `+`) walau
  // request datang langsung, bukan dari UI.
  no_hp: z
    .string()
    .trim()
    .max(15, 'Nomor HP maksimal 15 digit')
    .regex(/^\d*$/, 'Nomor HP hanya boleh berisi angka'),
  alamat: z.string().trim().max(240),
});

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }

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

  const supabase = createClient();
  const payload: Record<string, unknown> = {
    nama_toko: parsed.data.nama_toko,
    no_hp: parsed.data.no_hp || null,
    alamat: parsed.data.alamat || null,
  };

  const { error } = await supabase
    .from('partners')
    .update(payload)
    .eq('id', auth.user.partner!.id);

  if (error) {
    return NextResponse.json({ ok: false, message: `Gagal menyimpan: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: 'Profil toko diperbarui.' });
}
