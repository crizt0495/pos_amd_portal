'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Fingerprint,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  Store,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toast';
import { usePos } from '@/components/pos/pos-provider';
import { formatSerialKeyInput } from '@/lib/serial';
import { APP_VERSION, maskHwid } from '@/lib/utils';


export default function PosActivationPage() {
  const { activate, hwid, online, activation } = usePos();
  const toast = useToast();
  const router = useRouter();

  const [serial, setSerial] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ code: string; message: string } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Sudah punya lisensi tersimpan -> arahkan ke kasir
  React.useEffect(() => {
    if (activation) router.replace('/pos');
  }, [activation, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!online) {
      const msg = {
        code: 'OFFLINE',
        message: 'Aktivasi WAJIB terhubung internet. Hubungkan jaringan lalu coba lagi.',
      };
      setError(msg);
      return;
    }
    if (serial.replace(/-/g, '').length < 12) {
      setError({ code: 'INVALID', message: 'Serial Key belum lengkap (butuh 12 karakter kode).' });
      return;
    }

    setBusy(true);
    try {
      const res = await activate(serial);
      if (res.ok) {
        toast.success('Lisensi Berhasil Diaktifkan', res.message);
        router.replace('/pos');
      } else {
        setError({ code: res.code, message: res.message });
        if (res.code === 'HWID_MISMATCH') {
          toast.error('Perangkat Tidak Terdaftar', res.message);
        }
      }
    } catch (err) {
      setError({
        code: 'UNKNOWN',
        message: err instanceof Error ? err.message : 'Aktivasi gagal. Coba lagi.',
      });
    } finally {
      setBusy(false);
    }
  }

  const serialBody = serial.replace(/^KPRO-/, '').replace(/-/g, '');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4 sm:p-6">
      <div className="w-full max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Store className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold">
            Kasir<span className="text-primary">Pro</span>
          </span>
          <Badge variant="muted" className="ml-1">
            v{APP_VERSION}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          {/* KARTU AKTIVASI */}
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" /> Aktivasi Lisensi
              </CardTitle>
              <CardDescription>
                Masukkan Serial Key yang diberikan toko. Proses ini wajib terhubung internet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="serial">Serial Key</Label>
                  <Input
                    id="serial"
                    ref={inputRef}
                    value={serial}
                    onChange={(e) => {
                      setSerial(formatSerialKeyInput(e.target.value));
                      setError(null);
                    }}
                    placeholder="KPRO-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy}
                    className="h-14 text-center font-mono text-lg font-bold tracking-[0.2em] sm:text-xl"
                  />
                  <Progress value={(serialBody.length / 12) * 100} className="h-1" />
                  <p className="text-xs text-muted-foreground">
                    {serialBody.length}/12 karakter &nbsp;·&nbsp; Tekan Enter untuk aktivasi
                  </p>
                </div>

                {!online && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground">
                    <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Anda sedang <strong>offline</strong>. Aktivasi memerlukan koneksi internet —
                      hubungkan WiFi/kabel LAN lalu coba lagi.
                    </span>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <p className="font-semibold text-destructive">
                        {error.code === 'HWID_MISMATCH'
                          ? 'Perangkat Tidak Terdaftar'
                          : error.code === 'OFFLINE'
                            ? 'Tidak Ada Koneksi Internet'
                            : error.code === 'BLOCKED'
                              ? 'Lisensi Diblokir'
                              : error.code === 'EXPIRED'
                                ? 'Lisensi Kedaluwarsa'
                                : 'Aktivasi Gagal'}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{error.message}</p>
                    </div>
                  </div>
                )}

                <Button type="submit" size="lg" className="h-12 w-full" loading={busy} disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Mengunci Hardware ID…
                    </>
                  ) : (
                    <>
                      <Fingerprint className="h-4 w-4" /> Aktivasi &amp; Kunci Lisensi
                    </>
                  )}
                </Button>
              </form>

              <Separator />

              <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Cara mendapat Serial Key:</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Beli paket kasir ke toko komputer / partner resmi kami.</li>
                  <li>Minta toko membuka <strong>Dashboard Aktivasi</strong> dan membuat lisensi.</li>
                  <li>Toko memberi kode KPRO-XXXX-XXXX-XXXX + struk/bukti pembelian.</li>
                  <li>Input kode di layar ini saat perangkat terhubung internet.</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* INFO PERANGKAT */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MonitorSmartphone className="h-5 w-5 text-primary" /> Perangkat Ini
              </CardTitle>
              <CardDescription>Hardware ID akan dikirim &amp; dikunci di server.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="Sumber HWID"
                value={
                  hwid
                    ? hwid.source === 'electron-machine-id' || hwid.source === 'electron-bios'
                      ? 'Motherboard / BIOS (Electron)'
                      : 'Fingerprint Perangkat (Web)'
                    : 'Membaca…'
                }
              />
              <Row icon={<Fingerprint className="h-3.5 w-3.5" />} label="Hardware ID" value={hwid ? maskHwid(hwid.hwid) : '—'} mono />
              <Row
                icon={<Cpu className="h-3.5 w-3.5" />}
                label="Tipe Perangkat"
                value={hwid?.deviceName ?? '—'}
              />
              <Row
                icon={online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                label="Koneksi"
                value={online ? 'Online' : 'Offline'}
                tone={online ? 'text-success' : 'text-destructive'}
              />
              <Row icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Status" value="Menunggu aktivasi" />

              <Separator />

              <div className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1 font-semibold text-foreground">Penting</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Lisensi terikat 1 perangkat — tidak bisa dipakai di PC lain.</li>
                  <li>Format motherboard/PC akan berubah bila perangkat dirakit ulang, Hubungi admin untuk reset.</li>
                  <li>Setelah aktif, aplikasi tetap bisa dipakai penuh tanpa internet.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Sudah punya lisensi tapi lupa kode?{' '}
          <span className="underline">TIHubungi Super Admin untuk reset HWID</span> ·{' '}
          <button
            type="button"
            onClick={() => router.push('/pos/settings')}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Pengaturan
          </button>
        </p>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  mono,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </span>
      <span className={`text-right text-xs font-medium ${mono ? 'font-mono' : ''} ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

