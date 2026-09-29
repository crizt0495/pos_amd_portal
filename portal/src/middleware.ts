import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { env } from '@/lib/env';

/**
 * Refresh sesi Supabase + proteksi route.
 *  - /home, /aktivasi, /profile  -> wajib login
 *  - /login                      -> kalau sudah login, lempar ke /home
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

  let user: { id: string } | null = null;
  // Tanpa cookie sesi berarti pasti belum login — tidak perlu hubungi
  // Supabase (hemat 1 round-trip di tiap request anonymous, contoh /login).
  const hasSessionCookie = req.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  if (hasSessionCookie) {
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user ?? null;
    } catch {
      user = null;
    }
  }

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && user) {
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
