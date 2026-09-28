import { redirect } from 'next/navigation';

import AktivasiForm from './form';

import { createClient } from '@/lib/supabase/server';
import type { Partner } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Aktivasi — KasirPro Portal' };

export default async function AktivasiPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('partners')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const partner = (data ?? null) as Partner | null;

  return (
    <AktivasiForm quota={partner?.license_quota ?? 0} totalTerjual={partner?.total_terjual ?? 0} />
  );
}
