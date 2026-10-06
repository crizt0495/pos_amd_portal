import { redirect } from 'next/navigation';

import ProfileForm from './form';

import { getLanggananToko } from '@/lib/supabase/langganan';
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
  // Daftar langganan dipakai di section "Riwayat Komisi Langganan".
  const [stats, langganan] = await Promise.all([
    getTokoStats(user.id, false),
    getLanggananToko(user.id),
  ]);
  const { partner, terjual, sisa } = stats;

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
      langganan={langganan}
    />
  );
}