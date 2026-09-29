import 'server-only';

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import type { Partner } from '@/types';

export interface PortalSession {
  user: { id: string; email: string };
  partner: Partner | null;
}

/**
 * Ambil user login + baris `partners` SEKALI per request (React cache).
 *
 * Dipakai bersama oleh layout & halaman aplikasi (/home, /aktivasi, /profile)
 * agar `auth.getUser()` dan query `partners` hanya dijalankan satu kali —
 * memotong beberapa round-trip jaringan ke Supabase yang sebelumnya diulang
 * di setiap lapisan (dulu: layout getUser + halaman getUser + query partner).
 */
export const getPortalSession = cache(async (): Promise<PortalSession | null> => {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: partnerRow } = await supabase
    .from('partners')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    user: { id: user.id, email: user.email ?? '' },
    partner: (partnerRow ?? null) as Partner | null,
  };
});