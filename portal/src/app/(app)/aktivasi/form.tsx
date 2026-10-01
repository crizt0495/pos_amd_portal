'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Copy, KeyRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input, InputTelepon, Segmented, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/modal';
import { bersihkanTelepon, rupiah } from '@/lib/format';
import { cekAlamat, cekTelepon, hanyaDigit, namaValid } from '@/lib/validasi';
import { useButtonGuard, useClickCooldown } from '@/lib/useButtonGuard';
import { cn } from '@/lib/utils';
import { LICENSE_TYPE_LABEL, PAKET_LABEL } from '@/lib/commission';
import type { License, LicenseType, PaketType } from '@/types';

interface Props {
  /** Sisa kuota lisensi. Tidak ditampilkan di halaman — hanya dipakai untuk
      menonaktifkan tombol Generate saat kuota habis. */
  quota: number;
}

export default function AktivasiForm({ quota }: Props) {
  const router = useRouter();

  const [nama, setNama] = React.useState('');
  const [telepon, setTelepon] = React.useState('');
  const [alamat, setAlamat] = React.useState('');
  const [paket, setPaket] = React.useState<PaketType>('bundle');
  const [tipe, setTipe] = React.useState<LicenseType>('sekali');

  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<License | null>(null);
  const [copied, setCopied] = React.useState(false);

  /* Penjaga klik-ganda: 1 klik = 1 permintaan, tombol terkunci 1,5 detik. */
  const generate = useButtonGuard();
  const aksiModal = useClickCooldown(1500);
  const loading = generate.busy;

  /* ----------------------------- validasi ----------------------------- */
  const namaError = React.useMemo(() => {
    const n = nama.trim();
    if (n.length === 0) return '';
    if (!namaValid(n)) return 'Nama minimal 3 karakter.';
    return '';
  }, [nama]);
  const teleponError = React.useMemo(() => {
    // Telepon WAJIB, tapi pesan error baru muncul setelah ada isi (pola sama
    // seperti Nama & Alamat) supaya field tidak merah sejak halaman dibuka.
    if (hanyaDigit(telepon).length === 0) return '';
    return cekTelepon(telepon);
  }, [telepon]);
  const alamatError = React.useMemo(() => {
    const a = alamat.trim();
    if (a.length === 0) return '';
    return cekAlamat(a);
  }, [alamat]);
  const kuotaError = quota <= 0 ? 'Sisa kuota lisensi toko Anda habis. Hubungi admin untuk topup.' : '';

  /** Generate Key hanya aktif bila form benar-benar valid. */
  const isFormValid = React.useMemo(
    () =>
      quota > 0 &&
      namaValid(nama) &&
      cekTelepon(telepon, true) === '' &&
      cekAlamat(alamat) === '' &&
      Boolean(paket) &&
      Boolean(tipe),
    [quota, nama, telepon, alamat, paket, tipe],
  );

  async function kirim() {
    setError(null);

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
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) {
      setError('Mohon tunggu… permintaan sebelumnya sedang diproses.');
      return;
    }
    if (!isFormValid) {
      setError('Lengkapi dulu nama, telepon, dan alamat dengan benar.');
      return;
    }
    void generate.guard(kirim, {
      pesanTunggu: 'Serial Key sedang dibuat…',
      onBlocked: (pesan) => setError(pesan),
      onError: (e) => setError(e instanceof Error ? e.message : 'Gagal menghubungi server.'),
    });
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

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Nama" htmlFor="nama" error={namaError}>
          <Input
            id="nama"
            placeholder="Nama lengkap pembeli"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            onBlur={() => setError(null)}
            maxLength={80}
            aria-invalid={Boolean(namaError)}
            className={cn(namaError && 'input-invalid')}
          />
        </Field>

        <Field label="Telepon" htmlFor="telepon" error={teleponError}>
          <InputTelepon
            id="telepon"
            placeholder="08xxxxxxxxxx"
            value={telepon}
            onChange={setTelepon}
            aria-invalid={Boolean(teleponError)}
            className={cn(teleponError && 'input-invalid')}
          />
        </Field>

        <Field label="Alamat" htmlFor="alamat" error={alamatError}>
          <Textarea
            id="alamat"
            placeholder="Alamat lengkap pembeli"
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            maxLength={240}
            aria-invalid={Boolean(alamatError)}
            className={cn(alamatError && 'input-invalid')}
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

        <Button
          type="submit"
          loading={loading}
          disabled={!isFormValid}
          className="mt-1 w-full !bg-black py-3.5"
        >
          <KeyRound className="h-4 w-4" />
          {loading ? 'Membuat Serial Key…' : 'Generate Key'}
        </Button>

        {kuotaError ? (
          <p className="field-error">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {kuotaError}
          </p>
        ) : null}
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

            <Button
              type="button"
              onClick={() => aksiModal.run(copyAndClose, 'copy-tutup')}
              disabled={aksiModal.locked('copy-tutup')}
              className="mt-4"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy &amp; Tutup
            </Button>
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => aksiModal.run(() => setResult(null), 'tutup-modal')}
              disabled={aksiModal.locked('tutup-modal')}
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
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate font-semibold text-zinc-800">{value}</dd>
    </div>
  );
}
