import { redirect } from 'next/navigation';

import ProfileForm from './form';

import { createClient } from '@/lib/supabase/server';
import { getPortalUser } from '@/lib/supabase/session';
import type { Partner } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile — KasirPro Portal' };

export default async function ProfilePage() {
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
    <ProfileForm
      initial={{
        nama_toko: partner?.nama_toko ?? '',
        no_hp: partner?.no_hp ?? '',
        alamat: partner?.alamat ?? '',
        logo_url: partner?.logo_url ?? null,
      }}
      email={user.email}
      totalTerjual={partner?.total_terjual ?? 0}
      quota={partner?.license_quota ?? 0}
    />
  );
}