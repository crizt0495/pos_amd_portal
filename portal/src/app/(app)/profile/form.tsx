'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Award,
  Check,
  Crown,
  LogOut,
  Medal,
  Save,
  Store,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { LanggananList } from '@/components/portal/langganan-list';
import { Field, Input, InputTelepon, Textarea } from '@/components/ui/form';
import { bersihkanTelepon } from '@/lib/format';
import { cekAlamat, cekTelepon, namaValid } from '@/lib/validasi';
import { useButtonGuard, useClickCooldown } from '@/lib/useButtonGuard';
import {
  tierDariBaris,
  tierRangeLabel,
  tierRangePendek,
  tierRateLabel,
  type BarisTier,
} from '@/lib/commission';
import { cn } from '@/lib/utils';

interface Props {
  initial: { nama_toko: string; no_hp: string; alamat: string };
  email: string;
  totalTerjual: number;
  quota: number;
  langganan: import('@/lib/supabase/langganan').LanggananToko[];
  /** Tier aktif dari database; `null` = belum diatur admin. */
  tierAktif: BarisTier | null;
  /** Seluruh aturan tier dari database, untuk kotak tier. */
  tierSemua: BarisTier[];
}

/** Warna bulatan icon toko mengikuti tier toko (Bronze → Platinum). */
const TIER_ICON_BG: Record<string, string> = {
  Bronze: 'bg-amber-800',
  Silver: 'bg-zinc-400',
  Gold: 'bg-yellow-500',
  Platinum: 'bg-slate-800',
};

const TIER_ICON_FALLBACK = 'bg-zinc-400';

