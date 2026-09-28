'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Copy, KeyRound, Package, Sparkles, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input, Segmented, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { bersihkanTelepon, rupiah } from '@/lib/format';
import {
  BASE_COMMISSION,
  LICENSE_TYPE_LABEL,
  PAKET_LABEL,
  PAKET_LABEL_PANJANG,
  PAKET_PRICE,
  tierOf,
} from '@/lib/commission';
import type { License, LicenseType, PaketType } from '@/types';

interface Props {
  quota: number;
  totalTerjual: number;
}

export default function AktivasiForm({ quota, totalTerjual }: Props) {
  const router = useRouter();

  const [nama, setNama] = React.useState('');
  const [telepon, setTelepon] = React.useState('');
  const [alamat, setAlamat] = React.useState('');
  const [paket, setPaket] = React.useState<PaketType>('bundle');
  const [tipe, setTipe] = React.useState<LicenseType>('sekali');

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<License | null>(null);
  const [copied, setCopied] = React.useState(false);

  const tier = tierOf(totalTerjual);
  const komisiPerKey = Math.round(BASE_COMMISSION[paket] * tier.rate);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nama.trim()) return setError('Nama pembeli wajib diisi.');
    if (telepon.trim().length < 8) return setError('Nomor telepon minimal 8 digit.');
    if (!alamat.trim()) return setError('Alamat wajib diisi.');
    if (quota <= 0)
      return setError('Sisa kuota lisensi toko Anda habis. Hubungi admin untuk topup.');

    setLoading(true);
    try {
      const res = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: nama.trim(),
          telepon: bersihkanTelepon(telepon),
          alamat: alamat.trim(),
          paket,
          tipe,
        }),
      });

      const json = (await res.json()) as { ok: boolean; message: string; license?: License };

      if (!res.ok || !json.ok || !json.license) {
        setError(json.message || 'Gagal membuat Serial Key.');
        return;
      }

      setResult(json.license);
      setCopied(false);
      setNama('');
      setTelepon('');
      setAlamat('');
      router.refresh(); // segarkan sisa kuota di server
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.serial_key);
    } catch {
      // fallback untuk browser tanpa Clipboard API / konteks non-HTTPS
      const ta = document.createElement('textarea');
      ta.value = result.serial_key;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  /** Tombol "Copy & Tutup": salin Serial Key lalu tutup modal. */
  function copyAndClose() {
    void copyKey();
    setResult(null);
  }

  return (
    <main className="app-content">
      <header className="mb-5">
        <h1 className="text-[22px] font-bold leading-none">Generate Serial Key</h1>
        <p className="mt-2 text-[13px] text-zinc-500">
          Generate Serial Key untuk pembeli, lalu aktifkan di Komputer Kasir.
        </p>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2.5">
        <div className="card-soft px-3 py-3">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Harga</span>
          </div>
          <p className="tabular mt-1 text-[16px] font-bold text-zinc-900">
            {rupiah(PAKET_PRICE[paket])}
          </p>
          <p className="text-[10px] text-zinc-400">{PAKET_LABEL_PANJANG[paket]}</p>
        </div>
        <div className="card-soft px-3 py-3">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Komisi</span>
          </div>
          <p className="tabular mt-1 text-[16px] font-bold text-zinc-900">{rupiah(komisiPerKey)}</p>
          <p className="text-[10px] text-zinc-400">
            Tier {tier.name} · {tier.rate * 100}%
          </p>
        </div>
      </section>

      <section className="mb-5 flex items-center justify-between rounded-2xl bg-zinc-900 px-4 py-3 text-white">
        <div>
          <p className="text-[11px] text-zinc-400">Sisa Kuota Lisensi</p>
          <p className="tabular text-[20px] font-bold leading-tight">{quota} key</p>
        </div>
        <Package className="h-6 w-6 text-zinc-500" />
      </section>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nama" htmlFor="nama">
          <Input
            id="nama"
            placeholder="Nama lengkap pembeli"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            maxLength={80}
          />
        </Field>

        <Field label="Telepon" htmlFor="telepon">
          <Input
            id="telepon"
            type="tel"
            inputMode="tel"
            placeholder="08xxxxxxxxxx"
            value={telepon}
            onChange={(e) => setTelepon(e.target.value)}
            maxLength={15}
          />
        </Field>

        <Field label="Alamat" htmlFor="alamat">
          <Textarea
            id="alamat"
            placeholder="Alamat lengkap pembeli"
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            maxLength={240}
          />
        </Field>

        <Field label="Paket">
          <Segmented
            name="Paket"
            value={paket}
            onChange={setPaket}
            options={[
              { value: 'bundle', label: 'Bundle', sub: 'PC + App' },
              { value: 'app_only', label: 'Aplikasi Saja', sub: 'App' },
            ]}
          />
        </Field>

        <Field label="Pilihan">
          <Segmented
            name="Pilihan"
            value={tipe}
            onChange={setTipe}
            options={[
              { value: 'sekali', label: 'Sekali', sub: 'Bayar 1x' },
              { value: 'langganan', label: 'Langganan', sub: '12 Bulan' },
            ]}
          />
        </Field>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button type="submit" loading={loading} className="mt-1">
          <KeyRound className="h-4 w-4" /> Generate Key
        </Button>
      </form>

      {/* MODAL: Generate Key Berhasil */}
      <Modal open={Boolean(result)} onClose={() => setResult(null)} labelledBy="sukses-title">
        {result ? (
          <div className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50">
              <Check className="h-7 w-7 text-emerald-600" strokeWidth={3} />
            </span>

            <h2 id="sukses-title" className="mt-3 text-[19px] font-bold leading-tight">
              Selamat Generate Key Berhasil
            </h2>

            <div className="mt-3 rounded-2xl border-2 border-dashed border-zinc-900 bg-zinc-50 px-3 py-4">
              <p className="tabular font-mono text-[19px] font-bold leading-tight tracking-wider text-zinc-900">
                {result.serial_key}
              </p>
            </div>

            <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
              Silakan aktivasi ke Komputer Kasir
            </p>

            <dl className="mt-4 space-y-1.5 rounded-2xl bg-zinc-50 p-3 text-left text-[12px]">
              <Row label="Pembeli" value={result.pembeli_nama} />
              <Row label="Paket" value={PAKET_LABEL[result.paket_type]} />
              <Row label="Jenis" value={LICENSE_TYPE_LABEL[result.license_type]} />
              <Row label="Komisi" value={rupiah(result.komisi_amount)} />
            </dl>

            <Button type="button" onClick={copyAndClose} className="mt-4">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy &amp; Tutup
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => setResult(null)}
            >
              Tutup
            </Button>
          </div>
        ) : null}
      </Modal>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="truncate font-semibold text-zinc-800">{value}</dd>
    </div>
  );
}
