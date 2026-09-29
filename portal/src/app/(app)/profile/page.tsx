import { redirect } from 'next/navigation';

import ProfileForm from './form';

import { getPortalSession } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile — KasirPro Portal' };

export default async function ProfilePage() {
  const sesi = await getPortalSession();
  if (!sesi) redirect('/login');

  const partner = sesi.partner;

  return (
    <ProfileForm
      initial={{
        nama_toko: partner?.nama_toko ?? '',
        no_hp: partner?.no_hp ?? '',
        alamat: partner?.alamat ?? '',
        logo_url: partner?.logo_url ?? null,
      }}
      email={sesi.user.email}
      totalTerjual={partner?.total_terjual ?? 0}
      quota={partner?.license_quota ?? 0}
    />
  );
}