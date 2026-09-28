import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';
import type { Partner } from '@/types';

export interface AuthedUser {
  userId: string;
  email: string;
  partner: Partner | null;
}

export type AuthResult = { error: string; status: number } | { ok: true; user: AuthedUser };

/**
 * Validasi user yang sedang login (dari cookie sesi) + ambil baris `partners`.
 * Dipakai di setiap Route Handler yang mengubah data.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: 'Sesi tidak valid. Silakan login ulang.', status: 401 };
  }

  const { data: partner, error: pErr } = await supabase
    .from('partners')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (pErr) {
    return { error: `Gagal memuat data toko: ${pErr.message}`, status: 500 };
  }

  if (!partner) {
    return { error: 'Data toko belum terdaftar. Hubungi admin.', status: 403 };
  }

  if ((partner as Partner).status === 'suspended') {
    return { error: 'Akun toko Anda dinonaktifkan. Hubungi admin.', status: 403 };
  }

  return {
    ok: true,
    user: { userId: user.id, email: user.email ?? '', partner: partner as Partner },
  };
}

/** Ambil user yang sedang login saja (tanpa data partner). */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const supabase: SupabaseClient = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}
