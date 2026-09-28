import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login — login dengan USERNAME (atau email) + password.
 *
 * Alur:
 *   1. kalau input berisi "@"  -> langsung dianggap email toko
 *   2. selain itu              -> cari email dari `partners.username`
 *   3. signInWithPassword(email, password) via sesi cookie (supabase-ssr)
 *
 * Menangani akun yang dibuat lewat Supabase Auth (user + partner trigger).
 */

const USERNAME_RE = /^[a-z0-9._-]+$/;

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const body = (raw ?? {}) as { username?: unknown; password?: unknown };
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');

  if (!username || !password) {
    return NextResponse.json(
      { ok: false, message: 'Username dan password wajib diisi.' },
      { status: 422 },
    );
  }

  // --- tentukan email target -------------------------------------------------
  let email = '';
  if (username.includes('@')) {
    email = username.toLowerCase();
  } else {
    const clean = username.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!clean || !USERNAME_RE.test(clean)) {
      return NextResponse.json(
        { ok: false, message: 'Username hanya boleh huruf, angka, titik, garis.' },
        { status: 422 },
      );
    }

    const admin = createAdminClient();
    const { data: partner } = await admin
      .from('partners')
      .select('email, status')
      .eq('username', clean)
      .maybeSingle();

    if (!partner?.email) {
      // Jangan bocorkan apakah usernamenya ada — respon sama untuk salah password.
      return NextResponse.json({ ok: false, message: 'Username atau password salah.' }, { status: 401 });
    }
    if (partner.status === 'suspended') {
      return NextResponse.json(
        { ok: false, message: 'Akun toko Anda dinonaktifkan. Hubungi admin.' },
        { status: 403 },
      );
    }
    email = partner.email;
  }

  // --- login lewat GoTrue (cookie sesi otomatis menempel di respons) ----------
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const msg = error.message || '';
    if (/invalid login credentials/i.test(msg)) {
      return NextResponse.json({ ok: false, message: 'Username atau password salah.' }, { status: 401 });
    }
    if (/email not confirmed/i.test(msg)) {
      return NextResponse.json(
        { ok: false, message: 'Email belum dikonfirmasi. Cek kotak masuk Anda.' },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: false, message: msg }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}