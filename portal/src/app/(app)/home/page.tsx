import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { KeyList } from '@/components/portal/key-list';
import { ProfileMenu } from '@/components/portal/profile-menu';
import { createClient } from '@/lib/supabase/server';
import { getPortalUser } from '@/lib/supabase/session';
import { tierOf, tierRangeLabel } from '@/lib/commission';
import { rupiah } from '@/lib/format';
import type { License, Partner } from '@/types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Home — KasirPro Portal' };

export default async function HomePage() {
  const user = await getPortalUser();
  if (!user) redirect('/login');

  // Satu panggilan database: partner + lisensi terbarunya (embedded PostgREST).
  const supabase = createClient();
  const { data: partnerRow } = await supabase
    .from('partners')
    .select(
      'id, nama_toko, total_terjual, license_quota, licenses(order: created_at.desc, limit: 20, created_at, paket_type, pembeli_nama, pembeli_hp, alamat, komisi_amount, status, serial_key)',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  const partner = (partnerRow ?? null) as (Partner & { licenses?: License[] }) | null;
  const licenses = (partner?.licenses ?? []) as License[];

  const namaToko = partner?.nama_toko ?? 'Toko Saya';
  const sisa = partner?.license_quota ?? 0;
  const total = sisa + (partner?.total_terjual ?? 0); // kuota awal = sisa + yang sudah terjual
  const bundleCount = licenses.filter((l) => l.paket_type === 'bundle').length;
  const appCount = licenses.filter((l) => l.paket_type === 'app_only').length;
  const totalKomisi = licenses.reduce((sum, l) => sum + Number(l.komisi_amount ?? 0), 0);
  const tier = tierOf(partner?.total_terjual ?? 0);

  return (
    <main className="app-content">
      {/* Header: kiri "Home", kanan menu profil (avatar -> dropdown) */}
      <header className="mb-5 flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold leading-none">Home</h1>
        <ProfileMenu namaToko={namaToko} email={user.email} />
      </header>

      {/* Kartu statistik 3 kolom */}
      <section className="grid grid-cols-3 gap-2.5">
        <StatCard value={`${sisa}/${total}`} label="Sisa" />
        <StatCard value={String(bundleCount)} label="Bundle" />
        <StatCard value={String(appCount)} label="Aplikasi" />
      </section>

      {/* Kartu hitam total komisi */}
      <section className="mt-3 rounded-2xl bg-zinc-900 p-4 text-white shadow-card">
        <p className="text-[12px] font-medium text-zinc-400">Total Komisi</p>
        <p className="tabular mt-1 text-[28px] font-bold leading-tight">
          {rupiah(totalKomisi)}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> Tier {tier.name} · komisi {tier.rate * 100}%
          </span>
          <span>{tierRangeLabel(tier)}</span>
        </div>
      </section>

      {/* Riwayat key + komisi */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Riwayat Key</h2>
          <span className="text-[11px] text-zinc-500">{licenses.length} transaksi terakhir</span>
        </div>

        <KeyList licenses={licenses} namaToko={namaToko} />
      </section>
    </main>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="card-soft px-2 py-4 text-center">
      <span className="tabular block text-[24px] font-bold leading-none text-zinc-900">{value}</span>
      <span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
    </div>
  );
}

