import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  Monitor,
  RefreshCw,
  ShieldAlert,
  Wifi,
} from 'lucide-react';

import { licenseApi, system } from '../lib/api';
import type { LicenseStatus } from '../types';

/**
 * ===========================================================================
 *  Screen Aktivasi
 * ===========================================================================
 *  - Serial Key KPRO dari toko. WAJIB online 1x (satu-satunya proses online).
 *  - Setelah berhasil -> data lisensi tersimpan di SQLite (userData/kasir.db)
 *    dan aplikasi langsung masuk ke POS Kasir, offline selamanya.
 *  - HWID mismatch (aplikasi dicopy) -> tampilan terkunci + tombol cek ulang.
 */

interface Props {
  status: LicenseStatus;
  onActivated: () => void;
}

function normalizeKey(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  let body = raw.startsWith('KPRO') ? raw.slice(4) : raw;
  while (body.startsWith('KPRO')) body = body.slice(4);
  body = body.slice(0, 12);
  const groups = body.match(/.{1,4}/g) ?? [];
  const joined = groups.join('-');
  return joined ? `KPRO-${joined}` : '';
}

export default function ActivationScreen({ status, onActivated }: Props) {
  const [key, setKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hwid, setHwid] = React.useState<{ hwid: string; deviceName: string } | null>(null);
  const [portalUrl, setPortalUrl] = React.useState('');
  const [online, setOnline] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    void (async () => {
      const [hw, info] = await Promise.all([system.getHwid(), system.appInfo()]);
      if (hw.ok && hw.hwid) setHwid({ hwid: hw.hwid, deviceName: hw.deviceName ?? 'Perangkat ini' });
      if (info.ok) setPortalUrl(info.portalUrl ?? '');
      setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    })();

    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const serial = normalizeKey(key);
    if (!serial) {
      setError('Masukkan Serial Key dari toko (format KPRO-XXXX-XXXX-XXXX).');
      return;
    }

    setBusy(true);
    try {
      const res = await licenseApi.activate(serial);
      if (res.ok) {
        onActivated();
        return;
      }
      setError(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aktivasi gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function recheck() {
    setError(null);
    setBusy(true);
    try {
      const res = await licenseApi.check();
      if (res.ok) onActivated();
      else setError(res.message);
    } finally {
      setBusy(false);
    }
  }

  /* ------------------- aplikasi terkunci (HWID beda) ------------------- */
  if (status.code === 'HWID_MISMATCH') {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-8">
        <div className="card w-full max-w-lg p-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-50">
            <ShieldAlert className="h-8 w-8 text-red-600" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-zinc-900">Aplikasi Terkunci</h1>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-600">
            Lisensi ini sudah aktif di perangkat lain. Aplikasi Kasir tidak boleh disalin ke
            komputer berbeda.
          </p>

          <div className="mt-4 space-y-1.5 rounded-xl bg-zinc-50 p-3 text-left text-[12px]">
            <Line label="Serial Key" value={status.license?.serial_key ?? '-'} />
            <Line label="HWID perangkat ini" value={hwid?.hwid ?? '-'} />
            <Line label="HWID terdaftar" value={status.license?.hwid ?? '-'} />
            <Line label="Perangkat" value={hwid?.deviceName ?? '-'} />
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-[12px] text-amber-800">
            <p className="font-semibold">Yang perlu dilakukan:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Kembalikan aplikasi ke komputer kasir yang asli, atau</li>
              <li>Hubungi toko Anda untuk minta reset lisensi.</li>
            </ol>
          </div>

          <button type="button" className="btn-primary mt-4 w-full" onClick={() => void recheck()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Cek Ulang Lisensi
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------- form aktivasi -------------------------- */
  const expired = status.code === 'EXPIRED';

  return (
    <div className="flex h-full items-center justify-center overflow-auto p-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-zinc-900">
            <KeyRound className="h-7 w-7 text-white" />
          </span>
          <h1 className="mt-3 text-xl font-bold text-zinc-900">KasirPro</h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            Masukkan Serial Key untuk mengaktifkan aplikasi kasir
          </p>
        </div>

        <div className="card p-5">
          {expired ? (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{status.message}</span>
            </div>
          ) : null}

          <form onSubmit={submit}>
            <label className="label" htmlFor="serial">
              Serial Key
            </label>
            <input
              id="serial"
              className="input tnum h-11 text-center font-mono text-[15px] tracking-widest"
              placeholder="KPRO-XXXX-XXXX-XXXX"
              value={key}
              onChange={(e) => setKey(normalizeKey(e.target.value))}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />

            {error ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-[12px] text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <button type="submit" className="btn-primary mt-4 h-11 w-full text-[14px]" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aktivasi Sekarang
            </button>
          </form>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-zinc-50 p-2.5 text-[11.5px] leading-relaxed text-zinc-600">
            <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span>
              Aktivasi <b>wajib terhubung internet</b> (1x saja). Setelah itu aplikasi berjalan
              100% offline — tidak ada data kasir yang dikirim ke server.
            </span>
          </div>
        </div>

        <div className="card mt-3 p-3 text-[11.5px] text-zinc-600">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700">
              <Monitor className="h-3.5 w-3.5" /> Perangkat ini
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                online === false
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {online === false ? 'Offline' : 'Online'}
            </span>
          </div>
          <div className="mt-1.5 space-y-1 text-[11px]">
            <Line label="Nama" value={hwid?.deviceName ?? 'Membaca...'} />
            <Line label="Hardware ID" value={hwid?.hwid ?? '-'} mono />
            {portalUrl ? <Line label="Portal" value={portalUrl} mono /> : null}
          </div>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-400">
          <Lock className="h-3 w-3" /> Lisensi terkunci pada perangkat ini (1 key = 1 komputer)
        </p>
      </div>
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className={`truncate text-right font-medium text-zinc-800 ${mono ? 'font-mono text-[10.5px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}
