import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { env } from '@/lib/env';

/**
 * Proteksi route + refresh sesi dengan biaya jaringan minimal.
 *
 *  - /home, /aktivasi, /profile  -> wajib login (redirect ke /login)
 *  - /login                      -> kalau sudah ada sesi, lempar ke /home
 *
 * Memakai `auth.getSession()` (decode JWT dari cookie — TANPA panggilan
 * jaringan) ketika token masih valid; refresh token ke Supabase hanya terjadi
 * bila token kedaluwarsa (± tiap 1 jam). Tanpa cookie sesi: tidak ada
 * jaringan sama sekali. Validasi token sungguhan tetap dilakukan `getUser()`
 * di halaman/route handler (token palsu -> halaman mengalihkan ke /login).
 */
const PROTECTED = ['/home', '/aktivasi', '/profile'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let response = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey || 'public-anon-key', {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: req.headers } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as never),
        );
      },
    },
  });

  // Tanpa cookie sesi = pasti belum login; hindari memuat klien & refresh.
  const hasSessionCookie = req.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  let hasSession = false;
  if (hasSessionCookie) {
    try {
      const { data } = await supabase.auth.getSession();
      hasSession = !!data.session;
    } catch {
      hasSession = false;
    }
  }

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/home';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|icons/|sw.js|workbox-|manifest.json|api/activate|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)',
  ],
};