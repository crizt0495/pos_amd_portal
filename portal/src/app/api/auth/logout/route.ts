import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout — hapus sesi Supabase lalu kembali ke /login. */
export async function POST(req: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
}
