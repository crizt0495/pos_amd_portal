import { redirect } from 'next/navigation';

import ProfileForm from './form';

import { getPortalUser } from '@/lib/supabase/session';
import { getTokoStats } from '@/lib/supabase/toko-stats';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Profile — KasirPro Portal' };

export default async function ProfilePage() {
  const user = await getPortalUser();
  if (!user) redirect('/login');

  // Angka "Total terjual" & "Sisa kuota" di bawah berasal dari fungsi yang
  // sama dengan Home, jadi keduanya tidak mungkin berbeda. Parameter `false`
  // karena halaman ini tidak butuh daftar key — hemat 3 panggilan database.
  const { partner, terjual, sisa } = await getTokoStats(user.id, false);

  return (
    <ProfileForm
      initial={{
        nama_toko: partner?.nama_toko ?? '',
        no_hp: partner?.no_hp ?? '',
        alamat: partner?.alamat ?? '',
      }}
      email={user.email}
      totalTerjual={terjual}
      quota={sisa}
    />
  );
}