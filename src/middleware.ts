import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/**
 * Middleware: refresh sesi Supabase + proteksi route.
 *  - /dashboard/*  -> harus login sebagai partner / super_admin
 *  - /admin/*      -> harus super_admin
 *  - /pos/*        -> TIDAK butuh login (POS client offline-first, aktivasi via Serial Key)
 */
const PROTECTED: { prefix: string; roles: string[] }[] = [
  { prefix: '/admin', roles: ['super_admin'] },
  { prefix: '/dashboard', roles: ['partner', 'super_admin'] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) selalu refresh cookie sesi Supabase
  let response = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient(
    env.supabaseUrl || 'http://127.0.0.1:54321',
    env.supabaseAnonKey || 'public-anon-key',
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: req.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  } catch {
    user = null;
  }

  const rule = PROTECTED.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));

  if (rule) {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile?.role as string) ?? 'owner';
    const isActive = profile?.is_active !== false;

    if (!isActive) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'Akun dinonaktifkan. Hubungi admin.');
      return NextResponse.redirect(url);
    }

    if (!rule.roles.includes(role)) {
      const url = req.nextUrl.clone();
      // super_admin yang salah masuk ke /dashboard -> arahkan ke panel admin
      url.pathname = role === 'super_admin' ? '/admin' : '/pos';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // redirect root berdasarkan role
  if (pathname === '/' || pathname === '') {
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const role = (profile?.role as string) ?? 'owner';
      const url = req.nextUrl.clone();
      url.pathname = role === 'super_admin' ? '/admin' : role === 'partner' ? '/dashboard' : '/pos';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)'],
};
