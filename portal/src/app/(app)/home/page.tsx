import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, KeyRound, LogOut, Sparkles } from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { getPortalUser } from '@/lib/supabase/session';
import { PAKET_LABEL, tierOf, tierRangeLabel } from '@/lib/commission';
import { rupiah, tanggalPanjang } from '@/lib/format';
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
      'id, nama_toko, total_terjual, license_quota, licenses(order: created_at.desc, limit: 20, created_at, paket_type, pembeli_nama, komisi_amount, status, serial_key)',
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
      {/* Header: kiri "Home", kanan nama toko -> + icon logout */}
      <header className="mb-5 flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold leading-none">Home</h1>
        <div className="flex items-center gap-1.5">
          <Link
            href="/profile"
            className="flex max-w-[150px] items-center gap-1 rounded-full bg-zinc-100 py-1.5 pl-3 pr-2 text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-200"
          >
            <span className="truncate">{namaToko}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </Link>
          <form id="form-keluar" action="/api/auth/logout" method="post">
            <button
              type="submit"
              aria-label="Keluar"
              title="Keluar"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition hover:bg-zinc-200 active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
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

      {/* Riwayat komisi */}
      <section className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">Riwayat Komisi</h2>
          <span className="text-[11px] text-zinc-500">{licenses.length} transaksi terakhir</span>
        </div>

        {licenses.length === 0 ? (
          <div className="card-soft px-4 py-8 text-center">
            <KeyRound className="mx-auto h-6 w-6 text-zinc-300" />
            <p className="mt-2 text-[13px] font-medium text-zinc-600">Belum ada komisi</p>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              Buat Serial Key pertama di tab Aktivasi.
            </p>
            <Link
              href="/aktivasi"
              className="mt-3 inline-flex h-10 items-center rounded-xl bg-zinc-900 px-4 text-[13px] font-semibold text-white"
            >
              Generate Key
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-100 bg-white">
            {licenses.map((l) => (
              <li key={l.id} className="px-3.5 py-3 transition hover:bg-zinc-50">
                {/* Baris 1: tanggal - paket - nama konsumen */}
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-zinc-600">
                    <span className="truncate">
                      {tanggalPanjang(l.created_at)} - {PAKET_LABEL[l.paket_type]} -{' '}
                      {l.pembeli_nama}
                    </span>
                  </p>
                  {/* Baris 2: komisi rata kanan */}
                  <span className="tabular shrink-0 text-right text-[13px] font-semibold text-zinc-900">
                    {rupiah(l.komisi_amount)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <StatusBadge status={l.status} />
                  <code className="tabular tracking-wide">{l.serial_key}</code>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Anti klik-ganda tanpa hydration: 1 klik = 1 logout, terkunci 1,5 detik. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function () {
  var form = document.getElementById('form-keluar');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    var btn = form.querySelector('button');
    /* Saat terkunci, batal-kan submit supaya tidak ada request kedua yang lolos. */
    if (!btn || btn.disabled) { if (e && e.preventDefault) e.preventDefault(); return; }
    btn.disabled = true;
    window.setTimeout(function () { btn.disabled = false; }, 1500);
  });
})();
`,
        }}
      />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; className: string }> = {
    unused: { text: 'Belum dipakai', className: 'bg-amber-50 text-amber-700' },
    active: { text: 'Aktif di kasir', className: 'bg-emerald-50 text-emerald-700' },
    blocked: { text: 'Diblokir', className: 'bg-red-50 text-red-700' },
    revoked: { text: 'Dicabut', className: 'bg-zinc-100 text-zinc-500' },
  };
  const s = map[status] ?? map.unused!;
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${s.className}`}>
      {s.text}
    </span>
  );
}
