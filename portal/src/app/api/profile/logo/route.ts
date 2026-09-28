import { NextResponse } from 'next/server';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/guard';

/**
 * POST /api/profile/logo
 * Unggah logo toko ke Supabase Storage bucket `store-logos`, lalu simpan URL-nya
 * ke `partners.logo_url`.
 *
 * Body: multipart/form-data  ->  logo: File (png/jpeg/webp, maks 2 MB)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'store-logos';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }

  if (!hasServiceRole()) {
    return NextResponse.json(
      { ok: false, message: 'Server belum dikonfigurasi (SUPABASE_SECRET_KEY kosong).' },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, message: 'Gunakan multipart/form-data.' }, { status: 400 });
  }

  const file = form.get('logo');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: 'Field "logo" wajib berisi gambar.' }, { status: 422 });
  }

  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { ok: false, message: 'Format harus PNG, JPG, atau WebP.' },
      { status: 422 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, message: 'Ukuran logo maksimal 2 MB.' }, { status: 422 });
  }

  const partnerId = auth.user.partner!.id;
  const path = `${partnerId}/logo-${Date.now()}.${ext}`;

  try {
    const admin = createAdminClient();

    // hapus logo lama (agar bucket tidak menumpuk)
    const { data: old } = await admin
      .from('partners')
      .select('logo_url')
      .eq('id', partnerId)
      .maybeSingle();

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });

    if (upErr) {
      return NextResponse.json(
        { ok: false, message: `Gagal mengunggah logo: ${upErr.message}` },
        { status: 500 },
      );
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;

    const supabase = createClient();
    const { error: upErr2 } = await supabase
      .from('partners')
      .update({ logo_url: url })
      .eq('id', partnerId);

    if (upErr2) {
      return NextResponse.json(
        { ok: false, message: `Logo terunggah tapi gagal disimpan: ${upErr2.message}` },
        { status: 500 },
      );
    }

    // best-effort hapus file lama
    const oldPath = extractPath(old?.logo_url);
    if (oldPath) await admin.storage.from(BUCKET).remove([oldPath]);

    return NextResponse.json({ ok: true, url, message: 'Logo toko diperbarui.' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : 'Gagal mengunggah logo.' },
      { status: 500 },
    );
  }
}

function extractPath(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  const marker = '/storage/v1/object/public/store-logos/';
  const i = publicUrl.indexOf(marker);
  return i >= 0 ? publicUrl.slice(i + marker.length) : null;
}
