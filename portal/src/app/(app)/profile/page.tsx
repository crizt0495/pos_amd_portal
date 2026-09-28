import { redirect } from 'next/navigation';

import ProfileForm from './form';

import { createClient } from '@/lib/supabase/server';
import type { Partner } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile — KasirPro Portal' };

export default async function ProfilePage() {
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

  const { data: licenseRows } = await supabase
    .from('licenses')
    .select('komisi')
    .eq('partner_id', partner?.id ?? '00000000-0000-0000-0000-000000000000');

  const totalKomisi = (licenseRows ?? []).reduce(
    (sum, row) => sum + Number((row as { komisi: number }).komisi ?? 0),
    0,
  );

  return (
    <ProfileForm
      initial={{
        nama_toko: partner?.nama_toko ?? '',
        no_hp: partner?.no_hp ?? '',
        alamat: partner?.alamat ?? '',
        logo_url: partner?.logo_url ?? null,
      }}
      email={user.email ?? ''}
      totalTerjual={partner?.total_terjual ?? 0}
      quota={partner?.license_quota ?? 0}
      totalKomisi={totalKomisi}
    />
  );
}
