import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

/**
 * Supabase client dengan service-role key.
 *
 * ⚠️  HANYA boleh dipakai di server (Route Handler / Server Action).
 *     Client ini melewati Row Level Security, jadi setiap pemanggil WAJIB
 *     memvalidasi sesi pengguna sendiri terlebih dahulu
 *     (lihat `src/lib/supabase/session.ts`).
 */

let cached: SupabaseClient | null = null;

/** True bila service-role key tersedia di environment. */
export function hasServiceRole(): boolean {
  return Boolean(env.supabaseUrl && env.serviceRoleKey);
}

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = env.supabaseUrl;
  const key = env.serviceRoleKey;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY belum diatur. Isi .env.local atau environment variable Vercel.',
    );
  }

  cached = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-application-name': 'kasirpro-server' },
    },
  });

  return cached;
}

/** Bersihkan cache client (dipakai saat env berubah, mis. saat hot-reload). */
export function resetAdminClient(): void {
  cached = null;
}
