import { redirect } from 'next/navigation';

import { BottomNav } from '@/components/portal/bottom-nav';
import { createClient } from '@/lib/supabase/server';

/** Layout terproteksi: hanya user yang sudah login Supabase. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}
