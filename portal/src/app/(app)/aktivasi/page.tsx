import { redirect } from 'next/navigation';

import AktivasiForm from './form';

import { createClient } from '@/lib/supabase/server';
import { getPortalUser } from '@/lib/supabase/session';
import type { Partner } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Aktivasi — KasirPro Portal' };

export default async function AktivasiPage() {
  const user = await getPortalUser();
  if (!user) redirect('/login');

  const supabase = createClient();
  const { data: partnerRow } = await supabase
    .from('partners')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  const partner = (partnerRow ?? null) as Partner | null;

  return (
    <AktivasiForm quota={partner?.license_quota ?? 0} totalTerjual={partner?.total_terjual ?? 0} />
  );
}