import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { bearerFromRequest, getSessionInfo, type SessionInfo } from '@/lib/supabase/session';

/**
 * Hasil pemeriksaan akses Super Admin untuk Route Handler.
 *
 * Sengaja discriminated-union eksplisit: TypeScript akan meratakan union
 * object literal hasil `return` bertipe `as const` menjadi satu tipe dengan
 * properti opsional, sehingga `if ('error' in auth)` tidak lagi men-narrow
 * dengan benar. Annotasi eksplisit di bawah mencegah hal itu.
 */
export type AdminAuthResult =
  | { error: string; status: number }
  | { session: SessionInfo; admin: SupabaseClient };

export const FORBIDDEN = 'Akses khusus Super Admin.';

/**
 * Pastikan request berasal dari user dengan role `super_admin`.
 * Return `{ error, status }` kalau gagal, `{ session, admin }` kalau berhasil.
 */
export async function requireSuperAdmin(req: Request): Promise<AdminAuthResult> {
  if (!hasServiceRole()) return { error: 'Server belum dikonfigurasi.', status: 500 };

  const session = await getSessionInfo(bearerFromRequest(req));
  if (!session) return { error: 'Sesi tidak valid. Login ulang.', status: 401 };
  if (session.role !== 'super_admin') return { error: FORBIDDEN, status: 403 };

  return { session, admin: createAdminClient() };
}

/** Sama seperti `requireSuperAdmin`, tetapi juga menerima role `partner`. */
export async function requireStaff(
  req: Request,
): Promise<AdminAuthResult | { error: string; status: number }> {
  if (!hasServiceRole()) return { error: 'Server belum dikonfigurasi.', status: 500 };

  const session = await getSessionInfo(bearerFromRequest(req));
  if (!session) return { error: 'Sesi tidak valid. Login ulang.', status: 401 };
  if (session.role !== 'super_admin' && session.role !== 'partner') {
    return { error: FORBIDDEN, status: 403 };
  }

  return { session, admin: createAdminClient() };
}
