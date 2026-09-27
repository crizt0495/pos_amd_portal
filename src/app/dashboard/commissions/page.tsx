'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  Percent,
  RefreshCw,
  Repeat,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { EmptyState, StatCard } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { datedFilename, downloadCsv, toCsv } from '@/lib/csv';
import { fetchLicenses, fetchPayouts, summarizeCommissions } from '@/lib/partner-data';
import { fmtDate, fmtDateTime, pct, rupiah, toNumber } from '@/lib/utils';
import {
  LICENSE_TYPE_LABEL,
  PAKET_COMMISSION,
  PAKET_LABEL,
  PAKET_PRICE,
  QUOTA_LOW_WARNING,
  TOPUP_AMOUNT,
  type LicenseWithStore,
  type Payout,
} from '@/types';

/** Berapa persen dari harga paket yang menjadi jatah toko untuk langganan. */
const SUBSCRIPTION_RATE = 0.1;

export default function PartnerCommissionsPage() {
  const auth = useAuth();
  const toast = useToast();

  const [licenses, setLicenses] = React.useState<LicenseWithStore[]>([]);
  const [payouts, setPayouts] = React.useState<Payout[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const partnerId = auth.partner?.id ?? null;

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, p] = await Promise.all([fetchLicenses(partnerId), fetchPayouts(partnerId)]);
      setLicenses(l);
      setPayouts(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data komisi.');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  const summary = React.useMemo(
    () => summarizeCommissions(licenses, payouts.map((p) => ({ amount: toNumber(p.amount), status: p.status }))),
    [licenses, payouts],
  );

  /** Jatah langganan (10% per periode) — komisi berulang per tahun. */
  const subscription = React.useMemo(() => {
    const rows = licenses.filter((l) => l.license_type === 'subscription');
    const perPeriod = rows.reduce((acc, l) => acc + toNumber(l.price_idr) * SUBSCRIPTION_RATE, 0);
    const perYear = rows.reduce((acc, l) => {
      const months = l.period_months ?? 12;
      return acc + toNumber(l.price_idr) * SUBSCRIPTION_RATE * (12 / months);
    }, 0);
    return { count: rows.length, perPeriod, perYear };
  }, [licenses]);

  const quota = auth.partner?.license_quota ?? 0;
  const granted = auth.partner?.license_granted ?? 0;
  const quotaTotal = quota + granted;
  const low = quota <= QUOTA_LOW_WARNING;

  const rows = React.useMemo(
    () =>
      [...licenses].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).slice(0, 100),
    [licenses],
  );

  const maxMonth = Math.max(1, ...summary.byMonth.map((m) => m.commission));

  function exportCsv() {
    const header = ['Serial Key', 'Toko Pembeli', 'Pembeli', 'Paket', 'Tipe', 'Harga', 'Komisi', 'Status', 'Tanggal'];
    const body = licenses.map((l) => [
      l.serial_key,
      l.store?.store_name ?? '',
      l.store?.owner_name ?? '',
      PAKET_LABEL[l.paket_type],
      LICENSE_TYPE_LABEL[l.license_type],
      toNumber(l.price_idr),
      toNumber(l.commission_idr),
      l.status,
      (l.created_at ?? '').slice(0, 10),
    ]);
    downloadCsv(datedFilename('komisi-kasirpro'), toCsv([header, ...body]));
    toast.success('Laporan komisi diunduh', 'File CSV tersimpan di folder unduhan.');
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold">Komisi &amp; Tagihan</h1>
          <p className="text-sm text-muted-foreground">
            Riwayat jatah komisi dari penjualan lisensi dan status transfer ke toko Anda
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={licenses.length === 0}>
            <ArrowDownToLine className="h-4 w-4" /> Ekspor CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
            <RefreshCw className="h-4 w-4" /> Muat Ulang
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Jatah Komisi"
          value={rupiah(summary.total)}
          icon={<Wallet className="h-5 w-5" />}
          tone="success"
          hint={`${licenses.length} lisensi terjual`}
        />
        <StatCard
          label="Bundle PC + APP"
          value={rupiah(summary.byPaket.bundle_pc_app.commission)}
          icon={<Building2 className="h-5 w-5" />}
          hint={`${summary.byPaket.bundle_pc_app.count} lisensi x ${rupiah(PAKET_COMMISSION.bundle_pc_app)}`}
        />
        <StatCard
          label="Aplikasi Saja"
          value={rupiah(summary.byPaket.app_only.commission)}
          icon={<Banknote className="h-5 w-5" />}
          hint={`${summary.byPaket.app_only.count} lisensi x ${rupiah(PAKET_COMMISSION.app_only)}`}
        />
        <StatCard
          label="Langganan (10%)"
          value={rupiah(subscription.perPeriod)}
          icon={<Repeat className="h-5 w-5" />}
          tone="primary"
          hint={`${subscription.count} langganan • ~${rupiah(subscription.perYear, { compact: true })}/tahun`}
        />
      </div>

      {/* ATURAN KOMISI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-5 w-5 text-primary" /> Aturan Bagi Hasil
          </CardTitle>
          <CardDescription>Berlaku otomatis setiap lisensi dibuat dari dashboard aktivasi</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 text-left">Paket</th>
                <th className="py-2 text-right">Harga Jual</th>
                <th className="py-2 text-right">Jatah Toko Anda</th>
                <th className="py-2 text-right">Bagi KasirPro</th>
                <th className="py-2 text-right">Porsi Anda</th>
              </tr>
            </thead>
            <tbody>
              {(['bundle_pc_app', 'app_only'] as const).map((k) => (
                <tr key={k} className="border-b last:border-b-0">
                  <td className="py-2 font-medium">{PAKET_LABEL[k]}</td>
                  <td className="py-2 text-right tnum">{rupiah(PAKET_PRICE[k])}</td>
                  <td className="py-2 text-right font-semibold text-success tnum">
                    {rupiah(PAKET_COMMISSION[k])}
                  </td>
                  <td className="py-2 text-right tnum">{rupiah(PAKET_PRICE[k] - PAKET_COMMISSION[k])}</td>
                  <td className="py-2 text-right text-muted-foreground tnum">
                    {pct(PAKET_COMMISSION[k], PAKET_PRICE[k])}%
                  </td>
                </tr>
              ))}
              <tr className="border-b last:border-b-0">
                <td className="py-2 font-medium">Langganan (per tahun)</td>
                <td className="py-2 text-right tnum">10%</td>
                <td className="py-2 text-right font-semibold text-success tnum">10% nilai tagihan</td>
                <td className="py-2 text-right text-muted-foreground tnum">90% nilai tagihan</td>
                <td className="py-2 text-right text-muted-foreground tnum">berulang</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* TRANSAKSI KOMISI + STATUS BAYAR */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Komisi Bulanan</CardTitle>
            <CardDescription>Jumlah komisi yang jatuh dari lisensi dibuat per bulan</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.byMonth.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada lisensi terjual. Buat lisensi pertama untuk melihat komisi.
              </p>
            ) : (
              <div className="flex h-40 items-end gap-1.5 overflow-x-auto">
                {summary.byMonth.map((m) => (
                  <div key={m.month} className="group flex min-w-[40px] flex-1 flex-col items-center gap-1">
                    <div
                      className="relative w-full rounded-t bg-success/80 transition-colors hover:bg-success"
                      style={{ height: `${Math.max(4, (m.commission / maxMonth) * 100)}%` }}
                      title={`${m.label}: ${rupiah(m.commission)} dari ${m.count} lisensi`}
                    >
                      <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                        {rupiah(m.commission, { compact: true })}
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status Transfer</CardTitle>
            <CardDescription>Dibuat Super Admin dari Panel Admin</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Belum Ditransfer</span>
                <span className="font-bold text-warning tnum">{rupiah(summary.pendingPayout)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Sudah Ditransfer</span>
                <span className="font-bold text-success tnum">{rupiah(summary.paidPayout)}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Sisa Tagihan</span>
                <span className="font-bold tnum">
                  {rupiah(Math.max(0, summary.total - summary.paidPayout))}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Riwayat Transfer
              </p>
              {payouts.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Belum ada catatan transfer.
                </p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {payouts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs">
                      {p.status === 'paid' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <Clock className="h-4 w-4 shrink-0 text-warning" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold tnum">{rupiah(p.amount)}</p>
                        <p className="truncate text-muted-foreground">
                          {p.status === 'paid' && p.paid_at
                            ? `Dibayar ${fmtDate(p.paid_at)}`
                            : `Diajukan ${fmtDate(p.created_at)}`}
                          {p.note ? ` • ${p.note}` : ''}
                        </p>
                      </div>
                      <Badge variant={p.status === 'paid' ? 'success' : 'warning'} className="shrink-0 text-[10px]">
                        {p.status === 'paid' ? 'Lunas' : 'Menunggu'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KUOTA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pemakaian Kuota Lisensi</CardTitle>
          <CardDescription>
            Setiap lisensi yang dibuat mengurangi stok 1. Sisa {quota} dari {quotaTotal}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress
            value={quotaTotal > 0 ? ((quotaTotal - quota) / quotaTotal) * 100 : 0}
            indicatorClassName={low ? 'bg-destructive' : 'bg-primary'}
          />
          <p className="text-xs text-muted-foreground">
            {low
              ? `Sisa lisensi menipis. Hubungi Super Admin untuk topup +${TOPUP_AMOUNT} lisensi.`
              : 'Stok lisensi masih aman.'}
          </p>
        </CardContent>
      </Card>

      {/* RINCIAN PER LISENSI */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Wallet className="h-5 w-5 text-primary" />
          <div>
            <p className="font-semibold">Rincian Komisi per Lisensi</p>
            <p className="text-xs text-muted-foreground">
              Menampilkan {rows.length} dari {licenses.length} lisensi terakhir
            </p>
          </div>
        </div>
        {loading ? (
          <div className="grid place-items-center py-14">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-10 w-10" />}
            title="Belum ada komisi"
            description="Komisi akan terhitung otomatis setelah lisensi pertama terjual ke pembeli."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">Toko Pembeli</th>
                  <th className="px-3 py-2.5 text-left">Paket</th>
                  <th className="px-3 py-2.5 text-left">Tipe</th>
                  <th className="px-3 py-2.5 text-left">Tanggal</th>
                  <th className="px-3 py-2.5 text-right">Harga</th>
                  <th className="px-3 py-2.5 text-right">Komisi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{l.store?.store_name ?? '—'}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{l.serial_key}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">{PAKET_LABEL[l.paket_type]}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {LICENSE_TYPE_LABEL[l.license_type]}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {fmtDateTime(l.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tnum">
                      {rupiah(l.price_idr)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-success tnum">
                      {rupiah(l.commission_idr)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/30 text-sm font-semibold">
                <tr>
                  <td className="px-3 py-2.5" colSpan={4}>
                    Total {rows.length} lisensi
                  </td>
                  <td className="px-3 py-2.5 text-right tnum">
                    {rupiah(rows.reduce((a, l) => a + toNumber(l.price_idr), 0))}
                  </td>
                  <td className="px-3 py-2.5 text-right text-success tnum">
                    {rupiah(rows.reduce((a, l) => a + toNumber(l.commission_idr), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
