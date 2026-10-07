import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { KeyList } from '@/components/portal/key-list';
import { ProfileMenu } from '@/components/portal/profile-menu';
import { tierRangeLabel, tierRateLabel } from '@/lib/commission';
import { rupiah } from '@/lib/format';
import { getPortalUser } from '@/lib/supabase/session';
import { getTokoStats } from '@/lib/supabase/toko-stats';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Home — KasirPro Portal' };

export default async function HomePage() {
  const user = await getPortalUser();
  if (!user) redirect('/login');

  // Satu sumber angka untuk Home & Profile (sisa kuota, total terjual, komisi).
  const {
    partner,
    sisa,
    terjual,
    kuotaAwal,
    komisiTotal,
    komisiPenjualan,
    komisiLangganan,
    tier,
    licenses,
    bundleCount,
    appCount,
    langgananPerKey,
  } = await getTokoStats(user.id);

  const namaToko = partner?.nama_toko ?? 'Toko Saya';

  return (
    <main className="app-content">
      {/* Header: kiri "Home", kanan menu profil (avatar -> dropdown) */}
      <header className="mb-5 flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold leading-none">Home</h1>
        <ProfileMenu namaToko={namaToko} email={user.email} />
      </header>

      {/* Kartu statistik 3 kolom */}
      <section className="grid grid-cols-3 gap-2.5">
        <StatCard
          value={`${sisa}/${terjual}`}
          label="Sisa / Terjual"
          sub={`dari ${kuotaAwal} kuota`}
        />
        <StatCard value={String(bundleCount)} label="Bundle" />
        <StatCard value={String(appCount)} label="Aplikasi" />
      </section>

      {/* Kartu hitam total komisi */}
      <section className="mt-3 rounded-2xl bg-zinc-900 p-4 text-white shadow-card">
        <p className="text-[12px] font-medium text-zinc-400">Total Komisi</p>
        <p className="tabular mt-1 text-[28px] font-bold leading-tight">
          {rupiah(komisiTotal)}
        </p>

        {/* Rincian hanya tampil kalau memang ada komisi langganan, supaya
            kartu tidak menambah baris kosong untuk toko tanpa langganan. */}
        {komisiLangganan > 0 ? (
          <p className="tabular mt-1 text-[11px] text-zinc-400">
            Penjualan {rupiah(komisiPenjualan)} · Langganan {rupiah(komisiLangganan)}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" />{' '}
            {tier
              ? `Tier ${tier.nama} · komisi ${tierRateLabel(tier)}`
              : 'Tier belum diatur admin'}
          </span>
          <span>{tier ? tierRangeLabel(tier) : ''}</span>
        </div>
      </section>

      {/* Riwayat key + komisi */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Riwayat Key</h2>
          <span className="text-[11px] text-zinc-500">{licenses.length} transaksi terakhir</span>
        </div>

        <KeyList
          licenses={licenses}
          namaToko={namaToko}
          langgananPerKey={langgananPerKey}
        />
      </section>
    </main>
  );
}

/**
 * Kartu angka. `value` boleh berisi pembatas (mis. "5/8"), `sub` baris kecil
 * di bawah label — dipakai kartu Sisa/Terjual untuk menyebut kuota awal, jadi
 * jelas mana sisa, mana yang sudah terjual.
 */
function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="card-soft px-2 py-4 text-center">
      <span className="tabular block text-[24px] font-bold leading-none text-zinc-900">{value}</span>
      <span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {sub ? <span className="mt-0.5 block text-[10px] text-zinc-400">{sub}</span> : null}
    </div>
  );
}