export default function ProfileForm({
  initial,
  email,
  totalTerjual,
  quota,
  langganan,
  tierAktif,
  tierSemua,
}: Props) {
  const router = useRouter();

  const [namaToko, setNamaToko] = React.useState(initial.nama_toko);
  const [noHp, setNoHp] = React.useState(initial.no_hp);
  const [alamat, setAlamat] = React.useState(initial.alamat);

  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  /* Penjaga klik-ganda: 1 klik = 1 permintaan, tombol terkunci 1,5 detik. */
  const simpan = useButtonGuard();
  const ui = useClickCooldown(1500);
  const saving = simpan.busy;

  /* Tier + persen dari database (via getTokoStats). `null` = belum diatur
     admin, dan itu memang ditampilkan begitu — bukan diganti Bronze 5%. */
  const tier = tierAktif ? tierDariBaris(tierAktif) : null;
  const semuaTier = React.useMemo(() => tierSemua.map(tierDariBaris), [tierSemua]);

  /* ----------------------------- validasi ----------------------------- */
  const namaError = React.useMemo(() => {
    const n = namaToko.trim();
    if (n.length === 0) return '';
    if (!namaValid(n)) return 'Nama toko minimal 3 karakter.';
    return '';
  }, [namaToko]);
  // No HP opsional: kosong = aman, tapi bila diisi harus pola 08xx.
  const noHpError = React.useMemo(() => cekTelepon(noHp), [noHp]);
  // Alamat opsional: bila diisi, minimal 10 karakter.
  const alamatError = React.useMemo(() => {
    const a = alamat.trim();
    if (a.length === 0) return '';
    return cekAlamat(a);
  }, [alamat]);

  // Nama toko wajib; No HP & Alamat opsional (bila diisi harus valid).
  // Pakai hasil validasi di atas supaya opsionalitasnya benar-benar berlaku —
  // memanggil cekAlamat() langsung di sini akan memaksa alamat terisi.
  const isFormValid = React.useMemo(
    () => namaValid(namaToko) && noHpError === '' && alamatError === '',
    [namaToko, noHpError, alamatError],
  );

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (saving) {
      setMessage({ tone: 'error', text: 'Mohon tunggu… penyimpanan sebelumnya sedang diproses.' });
      return;
    }
    if (!isFormValid) {
      setMessage({ tone: 'error', text: 'Periksa lagi nama toko, no HP, dan alamat.' });
      return;
    }

    void simpan.guard(kirimProfil, {
      pesanTunggu: 'Profil sedang disimpan…',
      onBlocked: (pesan) => setMessage({ tone: 'error', text: pesan }),
      onError: (err) =>
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal menyimpan.' }),
    });
  }

  async function kirimProfil() {
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama_toko: namaToko.trim(),
          no_hp: bersihkanTelepon(noHp),
          alamat: alamat.trim(),
        }),
      });

      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setMessage({ tone: 'error', text: json.message || 'Gagal menyimpan profil.' });
        return;
      }

      setMessage({ tone: 'ok', text: 'Profil toko tersimpan.' });
      router.refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal menyimpan.' });
    }
  }

  return (
    <main className="app-content">
      <header className="mb-5">
        <h1 className="text-[22px] font-bold leading-none">Profile</h1>
        <p className="mt-2 text-[13px] text-zinc-500">Data toko &amp; penghargaan komisi Anda.</p>
      </header>

      {/* Icon toko statis — warna bulatan mengikuti tier. */}
      <section className="mb-6 flex flex-col items-center py-6">
        <div
          className={cn(
            'grid h-24 w-24 place-items-center rounded-full',
            tier ? (TIER_ICON_BG[tier.nama] ?? TIER_ICON_FALLBACK) : TIER_ICON_FALLBACK,
          )}
        >
          <Store size={44} className="text-white" aria-hidden="true" />
        </div>
        <p className="mt-2 text-sm text-gray-500">{namaToko.trim() || 'DEMO Toko Berkah'}</p>
      </section>

      {/* Form toko */}
      <form onSubmit={onSave} className="space-y-4" noValidate>
        <Field label="Nama Toko" htmlFor="nama_toko" error={namaError}>
          <Input
            id="nama_toko"
            placeholder="Nama toko komputer"
            value={namaToko}
            onChange={(e) => setNamaToko(e.target.value)}
            maxLength={80}
            aria-invalid={Boolean(namaError)}
            className={cn(namaError && 'input-invalid')}
          />
        </Field>

        <Field label="No HP" htmlFor="no_hp" error={noHpError} hint="Opsional, contoh: 081234567890">
          <InputTelepon
            id="no_hp"
            placeholder="08xxxxxxxxxx"
            value={noHp}
            onChange={setNoHp}
            aria-invalid={Boolean(noHpError)}
            className={cn(noHpError && 'input-invalid')}
          />
        </Field>

        <Field label="Alamat" htmlFor="alamat" error={alamatError}>
          <Textarea
            id="alamat"
            placeholder="Alamat lengkap toko"
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            maxLength={240}
            aria-invalid={Boolean(alamatError)}
            className={cn(alamatError && 'input-invalid')}
          />
        </Field>

        {/* Info akun: read-only, jadi dikotak agar jelas bukan bagian form. */}
        <div className="rounded-xl bg-gray-50 p-4 text-[12px] text-zinc-500">
          <div className="flex items-center justify-between">
            <span>Email akun</span>
            <span className="font-semibold text-zinc-700">{email}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span>Total terjual</span>
            <span className="tabular font-semibold text-zinc-700">{totalTerjual} key</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span>Sisa kuota</span>
            <span className="tabular font-semibold text-zinc-700">{quota} key</span>
          </div>
        </div>

        {/* Sticky: di HP tombol nempel 80px di atas BottomNav (fixed),
            jadi tak perlu scroll jauh cuma untuk menekan Simpan. */}
        <Button
          type="submit"
          loading={saving}
          disabled={!isFormValid}
          className="sticky bottom-[80px] z-10 h-auto w-full !bg-black py-3.5"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Menyimpan…' : 'Simpan'}
        </Button>

        {message ? (
          <div
            className={cn(
              'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[13px]',
              message.tone === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700',
            )}
          >
            {message.tone === 'ok' ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        ) : null}
      </form>

      {/* Riwayat Komisi Langganan — dipindah dari Aktivasi ke Profile */}
      <section className="mt-8">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-bold">Riwayat Komisi Langganan</h2>
          <span className="text-[11px] text-zinc-500">
            {langganan.length} langganan aktif
          </span>
        </div>
        <p className="mb-2.5 text-[12px] text-zinc-500" title="Komisi dicairkan per bulan, ditotal per tahun">
          Setiap pelanggan langganan yang sudah membayar, komisi bulanannya masuk otomatis ke Total
          Komisi. Toko cukup lihat, tidak perlu mencatat manual. (Paket langganan = 12 bulan;
          komisi cair per bulan, ditotal per tahun.)
        </p>
        <LanggananList data={langganan} />
      </section>

      {/* Penghargaan Title */}
      <section className="mb-20 mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-zinc-500" />
          <h2 className="text-[15px] font-bold">Penghargaan Title</h2>
        </div>

        <div className="rounded-2xl bg-zinc-900 p-4 text-white">
          <p className="text-[11px] text-zinc-400">Tier Anda</p>
          <p className="mt-0.5 flex items-center gap-2 text-[20px] font-bold">
            <Medal className="h-5 w-5" /> {tier ? tier.nama : 'Belum diatur admin'}
          </p>
          <p className="mt-1 text-[12px] text-zinc-300">
            {tier
              ? `Komisi ${tierRateLabel(tier)} · ${tierRangeLabel(tier)} · ${
                  tier.max === null
                    ? 'selalu aktif'
                    : `${Math.max(0, tier.max - totalTerjual)} key lagi`
                }`
              : 'Persentase komisi belum diatur admin di database.'}
          </p>
        </div>

        {/* 4 card tier. Keterangan rentang lisensi DI DALAM card, bukan teks
            panjang terpisah di bawahnya — supaya tidak dobel dengan box hitam
            "Tier Anda" yang sudah menyebut rentang + sisa key. Tier aktif
            diberi border hitam tebal, sisanya border tipis. */}
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {semuaTier.map((t) => {
            const current = tier !== null && t.nama === tier.nama;
            return (
              <li
                key={t.nama}
                className={cn(
                  'flex flex-col items-center rounded-xl p-3 text-center transition',
                  current
                    ? 'border-2 border-black bg-white'
                    : 'border border-gray-100 bg-gray-50',
                )}
              >
                <span
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full',
                    t.chipBg,
                    !current && 'opacity-50',
                  )}
                >
                  <Crown className="h-4 w-4" style={{ color: t.color }} strokeWidth={2.5} />
                </span>
                <span
                  className={cn(
                    'mt-1 text-xs font-bold leading-none',
                    current ? 'text-zinc-900' : 'text-zinc-500',
                  )}
                >
                  {t.nama}
                </span>
                <span
                  className={cn(
                    'tabular mt-1 text-[11px] font-semibold leading-none',
                    current ? 'text-zinc-900' : 'text-zinc-600',
                  )}
                >
                  {tierRateLabel(t)}
                </span>
                <span className="mt-1 text-[9px] leading-tight text-gray-500">
                  {tierRangePendek(t)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <form
        action="/api/auth/logout"
        method="post"
        className="mt-8"
        onSubmit={(e) => {
          // Cegah logout ganda: klik kedua dalam 1,5 detik tidak di-forward.
          if (ui.locked('keluar')) {
            e.preventDefault();
            return;
          }
          ui.run(() => undefined, 'keluar');
        }}
      >
        <Button type="submit" variant="outline" disabled={ui.locked('keluar')}>
          <LogOut className="h-4 w-4" /> Keluar
        </Button>
      </form>
    </main>
  );
}
