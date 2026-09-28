/**
 * Env accessor. Sengaja lazy supaya `next build` tidak gagal ketika
 * variabel Supabase belum diisi (mis. saat setup awal / CI).
 */

function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/\/+$/, '');
}

export const env = {
  /**
   * URL project Supabase.
   * Alias yang didukung: NEXT_PUBLIC_SUPABASE_URL (utama) atau SUPABASE_URL.
   */
  get supabaseUrl() {
    return (
      clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
      clean(process.env.SUPABASE_URL) ||
      'http://127.0.0.1:54321'
    );
  },
  /**
   * Kunci publik. Mendukung dua gaya:
   *  - gaya baru (recommended): NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = sb_publishable_...
   *  - gaya lama              : NEXT_PUBLIC_SUPABASE_ANON_KEY      = eyJ...
   */
  get supabaseAnonKey() {
    return (
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
    );
  },
  /**
   * Kunci server-only. Mendukung:
   *  - SERVICE_KEY               = sb_secret_...   (gaya baru)
   *  - SUPABASE_SECRET_KEY       = sb_secret_...   (gaya baru)
   *  - SUPABASE_SERVICE_ROLE_KEY = eyJ...          (gaya lama)
   */
  get serviceRoleKey() {
    return (
      process.env.SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      ''
    );
  },
  get siteUrl() {
    return clean(process.env.NEXT_PUBLIC_SITE_URL) || 'http://localhost:3000';
  },
  get appName() {
    return process.env.NEXT_PUBLIC_APP_NAME || 'KasirPro Portal';
  },
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey && !env.supabaseUrl.includes('xxxx'));
}
