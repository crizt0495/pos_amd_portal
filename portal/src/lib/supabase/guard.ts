import 'server-only';

import { cache } from 'react';

import { getPortalSession } from '@/lib/supabase/session';
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
 *
 * Menggunakan getPortalSession() yang di-cache per-request, jadi autentikasi
 * + query partner tidak dijalankan berulang dalam request yang sama.
 */
export const requireAuth = cache(async (): Promise<AuthResult> => {
  const sesi = await getPortalSession();

  if (!sesi) {
    return { error: 'Sesi tidak valid. Silakan login ulang.', status: 401 };
  }

  if (!sesi.partner) {
    return { error: 'Data toko belum terdaftar. Hubungi admin.', status: 403 };
  }

  if (sesi.partner.status === 'suspended') {
    return { error: 'Akun toko Anda dinonaktifkan. Hubungi admin.', status: 403 };
  }

  return {
    ok: true,
    user: { userId: sesi.user.id, email: sesi.user.email, partner: sesi.partner },
  };
});

/** Ambil user yang sedang login saja (tanpa data partner). */
export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const sesi = await getPortalSession();
  if (!sesi) return null;
  return { id: sesi.user.id, email: sesi.user.email };
}