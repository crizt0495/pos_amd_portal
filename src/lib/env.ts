/**
 * Env accessor. Sengana lazily supaya `next build` tidak gagal ketika
 * variabel Supabase belum diisi (lokal sebelum setup / CI).
 */

function clean(v: string | undefined): string {
  return (v ?? '').trim().replace(/\/+$/, '');
}

export const env = {
  get supabaseUrl() {
    return clean(process.env.NEXT_PUBLIC_SUPABASE_URL) || 'http://127.0.0.1:54321';
  },
  get supabaseAnonKey() {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  },
  get serviceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  },
  get siteUrl() {
    return clean(process.env.NEXT_PUBLIC_SITE_URL) || 'http://localhost:3000';
  },
  get appName() {
    return process.env.NEXT_PUBLIC_APP_NAME || 'KasirPro';
  },
  get defaultQuota() {
    const n = parseInt(process.env.NEXT_PUBLIC_DEFAULT_LICENSE_QUOTA ?? '5', 10);
    return Number.isFinite(n) && n >= 0 ? n : 5;
  },
};

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('xxxx'),
  );
}
