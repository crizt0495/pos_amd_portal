import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { getPortalUser } from '@/lib/supabase/session';
import type { Partner } from '@/types';

export interface AuthedUser {
  userId: string;
  email: string;
  partner: Partner | null;
}

export type AuthResult = { error: string; status: number } | { ok: true; user: AuthedUser };

/**
 * Validasi user yang sedang login + ambil baris `partners`.
 * Dipakai di setiap Route Handler yang mengubah data.
 */
export const requireAuth = cache(async (): Promise<AuthResult> => {
  const user = await getPortalUser();
  if (!user) {
    return { error: 'Sesi tidak valid. Silakan login ulang.', status: 401 };
  }

  const supabase = createClient();
  const { data: partnerRow } = await supabase
    .from('partners')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  const partner = (partnerRow ?? null) as Partner | null;

  if (!partner) {
    return { error: 'Data toko belum terdaftar. Hubungi admin.', status: 403 };
  }

  if (partner.status === 'suspended') {
    return { error: 'Akun toko Anda dinonaktifkan. Hubungi admin.', status: 403 };
  }

  return {
    ok: true,
    user: { userId: user.id, email: user.email, partner },
  };
});

/** Ambil user yang sedang login saja (tanpa data partner). */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  return getPortalUser();
}