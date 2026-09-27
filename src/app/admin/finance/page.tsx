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
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';

import { ErrorBox, PageTitle } from '@/components/admin/admin-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState, StatCard } from '@/components/ui/empty-state';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  createPayout,
  fetchAdminPartners,
  fetchFinance,
  patchPayout,
  type AdminPartnerRow,
  type FinanceSummary,
} from '@/lib/admin-data';
import { datedFilename, downloadCsv, toCsv } from '@/lib/csv';
import { fmtDate, fmtDateTime, rupiah, toNumber } from '@/lib/utils';
import { PAKET_COMMISSION, PAKET_PRICE } from '@/types';

export default function AdminFinancePage() {
  const auth = useAuth();
  const toast = useToast();

  const [months, setMonths] = React.useState(6);
  const [data, setData] = React.useState<FinanceSummary | null>(null);
  const [partners, setPartners] = React.useState<AdminPartnerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    partnerId: '',
    amount: '',
    periodFrom: '',
    periodTo: '',
    note: '',
    markPaid: false,
  });
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, p] = await Promise.all([fetchFinance(months), fetchAdminPartners()]);
      setData(f);
      setPartners(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat laporan keuangan.');
    } finally {
      setLoading(false);
    }
  }, [months]);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  const totals = data?.totals;
  const maxMonth = Math.max(1, ...(data?.revenueByMonth ?? []).map((m) => m.revenue));

  function openForm(partnerId?: string) {
    setForm({
      partnerId: partnerId ?? partners[0]?.id ?? '',
      amount: '',
      periodFrom: '',
      periodTo: '',
      note: '',
      markPaid: false,
    });
    setFormOpen(true);
  }

  async function submitForm() {
    const partnerId = form.partnerId;
    const amount = toNumber(form.amount);
    if (!partnerId) {
      toast.error('Pilih partner');
      return;
    }
    if (amount <= 0) {
      toast.error('Nominal harus lebih dari 0');
      return;
    }
    setBusy(true);
    try {
      const res = await createPayout({
        partnerId,
        amount,
        periodFrom: form.periodFrom || null,
        periodTo: form.periodTo || null,
        note: form.note.trim(),
        markPaid: form.markPaid,
      });
      toast.success('Payout dicatat', res.message);
      setFormOpen(false);
      await refresh();
    } catch (e) {
      toast.error('Gagal menyimpan payout', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  }

  async function markPayout(id: string, action: 'mark_paid' | 'mark_pending') {
    try {
      const res = await patchPayout({ payoutId: id, action });
      toast.success('Diperbarui', res.message);
      await refresh();
    } catch (e) {
      toast.error('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  async function deletePayout(id: string) {
    try {
      const res = await patchPayout({ payoutId: id, action: 'delete' });
      toast.success('Dihapus', res.message);
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      toast.error('Gagal menghapus', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    }
  }

  function exportCsv() {
    if (!data) return;
    const header = ['Bulan', 'Jumlah Lisensi', 'Omzet', 'Komisi Partner', 'Bagi KasirPro'];
    const body = data.revenueByMonth.map((m) => [
      m.month,
      m.count,
      m.revenue,
      m.commission,
      m.revenue - m.commission,
    ]);
    const partnerHeader = ['Partner', 'Lisensi', 'Aktif', 'Komisi', 'Sudah Dibayar', 'Menunggu', 'Kuota'];
    const partnerBody = data.byPartner.map((p) => [
      p.nama_toko,
      p.licenses,
      p.active,
      p.commission,
      p.paidOut,
      p.pending,
      p.quota,
    ]);
    const csv = toCsv([
      ['Laporan Keuangan KasirPro'],
      ['Dibuat', new Date().toLocaleString('id-ID')],
      [],
      ['Total Omzet', totals?.revenueTotal ?? 0],
      ['Bundle PC + App', totals?.revenueBundle ?? 0],
      ['Aplikasi Saja', totals?.revenueAppOnly ?? 0],
      ['Komisi Partner', totals?.commissionTotal ?? 0],
      ['Bagi KasirPro', totals?.ourShare ?? 0],
      [],
      header,
      ...body,
      [],
      partnerHeader,
      ...partnerBody,
    ]);
    downloadCsv(datedFilename('keuangan-kasirpro'), csv);
    toast.success('Laporan keuangan diunduh');
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageTitle
        title="Laporan Keuangan"
        description="Omzet lisensi, komisi partner, dan status transfer"
        actions={
          <>
            <div className="flex overflow-hidden rounded-md border">
              {[3, 6, 12].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={`px-2.5 py-1.5 text-xs font-medium ${
                    months === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  }`}
                >
                  {m} bln
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data}>
              <ArrowDownToLine className="h-4 w-4" /> Ekspor CSV
            </Button>
            <Button size="sm" onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Catat Transfer
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {error && <ErrorBox message={error} />}

      {loading && !data ? (
        <div className="grid place-items-center rounded-xl border bg-card py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Omzet"
              value={rupiah(totals?.revenueTotal ?? 0)}
              icon={<Wallet className="h-5 w-5" />}
              tone="primary"
              hint={`${totals?.licenses ?? 0} lisensi terjual`}
            />
            <StatCard
              label="Komisi Partner"
              value={rupiah(totals?.commissionTotal ?? 0)}
              icon={<Building2 className="h-5 w-5" />}
              tone="warning"
              hint={`Menunggu transfer ${rupiah(totals?.pendingPayout ?? 0)}`}
            />
            <StatCard
              label="Bagi KasirPro"
              value={rupiah(totals?.ourShare ?? 0)}
              icon={<Banknote className="h-5 w-5" />}
              tone="success"
              hint={`Sudah dibayar ${rupiah(totals?.paidOut ?? 0)}`}
            />
            <StatCard
              label="Sisa Kewajiban"
              value={rupiah(
                Math.max(0, (totals?.commissionTotal ?? 0) - (totals?.paidOut ?? 0)),
              )}
              icon={<Clock className="h-5 w-5" />}
              tone="danger"
              hint="Komisi belum ditransfer ke partner"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Tren Omzet {months} Bulan</CardTitle>
                <CardDescription>
                  Bundle PC + APP {rupiah(PAKET_PRICE.bundle_pc_app)} (komisi{' '}
                  {rupiah(PAKET_COMMISSION.bundle_pc_app)}) • Aplikasi Saja{' '}
                  {rupiah(PAKET_PRICE.app_only)} (komisi {rupiah(PAKET_COMMISSION.app_only)})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.revenueByMonth ?? []).length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex h-44 items-end gap-2">
                      {data!.revenueByMonth.map((m) => {
                        const label = new Date(`${m.month}-01`).toLocaleDateString('id-ID', {
                          month: 'short',
                          year: '2-digit',
                        });
                        return (
                          <div key={m.month} className="group flex min-w-[46px] flex-1 flex-col items-center gap-1">
                            <div
                              className="relative w-full rounded-t bg-primary/85 transition-colors hover:bg-primary"
                              style={{ height: `${Math.max(4, (m.revenue / maxMonth) * 100)}%` }}
                              title={`${label}: ${rupiah(m.revenue)} • komisi ${rupiah(m.commission)}`}
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
                    <Separator />
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Omzet Bundle
                        </p>
                        <p className="font-bold tnum">{rupiah(totals?.revenueBundle ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Omzet App Saja
                        </p>
                        <p className="font-bold tnum">{rupiah(totals?.revenueAppOnly ?? 0)}</p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Jumlah Lisensi
                        </p>
                        <p className="font-bold tnum">{totals?.licenses ?? 0}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ringkasan Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Lisensi Aktif</span>
                  <Badge variant="success">{totals?.active ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Belum Dipakai</span>
                  <Badge variant="warning">{totals?.unused ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Diblokir</span>
                  <Badge variant="destructive">{totals?.blocked ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Kedaluwarsa</span>
                  <Badge variant="muted">{totals?.expired ?? 0}</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between font-semibold">
                  <span>Sudah Dibayar</span>
                  <span className="text-success tnum">{rupiah(totals?.paidOut ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <span>Belum Dibayar</span>
                  <span className="text-warning tnum">{rupiah(totals?.pendingPayout ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="border-b px-4 py-3">
              <p className="font-semibold">Rekap per Partner</p>
              <p className="text-xs text-muted-foreground">
                Klik nominal komisi untuk mencatat transfer ke partner tersebut
              </p>
            </div>
            {(data?.byPartner ?? []).length === 0 ? (
              <EmptyState
                icon={<Building2 className="h-10 w-10" />}
                title="Belum ada partner"
                description="Tambahkan partner di halaman Partner terlebih dahulu."
                className="border-0"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Partner</th>
                      <th className="px-3 py-2.5 text-center">Lisensi</th>
                      <th className="px-3 py-2.5 text-center">Aktif</th>
                      <th className="px-3 py-2.5 text-right">Komisi</th>
                      <th className="px-3 py-2.5 text-right">Dibayar</th>
                      <th className="px-3 py-2.5 text-right">Menunggu</th>
                      <th className="px-3 py-2.5 text-center">Kuota</th>
                      <th className="px-3 py-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.byPartner.map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="px-3 py-2.5 font-medium">{p.nama_toko}</td>
                        <td className="px-3 py-2.5 text-center tnum">{p.licenses}</td>
                        <td className="px-3 py-2.5 text-center tnum">{p.active}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tnum">
                          {rupiah(p.commission)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-success tnum">
                          {rupiah(p.paidOut)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-warning tnum">
                          {rupiah(p.pending)}
                        </td>
                        <td className="px-3 py-2.5 text-center tnum">{p.quota}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="xs" variant="outline" onClick={() => openForm(p.id)}>
                            <Plus className="h-3 w-3" /> Transfer
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-muted/30 text-sm font-semibold">
                    <tr>
                      <td className="px-3 py-2.5">Total</td>
                      <td className="px-3 py-2.5 text-center tnum">{totals?.licenses ?? 0}</td>
                      <td className="px-3 py-2.5 text-center tnum">{totals?.active ?? 0}</td>
                      <td className="px-3 py-2.5 text-right tnum">
                        {rupiah(totals?.commissionTotal ?? 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-success tnum">
                        {rupiah(totals?.paidOut ?? 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-warning tnum">
                        {rupiah(totals?.pendingPayout ?? 0)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b px-4 py-3">
              <p className="font-semibold">Riwayat Transfer</p>
              <p className="text-xs text-muted-foreground">Catatan transfer komisi ke partner</p>
            </div>
            {(data?.payouts ?? []).length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-10 w-10" />}
                title="Belum ada transfer"
                description="Catat transfer komisi agar partner bisa melihat riwayat di dashbordnya."
                className="border-0"
                action={
                  <Button size="sm" onClick={() => openForm()}>
                    <Plus className="h-4 w-4" /> Catat Transfer
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Partner</th>
                      <th className="px-3 py-2.5 text-right">Nominal</th>
                      <th className="px-3 py-2.5 text-left">Periode</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-left">Dicatat</th>
                      <th className="px-3 py-2.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.payouts.map((po) => {
                      const partner = data!.byPartner.find((p) => p.id === po.partner_id);
                      return (
                        <tr key={po.id} className="border-b last:border-b-0 hover:bg-muted/30">
                          <td className="px-3 py-2.5">
                            <p className="font-medium">{partner?.nama_toko ?? '—'}</p>
                            {po.note && <p className="text-xs text-muted-foreground">{po.note}</p>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tnum">
                            {rupiah(po.amount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                            {po.period_from || po.period_to
                              ? `${po.period_from ? fmtDate(po.period_from) : '?'} s/d ${
                                  po.period_to ? fmtDate(po.period_to) : '?'
                                }`
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge variant={po.status === 'paid' ? 'success' : 'warning'}>
                              {po.status === 'paid' ? 'Lunas' : 'Menunggu'}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                            {fmtDateTime(po.created_at)}
                            {po.paid_at && (
                              <p className="text-[10px] text-success">Dibayar {fmtDate(po.paid_at)}</p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            <div className="inline-flex gap-1">
                              {po.status === 'paid' ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="Tandai belum dibayar"
                                  onClick={() => void markPayout(po.id, 'mark_pending')}
                                >
                                  <Clock className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  title="Tandai sudah dibayar"
                                  onClick={() => void markPayout(po.id, 'mark_paid')}
                                >
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Hapus catatan"
                                onClick={() => setConfirmDelete(po.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* FORM TRANSFER */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat Transfer Komisi</DialogTitle>
            <DialogDescription>
              Sistem tidak memindahkan dana — catat manual setelah transfer bank/e-wallet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-partner">Partner</Label>
              <select
                id="f-partner"
                value={form.partnerId}
                onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm"
              >
                <option value="">Pilih partner…</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama_toko} — komisi {rupiah(p.commission, { compact: true })}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-amount">Nominal (Rp)</Label>
              <Input
                id="f-amount"
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d]/g, '') })}
                placeholder="2500000"
                className="tnum"
              />
              {(() => {
                const sel = partners.find((p) => p.id === form.partnerId);
                if (!sel) return null;
                const financeRow = data?.byPartner.find((p) => p.id === sel.id);
                const outstanding = Math.max(
                  0,
                  toNumber(sel.commission) - toNumber(financeRow?.paidOut ?? 0),
                );
                return (
                  <div className="flex gap-2 text-[11px]">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setForm({ ...form, amount: String(Math.round(toNumber(sel.commission))) })}
                    >
                      Total komisi ({rupiah(sel.commission)})
                    </button>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setForm({ ...form, amount: String(Math.round(outstanding)) })}
                    >
                      Sisa ({rupiah(outstanding)})
                    </button>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="f-from">Periode dari</Label>
                <Input
                  id="f-from"
                  type="date"
                  value={form.periodFrom}
                  onChange={(e) => setForm({ ...form, periodFrom: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-to">Periode sampai</Label>
                <Input
                  id="f-to"
                  type="date"
                  value={form.periodTo}
                  onChange={(e) => setForm({ ...form, periodTo: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-note">Catatan</Label>
              <Input
                id="f-note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="mis. BCA a/n Budi, 12 Sep"
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                id="f-paid"
                checked={form.markPaid}
                onCheckedChange={(v) => setForm({ ...form, markPaid: !!v })}
              />
              <Label htmlFor="f-paid" className="text-sm font-normal">
                Sudah ditransfer sekarang (tandai lunas)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button onClick={() => void submitForm()} loading={busy} disabled={!form.partnerId}>
              <CheckCircle2 className="h-4 w-4" /> Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus catatan transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              Catatan payout ini akan dihapus permanen dari database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) void deletePayout(confirmDelete);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {(totals?.pendingPayout ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-xs text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Ada {rupiah(totals?.pendingPayout ?? 0)} komisi partner yang belum ditransfer. Segera
            transfer agar hubungan bisnis tetap baik.
          </span>
        </div>
      )}
    </div>
  );
}
