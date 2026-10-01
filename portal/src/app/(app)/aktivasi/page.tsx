import { redirect } from 'next/navigation';

import AktivasiForm from './form';

import { createClient } from '@/lib/supabase/server';
import { getPortalUser } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Aktivasi — KasirPro Portal' };

export default async function AktivasiPage() {
  const user = await getPortalUser();
  if (!user) redirect('/login');

  const supabase = createClient();
  const { data: partnerRow } = await supabase
    .from('partners')
    .select('license_quota')
    .eq('user_id', user.id)
    .maybeSingle();

  return <AktivasiForm quota={partnerRow?.license_quota ?? 0} />;
}