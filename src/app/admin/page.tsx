'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

import { PageTitle } from '@/components/admin/admin-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState, StatCard } from '@/components/ui/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  createPayout,
  fetchActivityLogs,
  fetchAdminLicenses,
  fetchAdminPartners,
  fetchFinance,
  type ActivityLogRow,
  type AdminPartnerRow,
  type FinanceSummary,
} from '@/lib/admin-data';
import { fmtDateTime, rupiah, toNumber } from '@/lib/utils';
import { QUOTA_LOW_WARNING, TOPUP_AMOUNT } from '@/types';

export default function AdminOverviewPage() {
  const auth = useAuth();

  const [partners, setPartners] = React.useState<AdminPartnerRow[]>([]);
  const [finance, setFinance] = React.useState<FinanceSummary | null>(null);
  const [lowQuota, setLowQuota] = React.useState<Array<{ id: string; nama: string; quota: number; total: number }>>([]);
  const [blocked, setBlocked] = React.useState<Array<{ id: string; serial: string; store: string }>>([]);
  const [logs, setLogs] = React.useState<ActivityLogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, f, l, a] = await Promise.all([
        fetchAdminPartners(),
        fetchFinance(6),
        fetchAdminLicenses({ limit: 200 }),
        fetchActivityLogs(15),
      ]);
      setPartners(p);
      setFinance(f);
      setLogs(a);
      setLowQuota(
        p
          .filter((x) => x.status === 'active' && x.license_quota <= QUOTA_LOW_WARNING)
          .map((x) => ({
            id: x.id,
            nama: x.nama_toko,
            quota: x.license_quota,
            total: x.license_quota + x.license_granted,
          })),
      );
      setBlocked(
        l.licenses
          .filter((x) => x.status === 'blocked')
          .slice(0, 8)
          .map((x) => ({ id: x.id, serial: x.serial_key, store: x.store?.store_name ?? '-' })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat ringkasan.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  const totals = finance?.totals;
  const maxMonth = Math.max(1, ...(finance?.revenueByMonth ?? []).map((m) => m.revenue));
  const topPartners = (finance?.byPartner ?? []).slice(0, 6);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageTitle
        title="Ringkasan Sistem"
        description="Pusat kendali lisensi, partner, dan keuangan KasirPro"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
              <RefreshCw className="h-4 w-4" /> Muat Ulang
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/partners">
                <Plus className="h-4 w-4" /> Partner Baru
              </Link>
            </Button>
          </>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !finance ? (
        <div className="grid place-items-center rounded-xl border bg-card py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Lisensi"
              value={totals?.licenses ?? 0}
              icon={<KeyRound className="h-5 w-5" />}
              hint={`${totals?.active ?? 0} aktif • ${totals?.unused ?? 0} belum dipakai`}
            />
            <StatCard
              label="Total Omzet"
              value={rupiah(totals?.revenueTotal ?? 0, { compact: true })}
              icon={<TrendingUp className="h-5 w-5" />}
              tone="primary"
              hint={`Bundle ${rupiah(totals?.revenueBundle ?? 0, { compact: true })} • App ${rupiah(totals?.revenueAppOnly ?? 0, { compact: true })}`}
            />
            <StatCard
              label="Komisi Partner"
              value={rupiah(totals?.commissionTotal ?? 0, { compact: true })}
              icon={<Wallet className="h-5 w-5" />}
              tone="warning"
              hint={`Sudah dibayar ${rupiah(totals?.paidOut ?? 0, { compact: true })}`}
            />
            <StatCard
              label="Partner Aktif"
              value={partners.filter((p) => p.status === 'active').length}
              icon={<Users className="h-5 w-5" />}
              tone="success"
              hint={`${partners.length} toko partner terdaftar`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Omzet 6 Bulan Terakhir</CardTitle>
                <CardDescription>
                  Total {rupiah(totals?.revenueTotal ?? 0)} •jatah partner{' '}
                  {rupiah(totals?.commissionTotal ?? 0)} • bagian KasirPro{' '}
                  {rupiah(totals?.ourShare ?? 0)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(finance?.revenueByMonth ?? []).length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada transaksi lisensi.
                  </p>
                ) : (
                  <div className="flex h-44 items-end gap-2">
                    {finance!.revenueByMonth.map((m) => {
                      const label = new Date(`${m.month}-01`).toLocaleDateString('id-ID', {
                        month: 'short',
                        year: '2-digit',
                      });
                      return (
                        <div key={m.month} className="group flex min-w-[46px] flex-1 flex-col items-center gap-1">
                          <div
                            className="relative w-full rounded-t bg-primary/85 transition-colors hover:bg-primary"
                            style={{ height: `${Math.max(4, (m.revenue / maxMonth) * 100)}%` }}
                            title={`${label}: ${rupiah(m.revenue)} (${m.count} lisensi)`}
                          >
                            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                              {rupiah(m.revenue, { compact: true })}
                            </span>
                          </div>
                          <span className="text-[9px] text-muted-foreground">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Transfer ke Partner</CardTitle>
                <CardDescription>Yang masih tertunda</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Belum Dibayar</span>
                    <span className="font-bold text-warning tnum">
                      {rupiah(totals?.pendingPayout ?? 0)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-muted-foreground">Sudah Dibayar</span>
                    <span className="font-bold text-success tnum">
                      {rupiah(totals?.paidOut ?? 0)}
                    </span>
                  </div>
                  <Separator className="my-2" />
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link href="/admin/finance">Kelola Keuangan</Link>
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Perlu Topup Kuota
                  </p>
                  {lowQuota.length === 0 ? (
                    <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                      Semua partner memiliki kuota aman.
                    </p>
                  ) : (
                    lowQuota.map((lq) => (
                      <div
                        key={lq.id}
                        className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 p-2.5 text-xs"
                      >
                        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{lq.nama}</p>
                          <p className="text-muted-foreground">
                            Sisa {lq.quota} dari {lq.total} lisensi
                          </p>
                        </div>
                        <Link
                          href={`/admin/partners?focus=${lq.id}`}
                          className="shrink-0 rounded border bg-background px-2 py-1 font-semibold hover:bg-accent"
                        >
                          Topup +{TOPUP_AMOUNT}
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Partner Terbesar</CardTitle>
                <CardDescription>Diurutkan dari komisi yang dihasilkan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {topPartners.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada partner terdaftar.
                  </p>
                ) : (
                  topPartners.map((p) => {
                    const maxCommission = Math.max(1, ...topPartners.map((x) => x.commission));
                    return (
                      <div key={p.id} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium">{p.nama_toko}</span>
                          <span className="shrink-0 font-semibold tnum">
                            {rupiah(p.commission, { compact: true })}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(p.commission / maxCommission) * 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {p.licenses} lisensi • {p.active} aktif • sisa kuota {p.quota}
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Fingerprint className="h-5 w-5 text-primary" /> Aktivitas Terakhir
                </CardTitle>
                <CardDescription>Audit trail perubahan lisensi & partner</CardDescription>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <EmptyState
                    icon={<Activity className="h-10 w-10" />}
                    title="Belum ada aktivitas"
                    description="Setiap pembuatan lisensi, topup, dan perubahan status akan tercatat di sini."
                    className="border-0 p-6"
                  />
                ) : (
                  <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {logs.map((l) => (
                      <div key={l.id} className="flex items-start gap-2 rounded-lg border p-2.5 text-xs">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono font-semibold">{l.action}</p>
                          <p className="truncate text-muted-foreground">
                            {l.actor_email ?? 'sistem'} • {fmtDateTime(l.created_at)}
                          </p>
                        </div>
                        {l.entity && <Badge variant="muted">{l.entity}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {blocked.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lisensi Diblokir</CardTitle>
                <CardDescription>Perluditinjau — bisa dibuka lagi dari menu Lisensi &amp; HWID</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {blocked.map((b) => (
                  <Link
                    key={b.id}
                    href="/admin/licenses"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs hover:bg-destructive/20"
                  >
                    <span className="font-mono font-bold">{b.serial}</span>
                    <span className="ml-2 text-muted-foreground">{b.store}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribusi Status Lisensi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatusBox label="Aktif" value={totals?.active ?? 0} total={totals?.licenses ?? 0} variant="success" />
                <StatusBox label="Belum Dipakai" value={totals?.unused ?? 0} total={totals?.licenses ?? 0} variant="warning" />
                <StatusBox label="Diblokir" value={totals?.blocked ?? 0} total={totals?.licenses ?? 0} variant="destructive" />
                <StatusBox label="Kedaluwarsa" value={totals?.expired ?? 0} total={totals?.licenses ?? 0} variant="muted" />
                <StatusBox label="Total" value={totals?.licenses ?? 0} total={totals?.licenses ?? 0} variant="default" />
              </div>
            </CardContent>
          </Card>

          <QuickPayout partnerId={lowQuota[0]?.id ?? partners[0]?.id ?? null} onDone={refresh} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatusBox({
  label,
  value,
  total,
  variant,
}: {
  label: string;
  value: number;
  total: number;
  variant: 'default' | 'success' | 'warning' | 'destructive' | 'muted';
}) {
  const share = total > 0 ? (value / total) * 100 : 0;
  const bar: Record<string, string> = {
    default: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
    muted: 'bg-muted-foreground/40',
  };
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Badge variant={variant}>{value}</Badge>
      </div>
      <p className="mt-1 text-xl font-bold tnum">{share.toFixed(0)}%</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', bar[variant])} style={{ width: `${Math.min(100, share)}%` }} />
      </div>
    </div>
  );
}

/** Dialog cepat untuk mencatat transfer komisi ke partner. */
function QuickPayout({ partnerId, onDone }: { partnerId: string | null; onDone: () => Promise<void> }) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [partners, setPartners] = React.useState<AdminPartnerRow[]>([]);
  const [target, setTarget] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const rows = await fetchAdminPartners();
        setPartners(rows);
        setTarget((t) => t || partnerId || rows[0]?.id || '');
      } catch {
        setPartners([]);
      }
    })();
  }, [open, partnerId]);

  React.useEffect(() => {
    if (open && partnerId && !target) setTarget(partnerId);
  }, [open, partnerId, target]);

  const selected = partners.find((p) => p.id === target);
  const suggest = selected ? toNumber(selected.commission) : 0;

  async function submit() {
    const value = toNumber(amount);
    if (!target) {
      toast.error('Pilih partner tujuan');
      return;
    }
    if (value <= 0) {
      toast.error('Nominal transfer tidak valid');
      return;
    }
    setBusy(true);
    try {
      const res = await createPayout({ partnerId: target, amount: value, note, markPaid: false });
      toast.success('Payout dicatat', res.message);
      setOpen(false);
      setAmount('');
      setNote('');
      await onDone();
    } catch (e) {
      toast.error('Gagal mencatat payout', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={partners.length === 0 && !partnerId}>
          <Wallet className="h-4 w-4" /> Catat Transfer Komisi
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Catat transfer komisi</AlertDialogTitle>
            <AlertDialogDescription>
              Pencatatan ini tidak memindahkan dana otomatis, hanya mencatat bahwa komisi sudah
              dikirim ke partner (rekening/BCA/e-wallet di luar sistem).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2 text-left">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Partner Tujuan</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              >
                {partners.length === 0 && <option value="">Memuat daftar partner…</option>}
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama_toko} — komisi {rupiah(p.commission, { compact: true })}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Nominal (Rp)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder={suggest ? String(suggest) : '0'}
                className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm tnum"
              />
              {suggest > 0 && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setAmount(String(suggest))}
                >
                  Pakai total komisi berjalan: {rupiah(suggest)}
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Catatan</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="mis. Transfer BCA a/n …"
                className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void submit(); }}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
              Simpan Pending
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
