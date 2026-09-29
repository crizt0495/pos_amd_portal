import { redirect } from 'next/navigation';

import AktivasiForm from './form';

import { getPortalSession } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Aktivasi — KasirPro Portal' };

export default async function AktivasiPage() {
  const sesi = await getPortalSession();
  if (!sesi) redirect('/login');

  const partner = sesi.partner;

  return (
    <AktivasiForm quota={partner?.license_quota ?? 0} totalTerjual={partner?.total_terjual ?? 0} />
  );
}