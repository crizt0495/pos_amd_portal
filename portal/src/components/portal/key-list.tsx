'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Copy, KeyRound, MessageCircle, Search, X } from 'lucide-react';

import { PAKET_LABEL } from '@/lib/commission';
import { nomorWa, rupiah, tanggalPanjang, tautanWa } from '@/lib/format';
import { useClickCooldown } from '@/lib/useButtonGuard';
import type { License } from '@/types';

/**
 * Daftar Serial Key toko.
 *
 * Dipisah dari `home/page.tsx` karena halaman itu server component, sedangkan
 * bagian ini butuh interaksi: pencarian, salin, dan tautan WhatsApp.
 *
 * Kolom `alamat` sudah tersimpan sejak awal (lihat `licenses.alamat` di
 * schema.sql) — dulu hanya tidak pernah ditampilkan.
 *
 * `langgananPerKey` berisi bulan langganan terakhir per lisensi, keyed by
 * `license.id`. Kalau sebuah lisensi langganan tidak ada di sana, berarti baru
 * dibuat (bulan 1 sudah dibayar saat pendaftaran), jadi badge tidak menyebut
 * nomor bulan — tidak perlu menebak.
 */
export function KeyList({
  licenses,
  namaToko,
  langgananPerKey = {},
}: {
  licenses: License[];
  namaToko: string;
  langgananPerKey?: Record<string, number>;
}) {
  const [cari, setCari] = React.useState('');
  const aksi = useClickCooldown(1500);
  const [tersalin, setTersalin] = React.useState<string | null>(null);

  const q = cari.trim().toLowerCase();
  const hasil = React.useMemo(() => {
    if (!q) return licenses;
    return licenses.filter((l) => {
      // Serial ikut searched karena غالبanya itu yang dicari toko.
      return (
        l.pembeli_nama.toLowerCase().includes(q) ||
        (l.alamat ?? '').toLowerCase().includes(q) ||
        l.serial_key.toLowerCase().includes(q)
      );
    });
  }, [licenses, q]);

  // Batalkan label "Tersalin" sendiri setelah beberapa detik.
  React.useEffect(() => {
    if (!tersalin) return;
    const t = window.setTimeout(() => setTersalin(null), 2500);
    return () => window.clearTimeout(t);
  }, [tersalin]);

  async function salinDanWA(l: License) {
    const pesan =
      `Halo ${namaToko} di sini. Serial Key Anda: ${l.serial_key}. ` +
      'Silakan aktivasi di Komputer Kasir. Terima kasih!';

    // Selalu salin dulu, supaya tetap berguna walau tidak ada nomor WhatsApp.
    try {
      await navigator.clipboard.writeText(l.serial_key);
      setTersalin(l.id);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = l.serial_key;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setTersalin(l.id);
    }

    const nomor = nomorWa(l.pembeli_hp);
    if (nomor) {
      window.open(tautanWa(nomor, pesan), '_blank', 'noopener,noreferrer');
    }
  }

  /* ----------------------------- kosong ----------------------------- */
  if (licenses.length === 0) {
    return (
      <div className="card-soft px-4 py-8 text-center">
        <KeyRound className="mx-auto h-6 w-6 text-zinc-300" />
        <p className="mt-2 text-[13px] font-medium text-zinc-600">Belum ada key</p>
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
    );
  }

  return (
    <>
      {/* Pencarian — menyaring daftar yang sudah dimuat (20 key terbaru). */}
      <div className="relative mb-2.5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, alamat, atau serial…"
          aria-label="Cari key"
          className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-9 text-[13px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 [&::-webkit-search-cancel-button]:hidden"
        />
        {cari ? (
          <button
            type="button"
            onClick={() => setCari('')}
            aria-label="Bersihkan pencarian"
            className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {q ? (
        <p className="mb-2.5 text-[11px] text-zinc-500">
          {hasil.length} dari {licenses.length} key cocok dengan “{cari.trim()}”
        </p>
      ) : null}

      {hasil.length === 0 ? (
        <div className="card-soft px-4 py-8 text-center">
          <Search className="mx-auto h-6 w-6 text-zinc-300" />
          <p className="mt-2 text-[13px] font-medium text-zinc-600">Tidak ada yang cocok</p>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Hanya 20 key terbaru yang dimuat. Coba kata kunci lain.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-100 bg-white">
          {hasil.map((l) => {
            const adaWa = Boolean(nomorWa(l.pembeli_hp));
            const baruTersalin = tersalin === l.id;

            return (
              <li key={l.id} className="px-3.5 py-3 transition hover:bg-zinc-50">
                <div className="flex items-start justify-between gap-2">
                  {/* Kolom kiri: detail transaksi */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] leading-relaxed text-zinc-600">
                      {tanggalPanjang(l.created_at)} - {PAKET_LABEL[l.paket_type]} -{' '}
                      {l.pembeli_nama}
                    </p>

                    {/* Baris harga acuan + alamat */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-zinc-500">
                      {l.harga_jual ? (
                        <span className="tabular shrink-0">Harga {rupiah(l.harga_jual)}</span>
                      ) : null}
                      {l.alamat ? (
                        <span title={l.alamat} className="min-w-0 truncate">
                          {l.alamat}
                        </span>
                      ) : null}
                    </div>

                    {/* Badge status + jenis + serial key. Serial boleh
                        truncate tapi jangan sembunyi: max-width cukup supaya
                        masih kelihatan di layar HP 360px. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={l.status} />
                      <JenisBadge
                        licenseType={l.license_type}
                        bulan={langgananPerKey[l.id] ?? 0}
                      />
                      <code className="tabular max-w-[150px] truncate text-[11px] tracking-wide text-zinc-500">
                        {l.serial_key}
                      </code>
                    </div>
                  </div>

                  {/* Kolom kanan: komisi (rata kanan, bold) + tombol Salin & WA */}
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[13px] font-bold leading-tight text-zinc-900">
                      {rupiah(l.komisi_amount)}
                    </p>
                    <button
                      type="button"
                      onClick={() => aksi.run(() => void salinDanWA(l), l.id)}
                      disabled={aksi.locked(l.id)}
                      title={
                        adaWa
                          ? 'Salin serial key lalu buka WhatsApp pembeli'
                          : 'Salin serial key (nomor pembeli tidak ada)'
                      }
                      className="mt-1 ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-200 active:scale-95 disabled:opacity-50"
                    >
                      {baruTersalin ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : adaWa ? (
                        <MessageCircle className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {baruTersalin ? 'Tersalin' : 'Salin & WA'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; className: string }> = {
    unused: { text: 'Belum dipakai', className: 'bg-amber-50 text-amber-700' },
    active: { text: 'Aktif di kasir', className: 'bg-emerald-50 text-emerald-700' },
    blocked: { text: 'Diblokir', className: 'bg-red-50 text-red-700' },
    // text-zinc-600, bukan text-zinc-500: di atas bg-zinc-100, zinc-500 hanya
    // 4,40:1 dan gagal WCAG AA (butuh 4,50:1).
    revoked: { text: 'Dicabut', className: 'bg-zinc-100 text-zinc-600' },
  };
  const s = map[status] ?? map.unused!;
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${s.className}`}>
      {s.text}
    </span>
  );
}

/**
 * Badge jenis pembelian: Sekali Bayar atau Langganan.
 *
 * Untuk langganan yang bulan 2 dan seterusnya sudah dibayar, labelnya
 * menyebut nomor bulan ("Langganan · Bulan 3") supaya toko bisa langsung tahu
 * pelanggan sudah bayar berapa bulan. Bulan 1 tidak disebut karena sudah
 * tercatat di komisi penjualan saat pendaftaran.
 */
function JenisBadge({ licenseType, bulan }: { licenseType: string; bulan: number }) {
  if (licenseType === 'langganan') {
    return (
      <span
        title={
          bulan > 0
            ? `Langganan, sudah dibayar sampai bulan ${bulan}`
            : 'Langganan, baru dibuat (bulan 1 dibayar saat pendaftaran)'
        }
        className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700"
      >
        {bulan > 0 ? `Langganan · Bulan ${bulan}` : 'Langganan'}
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
      Sekali
    </span>
  );
}
