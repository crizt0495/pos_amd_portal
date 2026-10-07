'use client';

import { rupiah, tanggalPanjang } from '@/lib/format';
import type { LanggananToko } from '@/lib/supabase/langganan';

/**
 * Daftar langganan — TAMPILAN INFO SAJA.
 *
 * Tombol "Perpanjang +1 Tahun" sudah dipindah ke Admin Portal (menu Key):
 * yang mencatat perpanjangan itu ADMIN, bukan toko. Toko cukup melihat riwayat
 * komisi yang sudah dicatat. Pembayaran bulanan masuk dari sisi server; toko
 * tidak mencatat manual dan tidak bisa men-spam tombol apa pun di sini.
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
                {item.expires_at ? ` · expired ${tanggalPanjang(item.expires_at)}` : ''}
              </p>
              <p className="mt-1 text-[10px] text-zinc-400">
                Komisi otomatis dicatat admin, toko cukup lihat. Tidak perlu mencet manual.
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
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
