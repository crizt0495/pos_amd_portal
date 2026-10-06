'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, RefreshCw } from 'lucide-react';

import { rupiah, tanggalPanjang } from '@/lib/format';
import { useButtonGuard, useClickCooldown } from '@/lib/useButtonGuard';
import type { LanggananToko } from '@/lib/supabase/langganan';

/**
 * Daftar langganan + tombol "Perpanjang +1 Tahun".
 *
 * Pembayaran bulanan masuk otomatis dari sisi server (cron/webhook); toko
 * tidak perlu mencatat manual. Tombol Perpanjang dipakai saat pelanggan
 * membayar setahun penuh, supaya masa berlaku diperpanjang + komisi tahunan
 * langsung tercatat.
 */
export function LanggananList({ data }: { data: LanggananToko[] }) {
  const router = useRouter();
  const aksi = useClickCooldown(1500);
  const [error, setError] = React.useState<string | null>(null);
  const [sukses, setSukses] = React.useState<string | null>(null);

  async function perpanjang(item: LanggananToko) {
    setError(null);
    setSukses(null);

    try {
      const res = await fetch('/api/langganan/perpanjang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_id: item.id }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        komisi?: number;
      };

      if (!json.ok) {
        setError(json.message ?? 'Gagal memperpanjang.');
        return;
      }

      setSukses(`${item.pembeli_nama}: ${json.message ?? 'Diperpanjang.'}`);
      router.refresh();
    } catch {
      setError('Gagal menghubungi server. Cek koneksi lalu coba lagi.');
    }
  }

  if (data.length === 0) {
    return (
      <p className="card-soft px-4 py-5 text-center text-[12px] text-zinc-500">
        Belum ada langganan. Pilih paket <strong>Langganan</strong> saat membuat key untuk
        mengaktifkan pencatatan komisi bulanan.
      </p>
    );
  }

  return (
    <div>
      {sukses ? (
        <p className="mb-2 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">
          <Check className="h-3.5 w-3.5 shrink-0" /> {sukses}
        </p>
      ) : null}

      {error ? (
        <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-100 bg-white">
        {data.map((item) => (
          <li key={item.id} className="flex items-start gap-3 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-zinc-900">
                {item.pembeli_nama}
              </p>
              <p className="tabular mt-0.5 text-[12px] text-zinc-500">
                {item.selesai
                  ? 'Langganan lengkap 12 bulan'
                  : `Terbayar ${item.bulanTerakhir} bulan · komisi terkumpul ${rupiah(item.komisiTerkumpul)}`}
              </p>
              <p className="tabular mt-0.5 truncate text-[11px] text-zinc-400">
                {item.serial_key} · mulai {tanggalPanjang(item.created_at)}
                {item.expires_at ? ` · expired ${tanggalPanjang(item.expires_at)}` : ''}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {item.selesai ? null : (
                <div
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-right text-[11px] font-semibold text-zinc-600"
                  title={`Komisi bulan ${item.bulanBerikutnya} akan masuk otomatis saat pelanggan membayar.`}
                >
                  <span className="block leading-tight">
                    Bulan {item.bulanBerikutnya} · {rupiah(item.komisiBerikutnya)}
                  </span>
                  <span className="block text-[10px] font-medium text-zinc-500">
                    Menunggu pembayaran
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => aksi.run(() => void perpanjang(item), item.id)}
                disabled={aksi.locked(item.id)}
                title="Pelanggan bayar setahun penuh -> perpanjang expires +1 thn + komisi tahunan"
                className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Perpanjang +1 Tahun
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
