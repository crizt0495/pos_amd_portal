import 'server-only';

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

/**
 * Supabase client dengan SERVICE ROLE key.
 * ⚠️ Hanya boleh dipakai di server, dan SETIAP pemanggil wajib
 * memvalidasi sesi pengguna lebih dulu (lihat `requireAuth`).
 */
let cached: SupabaseClient | null = null;

export function hasServiceRole(): boolean {
  return Boolean(env.supabaseUrl && env.serviceRoleKey);
}

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  if (!env.supabaseUrl || !env.serviceRoleKey) {
    throw new Error(
      'Kunci server Supabase belum diatur (SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY). Isi .env.local atau environment variable Vercel.',
    );
  }

  cached = createSupabaseClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  return cached;
}
