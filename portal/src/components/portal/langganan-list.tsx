'use client';

import * as React from 'react';
import { rupiah, tanggalPanjang } from '@/lib/format';
import type { LanggananToko } from '@/lib/supabase/langganan';

/**
 * Daftar langganan + status pembayaran bulan berjalan.
 *
 * Tampilannya hanya BACA (read-only): tidak ada tombol "Catat Bulan
 * Berikutnya" di sini karena komisi langganan masuk otomatis dari server
 * (webhook/cron pembayaran langganan pelanggan), bukan dari toko menekan
 * tombol. Endpoint /api/langganan masih ada untuk dipanggil manual oleh
 * admin/cron, tapi tidak lagi dipakai dari UI toko.
 */
export function LanggananList({ data }: { data: LanggananToko[] }) {
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
              </p>
            </div>

            {item.selesai ? null : (
              <div
                className="shrink-0 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-right text-[11px] font-semibold text-zinc-600"
                title={`Komisi bulan ${item.bulanBerikutnya} akan masuk otomatis saat pelanggan membayar. Toko tidak perlu mencatat manual.`}
              >
                <span className="block leading-tight">
                  Bulan {item.bulanBerikutnya} · {rupiah(item.komisiBerikutnya)}
                </span>
                <span className="block text-[10px] font-medium text-zinc-500">
                  Menunggu pembayaran
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
