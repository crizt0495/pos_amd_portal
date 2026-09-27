import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import type { AppRole, Profile } from '@/types';

export interface SessionInfo {
  userId: string;
  email: string;
  profile: Profile | null;
  role: AppRole;
}

/**
 * Ambil info sesi user dari token JWT.
 * WAJIB dipanggil dari Route Handler dengan token dari header
 * `Authorization: Bearer <supabase access token>` yang dikirim client.
 * Semua penulisan data tetap divalidasi ulang di sini (service role melewati RLS).
 */
export async function getSessionInfo(token: string | null): Promise<SessionInfo | null> {
  if (!token) return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const user = data.user;
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role as AppRole) ?? 'owner';
  return {
    userId: user.id,
    email: user.email ?? '',
    profile: (profile as Profile) ?? null,
    role,
  };
}

/** Route Handler tidak punya cookie auth Supabase => client kirim header. */
export function bearerFromRequest(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    '127.0.0.1'
  );
}

export function userAgentFromRequest(req: Request): string {
  return (req.headers.get('user-agent') ?? 'unknown').slice(0, 400);
}

export function isSuperAdmin(session: SessionInfo | null): boolean {
  return session?.role === 'super_admin';
}

export function siteUrl(path = ''): string {
  return `${env.siteUrl}${path.startsWith('/') || path === '' ? path : `/${path}`}`;
}
