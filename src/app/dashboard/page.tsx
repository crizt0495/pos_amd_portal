'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Store,
  User,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { createLicenseForPartner, fetchLicenses, summarizeCommissions } from '@/lib/partner-data';
import { getDB } from '@/lib/db/local';
import { syncNow } from '@/lib/db/sync';
import { fmtDate, rupiah } from '@/lib/utils';
import {
  DEFAULT_PERIOD_MONTHS,
  PAKET_COMMISSION,
  PAKET_LABEL,
  PAKET_PRICE,
  QUOTA_LOW_WARNING,
  STATUS_LABEL,
  TOPUP_AMOUNT,
  type LicenseStatus,
  type LicenseWithStore,
} from '@/types';

export default function PartnerDashboardPage() {
  const auth = useAuth();
  const toast = useToast();

  const [licenses, setLicenses] = React.useState<LicenseWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchLicenses(auth.partner?.id);
      setLicenses(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Gagal memuat lisensi.');
    } finally {
      setLoading(false);
    }
  }, [auth.partner?.id]);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  const partner = auth.partner;
  const quota = partner?.license_quota ?? 0;
  const quotaTotal = quota + (partner?.license_granted ?? 0);
  const low = quota <= QUOTA_LOW_WARNING;
  const summary = React.useMemo(() => summarizeCommissions(licenses), [licenses]);

  // Status server untuk lisensi (agar tampilan tidak relying localStorage)
  const localStatus = useLiveQuery(
    () =>
      getDB()
        .licenses_cache.toArray()
        .then((rows) => {
          const map = new Map(rows.map((r) => [r.id, r.status as LicenseStatus]));
          return map;
        }),
    [],
    new Map<string, LicenseStatus>(),
  );

  function statusOf(l: LicenseWithStore): LicenseStatus {
    return (localStatus?.get(l.id) as LicenseStatus) || l.status;
  }

  const recent = licenses.slice(0, 8);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Sapaan + Kuota */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Aktivasi</h1>
          <p className="text-sm text-muted-foreground">
            {partner?.nama_toko ?? 'Toko Partner'} — buat lisensi baru untuk pembeli PC kasir.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Muat Ulang
        </Button>
      </div>

      {loadError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Gagal memuat data lisensi</p>
            <p className="text-muted-foreground">{loadError}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pastikan schema Supabase sudah dijalankan dan RLS aktif.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* KARTU KUOTA */}
        <Card className={low ? 'border-destructive/50' : ''}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-primary" /> Sisa Kuota Lisensi
            </CardTitle>
            <CardDescription>Setiap aktivasi berhasil memakai 1 lisensi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className={`text-5xl font-extrabold tnum ${low ? 'text-destructive' : 'text-success'}`}>
                {quota}
              </span>
              <span className="pb-1 text-2xl font-semibold text-muted-foreground">/{quotaTotal}</span>
            </div>
            <Progress
              value={quotaTotal ? ((quotaTotal - quota) / quotaTotal) * 100 : 0}
              indicatorClassName={low ? 'bg-destructive' : 'bg-success'}
            />
            <p className="text-xs text-muted-foreground">
              {quotaTotal - quota} lisensi sudah terjual dari jatah {quotaTotal}
            </p>

            {low && (
              <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                <p className="font-semibold text-destructive">
                  ⚠ Stok lisensi menipis — hubungi Super Admin untuk topup
                </p>
                <p className="text-muted-foreground">
                  Topup mínimo +{TOPUP_AMOUNT} lisensi. Setelah topup, form aktivasi langsung bisa
                  digunakan lagi.
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      `Halo Super Admin, toko ${partner?.nama_toko ?? '-'} kehabisan lisensi. Mohon topup +${TOPUP_AMOUNT} lisensi. Terima kasih.`,
                    );
                    toast.success('Pesan disalin', 'Tempel ke WhatsApp Super Admin.');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Salin Pesan Topup
                </Button>
              </div>
            )}

            {quota <= 0 && (
              <div className="rounded-lg border p-3 text-xs">
                <p className="font-semibold text-destructive">Kuota habis</p>
                <p className="mt-1 text-muted-foreground">
                  Form aktivasi dinonaktifkan sampai ada topup dari Super Admin.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* FORM AKTIVASI */}
        <div className="lg:col-span-2">
          <ActivationForm
            disabled={quota <= 0}
            partnerId={auth.partner?.id}
            quota={quota}
            onCreated={async () => {
              await refresh();
              auth.refresh();
              window.dispatchEvent(new Event('kasirpro:partner-updated'));
              void syncNow(true);
            }}
          />
        </div>
      </div>

      {/* RINGKASAN */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Total Lisensi" value={String(licenses.length)} />
        <MiniStat
          label="Sudah Aktif"
          value={String(summary.byStatus.active)}
          tone="text-success"
        />
        <MiniStat
          label="Belum Dipakai"
          value={String(summary.byStatus.unused)}
          tone="text-warning"
        />
        <MiniStat
          label="Komisi TertPending"
          value={rupiah(summary.total, { compact: true })}
          tone="text-primary"
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      {/* DAFTAR TERBARU */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lisensi Terbaru</CardTitle>
          <CardDescription>Status &amp; HWID 8 lisensi terakhir yang dibuat</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid place-items-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada lisensi. Isi form di atas untuk membuat lisensi pertama.
            </p>
          ) : (
            <div className="space-y-2">
              {recent.map((l) => {
                const st = statusOf(l);
                return (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm"
                  >
                    <span className="font-mono font-bold tracking-wider">{l.serial_key}</span>
                    <Badge variant={st === 'active' ? 'success' : st === 'unused' ? 'warning' : 'destructive'}>
                      {STATUS_LABEL[st]}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {l.store?.store_name ?? l.store_id ?? '—'} • {PAKET_LABEL[l.paket_type]}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(l.created_at)}</span>
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => (window.location.href = '/dashboard/licenses')}
              >
                Lihat semua lisensi →
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FORM AKTIVASI                                                       */
/* ------------------------------------------------------------------ */

function ActivationForm({
  disabled,
  partnerId,
  quota,
  onCreated,
}: {
  disabled: boolean;
  partnerId?: string;
  quota: number;
  onCreated: () => Promise<void>;
}) {
  const toast = useToast();

  const [form, setForm] = React.useState({
    namaTokoPembeli: '',
    namaPembeli: '',
    noHp: '',
    alamat: '',
    paket: 'bundle_pc_app' as 'bundle_pc_app' | 'app_only',
    licenseType: 'permanent' as 'permanent' | 'subscription',
    periodMonths: DEFAULT_PERIOD_MONTHS.subscription ?? 12,
    deviceNote: '',
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    serialKey: string;
    storeName: string;
    price: number;
    commission: number;
    remaining: number | null;
  } | null>(null);

  const price = PAKET_PRICE[form.paket];
  const commission = PAKET_COMMISSION[form.paket];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.namaTokoPembeli.trim() || form.namaTokoPembeli.trim().length < 2) {
      return setError('Nama toko pembeli wajib diisi (minimal 2 karakter).');
    }
    if (!form.namaPembeli.trim()) return setError('Nama pembeli wajib diisi.');
    if (!/^[0-9+\-\s()]{6,}$/.test(form.noHp.trim())) {
      return setError('No. HP tidak valid (minimal 6 digit).');
    }

    setBusy(true);
    try {
      const res = await createLicenseForPartner({
        namaTokoPembeli: form.namaTokoPembeli.trim(),
        namaPembeli: form.namaPembeli.trim(),
        noHp: form.noHp.trim(),
        alamat: form.alamat.trim(),
        paket: form.paket,
        licenseType: form.licenseType,
        periodMonths:
          form.licenseType === 'subscription' ? form.periodMonths : undefined,
        deviceNote: form.deviceNote.trim(),
        partnerId,
      });

      if (!res.ok) {
        setError(res.message);
        if (res.code === 'QUOTA_EXHAUSTED') {
          toast.error('Kuota Habis', res.message);
        }
        return;
      }

      setResult({
        serialKey: res.license!.serial_key,
        storeName: res.store?.store_name ?? form.namaTokoPembeli,
        price,
        commission,
        remaining: res.quota ?? null,
      });
      toast.success('Lisensi Dibuat', `Serial ${res.license!.serial_key} siap dikirim ke pembeli.`);

      // reset form
      setForm({
        namaTokoPembeli: '',
        namaPembeli: '',
        noHp: '',
        alamat: '',
        paket: form.paket,
        licenseType: form.licenseType,
        periodMonths: form.periodMonths,
        deviceNote: '',
      });
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat lisensi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-5 w-5 text-primary" /> Form Aktivasi Baru
        </CardTitle>
        <CardDescription>
          Sistem akan membuat Serial Key unik <span className="font-mono">KPRO-XXXX-XXXX-XXXX</span>{' '}
          dan mengurangi kuota Anda 1 lisensi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/50 bg-success/10 p-4">
              <p className="flex items-center gap-2 font-semibold text-success">
                <CheckCircle2 className="h-5 w-5" /> Lisensi Berhasil Dibuat
              </p>
              <div className="mt-3 space-y-2 rounded-lg bg-background p-3 text-center">
                <p className="text-xs text-muted-foreground">Serial Key untuk {result.storeName}</p>
                <p className="font-mono text-2xl font-extrabold tracking-widest text-primary">
                  {result.serialKey}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(result.serialKey);
                    toast.success('Serial Key disalin');
                  }}
                >
                  <Copy className="h-4 w-4" /> Salin Serial Key
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                  className="no-print"
                >
                  <Printer className="h-4 w-4" /> Cetak Struk Lisensi
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                  Buat Lisensi Lain
                </Button>
              </div>
              <Separator className="my-3" />
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Harga Jual</p>
                  <p className="font-bold tnum">{rupiah(result.price)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Komisi Anda</p>
                  <p className="font-bold text-success tnum">{rupiah(result.commission)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sisa Kuota</p>
                  <p className="font-bold tnum">{result.remaining ?? quota - 1}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama Toko Pembeli *" id="f-toko" icon={<Store className="h-3.5 w-3.5" />}>
                <Input
                  id="f-toko"
                  value={form.namaTokoPembeli}
                  onChange={(e) => setForm({ ...form, namaTokoPembeli: e.target.value })}
                  placeholder="Toko Berkah Jaya"
                  disabled={disabled || busy}
                  maxLength={120}
                />
              </Field>
              <Field label="Nama Pembeli *" id="f-pembeli" icon={<User className="h-3.5 w-3.5" />}>
                <Input
                  id="f-pembeli"
                  value={form.namaPembeli}
                  onChange={(e) => setForm({ ...form, namaPembeli: e.target.value })}
                  placeholder="Budi Santoso"
                  disabled={disabled || busy}
                  maxLength={120}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="No. HP *" id="f-hp">
                <Input
                  id="f-hp"
                  value={form.noHp}
                  onChange={(e) => setForm({ ...form, noHp: e.target.value })}
                  placeholder="081234567890"
                  inputMode="tel"
                  disabled={disabled || busy}
                  maxLength={30}
                />
              </Field>
              <Field label="Alamat" id="f-alamat">
                <Input
                  id="f-alamat"
                  value={form.alamat}
                  onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                  placeholder="Jl. Merdeka No. 10, Jakarta"
                  disabled={disabled || busy}
                  maxLength={300}
                />
              </Field>
            </div>

            <Field label="Catatan Perangkat (opsional)" id="f-catatan">
              <Input
                id="f-catatan"
                value={form.deviceNote}
                onChange={(e) => setForm({ ...form, deviceNote: e.target.value })}
                placeholder="mis. PC kasir depan, Core i3 / RAM 8GB"
                disabled={disabled || busy}
                maxLength={200}
              />
            </Field>

            <Separator />

            {/* PAKET */}
            <div className="space-y-2">
              <Label className="text-xs">Paket *</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['bundle_pc_app', 'app_only'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => setForm({ ...form, paket: p })}
                    className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                      form.paket === p
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{PAKET_LABEL[p]}</p>
                      {form.paket === p && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                    <p className="mt-1 text-lg font-bold text-primary tnum">{rupiah(PAKET_PRICE[p])}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Jatah komisi Anda{' '}
                      <span className="font-semibold text-success">{rupiah(PAKET_COMMISSION[p])}</span>
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* TIPE LISENSI */}
            <div className="space-y-2">
              <Label className="text-xs">Tipe Lisensi *</Label>
              <RadioGroup
                value={form.licenseType}
                onValueChange={(v) => setForm({ ...form, licenseType: v as 'permanent' | 'subscription' })}
                className="grid gap-2 sm:grid-cols-2"
                disabled={disabled}
              >
                <LabelCard
                  value="permanent"
                  current={form.licenseType}
                  title="Aktif Selamanya"
                  desc="Sekali bayar, tidak ada batas waktu."
                  onSelect={(v) => setForm({ ...form, licenseType: v })}
                />
                <LabelCard
                  value="subscription"
                  current={form.licenseType}
                  title="Langganan"
                  desc="Komisi 10% recurring per periode."
                  onSelect={(v) => setForm({ ...form, licenseType: v })}
                />
              </RadioGroup>

              {form.licenseType === 'subscription' && (
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="f-period">
                    Periode Langganan
                  </Label>
                  <select
                    id="f-period"
                    value={form.periodMonths}
                    onChange={(e) => setForm({ ...form, periodMonths: parseInt(e.target.value, 10) })}
                    disabled={disabled || busy}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value={1}>1 Bulan</option>
                    <option value={3}>3 Bulan</option>
                    <option value={6}>6 Bulan</option>
                    <option value={12}>12 Bulan (tahunan)</option>
                    <option value={24}>24 Bulan</option>
                    <option value={36}>36 Bulan</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Lisensi akan kedaluwarsa otomatis setelah periode berakhir dan perlu diaktifkan
                    ulang oleh pembeli.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="whitespace-pre-line">{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={busy} disabled={disabled || busy}>
              {disabled ? 'Kuota Lisensi Habis' : busy ? 'Membuat Lisensi…' : 'Buat Lisensi Sekarang'}
            </Button>

            <p className="text-center text-[11px] text-muted-foreground">
              Sisa kuota saat ini: <strong className="tnum">{quota}</strong> lisensi.
              Pelanggan wajib menginput Serial Key di aplikasi kasir saat perangkat online.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Field({
  label,
  id,
  icon,
  children,
}: {
  label: string;
  id: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5 text-xs">
        {icon} {label}
      </Label>
      {children}
    </div>
  );
}

function LabelCard({
  value,
  current,
  title,
  desc,
  onSelect,
}: {
  value: 'permanent' | 'subscription';
  current: 'permanent' | 'subscription';
  title: string;
  desc: string;
  onSelect: (v: 'permanent' | 'subscription') => void;
}) {
  const active = value === current;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(value);
      }}
      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors ${
        active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent'
      }`}
    >
      <RadioGroupItem value={value} checked={active} className="mt-0.5" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className={`mt-0.5 text-xl font-bold tnum ${tone ?? ''}`}>{value}</p>
    </div>
  );
}
