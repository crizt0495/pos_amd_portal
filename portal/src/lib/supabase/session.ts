import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';

/**
 * Ambil user yang sedang login SEKALI per request (React cache).
 *
 * Memakai `auth.getSession()` (decode JWT dari cookie — tanpa jaringan) saat
 * token masih valid; token kedaluwarsa di-refresh di sini / di middleware.
 * Tidak memuat baris `partners` agar tiap halaman cukup 1 panggilan database.
 * Validasi sungguhan tetap terjadi di lapisan database (RLS menolak JWT
 * tak valid) — jadi aman tanpa panggilan `getUser()` tiap request.
 */
export const getPortalUser = cache(async (): Promise<{ id: string; email: string } | null> => {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return null;

  return { id: user.id, email: user.email ?? '' };
});