import { redirect } from 'next/navigation';

import AktivasiForm from './form';

import { getPortalUser } from '@/lib/supabase/session';
import { getTokoStats } from '@/lib/supabase/toko-stats';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Aktivasi — KasirPro Portal' };

export default async function AktivasiPage() {
  const user = await getPortalUser();
  if (!user) redirect('/login');

  // Sisa kuota saja, tidak perlu daftar langganan ke Aktivasi (sekarang ada
  // di Profile).
  const stats = await getTokoStats(user.id, false);

  return (
    <main className="app-content">
      <AktivasiForm quota={stats.sisa} />
    </main>
  );
}
