import { redirect } from 'next/navigation';

import AktivasiForm from './form';
import { LanggananList } from '@/components/portal/langganan-list';

import { getLanggananToko } from '@/lib/supabase/langganan';
import { getPortalUser } from '@/lib/supabase/session';
import { getTokoStats } from '@/lib/supabase/toko-stats';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Aktivasi — KasirPro Portal' };

export default async function AktivasiPage() {
  const user = await getPortalUser();
  if (!user) redirect('/login');

  // Sisa kuota & daftar langganan. Dua permintaan ini dijadwalkan bareng: dua
  //-duanya cuma butuh user.id dan tidak saling bergantung.
  //
  // Sisa kuota lewat `getTokoStats` (bukan baca `partners` sendiri) supaya
  // angkanya dijamin sama dengan yang muncul di Home.
  const [stats, langganan] = await Promise.all([
    getTokoStats(user.id, false),
    getLanggananToko(user.id),
  ]);

  return (
    <main className="app-content">
      <AktivasiForm quota={stats.sisa} />

      {/* Section komisi langganan. Dipisah dari form generate key supaya
          jelas bedanya: form membuat key, section ini mencatat pembayaran
          langganan yang sudah berjalan. */}
      <section className="mt-8">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold">Komisi Langganan</h2>
          <span className="text-[11px] text-zinc-500">
            {langganan.length} langganan aktif
          </span>
        </div>

        <p className="mb-2.5 text-[12px] text-zinc-500">
          Setiap pelanggan langganan yang membayar, tekan tombolnya supaya komisi bulan itu masuk ke
          Total Komisi.
        </p>

        <LanggananList data={langganan} />
      </section>
    </main>
  );
}
