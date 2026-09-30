'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Award,
  Camera,
  Check,
  Crown,
  Loader2,
  LogOut,
  Medal,
  Save,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { bersihkanTelepon, inisial } from '@/lib/format';
import { cekAlamat, cekTelepon, namaValid } from '@/lib/validasi';
import { useButtonGuard, useClickCooldown } from '@/lib/useButtonGuard';
import { TIER_RULES, tierOf, tierRangeLabel } from '@/lib/commission';
import { cn } from '@/lib/utils';

interface Props {
  initial: { nama_toko: string; no_hp: string; alamat: string; logo_url: string | null };
  email: string;
  totalTerjual: number;
  quota: number;
}

const MAX_LOGO = 2 * 1024 * 1024; // 2 MB

export default function ProfileForm({ initial, email, totalTerjual, quota }: Props) {
  const router = useRouter();

  const [namaToko, setNamaToko] = React.useState(initial.nama_toko);
  const [noHp, setNoHp] = React.useState(initial.no_hp);
  const [alamat, setAlamat] = React.useState(initial.alamat);
  const [logoUrl, setLogoUrl] = React.useState(initial.logo_url);
  const [preview, setPreview] = React.useState<string | null>(null);

  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  /* Penjaga klik-ganda: 1 klik = 1 permintaan, tombol terkunci 1,5 detik.
     Simpan & Upload logo punya kunci masing-masing supaya tak saling menghalangi. */
  const simpan = useButtonGuard();
  const unggah = useButtonGuard();
  const ui = useClickCooldown(1500);
  const saving = simpan.busy;
  const uploading = unggah.busy;

  const fileRef = React.useRef<HTMLInputElement>(null);
  const tier = tierOf(totalTerjual);

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

  function pilihFile(file: File) {
    setMessage(null);

    if (!file.type.startsWith('image/')) {
      setMessage({ tone: 'error', text: 'File harus berupa gambar (PNG/JPG/WebP).' });
      return;
    }
    if (file.size > MAX_LOGO) {
      setMessage({ tone: 'error', text: 'Ukuran logo maksimal 2 MB.' });
      return;
    }

    void unggah.guard(() => onUpload(file), {
      pesanTunggu: 'Logo sedang diunggah…',
      onBlocked: (pesan) => setMessage({ tone: 'error', text: pesan }),
      onError: (err) =>
        setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal mengunggah.' }),
    });
  }

  async function onUpload(file: File) {
    setPreview(URL.createObjectURL(file));

    try {
      const fd = new FormData();
      fd.append('logo', file);

      const res = await fetch('/api/profile/logo', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok: boolean; url?: string; message?: string };

      if (!res.ok || !json.ok || !json.url) {
        setMessage({ tone: 'error', text: json.message || 'Gagal mengunggah logo.' });
        setPreview(null);
        return;
      }

      setLogoUrl(json.url);
      setMessage({ tone: 'ok', text: 'Logo toko diperbarui.' });
      router.refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal mengunggah.' });
      setPreview(null);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

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

      {/* Logo toko */}
      <section className="mb-6 flex flex-col items-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-loading={uploading}
          aria-label={`${inisial(namaToko || email)} — Ubah logo toko`}
          className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200"
        >
          {preview || logoUrl ? (
            // URL logo berasal dari Supabase Storage (host tetap dikontrol schema)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(preview ?? logoUrl) as string}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden="true" className="text-[26px] font-bold text-zinc-400">
              {inisial(namaToko || email)}
            </span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/45 text-white">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Camera className="h-6 w-6" />
            )}
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Pilih file yang sama dua kali harus tetap bisa (kunci ada di aksi, bukan di input).
            if (f) pilihFile(f);
          }}
        />
        <p className="mt-2 text-[12px] text-zinc-500">Ketuk untuk upload logo toko (maks. 2 MB)</p>
        {logoUrl ? (
          <button
            type="button"
            onClick={() =>
              ui.run(() => {
                setLogoUrl(null);
                setPreview(null);
                setMessage({ tone: 'ok', text: 'Simpan profil untuk menerapkan logo kosong.' });
              }, 'hapus-logo')
            }
            disabled={ui.locked('hapus-logo')}
            className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500"
          >
            <Trash2 className="h-3.5 w-3.5" /> Hapus logo
          </button>
        ) : null}
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
          <Input
            id="no_hp"
            type="tel"
            inputMode="tel"
            placeholder="08xxxxxxxxxx"
            value={noHp}
            onChange={(e) => setNoHp(e.target.value)}
            maxLength={15}
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

        <Button type="submit" loading={saving} disabled={!isFormValid} className="h-14">
          <Save className="h-4 w-4" />
          {saving ? 'Menyimpan…' : 'Simpan'}
        </Button>

        <div className="-mt-1 rounded-xl bg-gray-50 px-3.5 py-3 text-[12px] text-zinc-500">
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

      {/* Penghargaan Title */}
      <section className="mb-20 mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-zinc-500" />
          <h2 className="text-[15px] font-bold">Penghargaan Title</h2>
        </div>

        <div className="rounded-2xl bg-zinc-900 p-4 text-white">
          <p className="text-[11px] text-zinc-400">Tier Anda</p>
          <p className="mt-0.5 flex items-center gap-2 text-[20px] font-bold">
            <Medal className="h-5 w-5" /> {tier.name}
          </p>
          <p className="mt-1 text-[12px] text-zinc-300">
            Komisi {tier.rate * 100}% · {tierRangeLabel(tier)} ·{' '}
            {tier.max === null
              ? 'selalu aktif'
              : `${Math.max(0, tier.max - totalTerjual)} key lagi`}
          </p>
        </div>

        {/* 4 mahkota: tier aktif full, lainnya warna redup tapi tetap kontras */}
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {TIER_RULES.map((t) => {
            const current = t.name === tier.name;
            return (
              <li
                key={t.name}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-center transition',
                  current
                    ? 'border-zinc-900 bg-white shadow-card'
                    : 'border-zinc-100 bg-zinc-50',
                )}
              >
                <span
                  className={cn(
                    'grid h-10 w-10 place-items-center rounded-full',
                    !current && 'opacity-40',
                  )}
                  style={{ backgroundColor: `${t.color}1a` }}
                >
                  <Crown className="h-5 w-5" style={{ color: t.color }} strokeWidth={2.5} />
                </span>
                <span
                  className={cn(
                    'text-[11px] font-bold leading-none',
                    current ? 'text-zinc-800' : 'text-zinc-500',
                  )}
                >
                  {t.name}
                </span>
                <span className="tabular text-[10px] leading-none text-zinc-500">
                  {t.rate * 100}%
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
