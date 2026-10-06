'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, RefreshCw } from 'lucide-react';

import { rupiah, tanggalPanjang } from '@/lib/format';
import { useButtonGuard, useClickCooldown } from '@/lib/useButtonGuard';
import type { LanggananToko } from '@/lib/supabase/langganan';
import type { CatatLanggananResponse } from '@/types';

/**
 * Daftar langganan + tombol "Catat Bulan Berikutnya".
 *
 * Alur pakainya begini: pelanggan bayar_langganan bulan ini -> toko buka
 * halaman ini -> menekan tombol -> komisi bulan itu masuk ke Total Komisi di
 * Home. Nomor bulan dan nominal komisi ditentukan server (RPC
 * `catat_langganan_bulan`), jadi mengetuk tombol dua kali tidak bisa
 * menghasilkan komisi ganda: RPC menolak bulan yang sudah tercatat.
 */
export function LanggananList({ data }: { data: LanggananToko[] }) {
  const router = useRouter();
  const aksi = useClickCooldown(1500);
  const [error, setError] = React.useState<string | null>(null);
  const [sukses, setSukses] = React.useState<string | null>(null);

  // Setelah mutate, server harus dirender ulang supaya angka bulan, komisi,
  // dan badge di Home ikut berubah. `cache()` di server_component request
  // hanya berlaku satu render, jadi refresh memang wajib dipanggil.
  async function catat(item: LanggananToko) {
    setError(null);
    setSukses(null);

    try {
      const res = await fetch('/api/langganan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_id: item.id }),
      });
      const json = (await res.json()) as CatatLanggananResponse;

      if (!json.ok) {
        setError(json.message);
        return;
      }

      setSukses(`${item.pembeli_nama}: komisi bulan ${item.bulanBerikutnya} tercatat.`);
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
          <li key={item.id} className="flex items-center gap-3 px-3.5 py-3">
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
              </p>
            </div>

            {item.selesai ? null : (
              <button
                type="button"
                onClick={() => aksi.run(() => void catat(item), item.id)}
                disabled={aksi.locked(item.id)}
                title={`Catat komisi bulan ${item.bulanBerikutnya}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Bulan {item.bulanBerikutnya} · {rupiah(item.komisiBerikutnya)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
