'use client';

import * as React from 'react';
import {
  Ban,
  CalendarPlus,
  CheckCircle2,
  Copy,
  Fingerprint,
  History,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Unlock,
} from 'lucide-react';

import { ErrorBox, PageTitle } from '@/components/admin/admin-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/empty-state';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  fetchAdminLicenses,
  fetchAdminPartners,
  patchAdminLicense,
  type AdminLicenseRow,
  type AdminPartnerRow,
} from '@/lib/admin-data';
import { datedFilename, downloadCsv, toCsv } from '@/lib/csv';
import { fmtDate, fmtDateTime, rupiah } from '@/lib/utils';
import {
  LICENSE_TYPE_LABEL,
  PAKET_LABEL,
  STATUS_LABEL,
  type HwidHistoryRow,
  type LicenseStatus,
} from '@/types';

const STATUS_TABS: Array<{ v: 'all' | LicenseStatus; label: string }> = [
  { v: 'all', label: 'Semua' },
  { v: 'active', label: 'Aktif' },
  { v: 'unused', label: 'Belum Dipakai' },
  { v: 'blocked', label: 'Diblokir' },
  { v: 'expired', label: 'Kedaluwarsa' },
  { v: 'revoked', label: 'Dicabut' },
];

export default function AdminLicensesPage() {
  const auth = useAuth();
  const toast = useToast();

  const [licenses, setLicenses] = React.useState<AdminLicenseRow[]>([]);
  const [partners, setPartners] = React.useState<AdminPartnerRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<'all' | LicenseStatus>('all');
  const [partnerId, setPartnerId] = React.useState<string>('all');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const [detail, setDetail] = React.useState<AdminLicenseRow | null>(null);
  const [history, setHistory] = React.useState<HwidHistoryRow[]>([]);
  const [logs, setLogs] = React.useState<Array<Record<string, unknown>>>([]);

  const [confirm, setConfirm] = React.useState<{
    license: AdminLicenseRow;
    action: 'block' | 'unblock' | 'reset_hwid' | 'delete';
  } | null>(null);

  const [extend, setExtend] = React.useState<AdminLicenseRow | null>(null);
  const [extendMonths, setExtendMonths] = React.useState('12');
  const [extendBusy, setExtendBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lic, par] = await Promise.all([
        fetchAdminLicenses({
          status,
          partnerId: partnerId === 'all' ? null : partnerId,
          q: query,
          limit: 300,
        }),
        fetchAdminPartners(),
      ]);
      setLicenses(lic.licenses);
      setTotal(lic.total);
      setPartners(par);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat lisensi.');
    } finally {
      setLoading(false);
    }
  }, [status, partnerId, query]);

  React.useEffect(() => {
    if (!auth.userId) return;
    const t = window.setTimeout(() => void refresh(), 350);
    return () => window.clearTimeout(t);
  }, [auth.userId, refresh]);

  async function openDetail(l: AdminLicenseRow) {
    setDetail(l);
    setHistory([]);
    setLogs([]);
    try {
      const supabase = createClient();
      const [h, g] = await Promise.all([
        supabase
          .from('hwid_history')
          .select('*')
          .eq('license_id', l.id)
          .order('created_at', { ascending: false })
          .then((r) => (r.data ?? []) as unknown as HwidHistoryRow[]),
        supabase
          .from('hwid_logs')
          .select('*')
          .eq('license_id', l.id)
          .order('activated_at', { ascending: false })
          .limit(20)
          .then((r) => (r.data ?? []) as Array<Record<string, unknown>>),
      ]);
      setHistory(h);
      setLogs(g);
    } catch {
      /* detail tetap tampil tanpa riwayat */
    }
  }

  async function doPatch(l: AdminLicenseRow, action: Parameters<typeof patchAdminLicense>[0]['action'], extra?: { months?: number }) {
    setBusyId(l.id);
    try {
      const res = await patchAdminLicense({ licenseId: l.id, action, ...extra });
      toast.success('Berhasil', res.message);
      setConfirm(null);
      if (detail?.id === l.id) await openDetail(l);
      await refresh();
    } catch (e) {
      toast.error('Gagal', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitExtend() {
    if (!extend) return;
    const months = parseInt(extendMonths, 10);
    if (!Number.isFinite(months) || months < 1) {
      toast.error('Jumlah bulan tidak valid');
      return;
    }
    setExtendBusy(true);
    try {
      const res = await patchAdminLicense({ licenseId: extend.id, action: 'extend', months });
      toast.success('Lisensi diperpanjang', res.message);
      setExtend(null);
      await refresh();
    } catch (e) {
      toast.error('Gagal memperpanjang', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setExtendBusy(false);
    }
  }

  function exportCsv() {
    const header = [
      'Serial Key',
      'Toko',
      'Pembeli',
      'Partner',
      'Paket',
      'Tipe',
      'Status',
      'HWID',
      'Harga',
      'Komisi',
      'Kedaluwarsa',
      'Dibuat',
    ];
    const body = licenses.map((l) => [
      l.serial_key,
      l.store?.store_name ?? '',
      l.store?.owner_name ?? '',
      l.partner?.nama_toko ?? '',
      PAKET_LABEL[l.paket_type],
      LICENSE_TYPE_LABEL[l.license_type],
      l.status,
      l.hwid_locked ?? '',
      l.price_idr,
      l.commission_idr,
      l.expires_at ? l.expires_at.slice(0, 10) : '',
      l.created_at.slice(0, 10),
    ]);
    downloadCsv(datedFilename('lisensi-kasirpro'), toCsv([header, ...body]));
    toast.success('Data lisensi diunduh', `${licenses.length} baris CSV.`);
  }

  const expiredCount = licenses.filter((l) => l.status === 'expired').length;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageTitle
        title="Lisensi & Hardware ID"
        description="Semua lisensi lintas partner, lengkap dengan HWID yang terkunci"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={licenses.length === 0}>
              <Copy className="h-4 w-4" /> Ekspor CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
              <RefreshCw className="h-4 w-4" /> Muat Ulang
            </Button>
          </>
        }
      />

      {error && <ErrorBox message={error} />}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari serial key atau HWID…"
            className="pl-9"
          />
        </div>
        <Select value={partnerId} onValueChange={setPartnerId}>
          <SelectTrigger className="lg:w-64">
            <SelectValue placeholder="Semua partner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua partner</SelectItem>
            {partners.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nama_toko}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((t) => (
          <Button
            key={t.v}
            size="sm"
            variant={status === t.v ? 'default' : 'outline'}
            onClick={() => setStatus(t.v)}
          >
            {t.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {licenses.length} dari {total} lisensi
          {expiredCount > 0 ? ` • ${expiredCount} kedaluwarsa` : ''}
        </span>
      </div>

      {loading ? (
        <div className="grid place-items-center rounded-xl border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : licenses.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-10 w-10" />}
          title="Tidak ada lisensi"
          description="Ubah filter, atau buat lisensi baru dari halaman partner."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">Serial Key</th>
                  <th className="px-3 py-2.5 text-left">Toko Pembeli</th>
                  <th className="px-3 py-2.5 text-left">Partner</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-left">HWID</th>
                  <th className="px-3 py-2.5 text-left">Kedaluwarsa</th>
                  <th className="px-3 py-2.5 text-right">Komisi</th>
                  <th className="px-3 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l) => (
                  <tr key={l.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 font-mono font-bold tracking-wider hover:underline"
                        onClick={() => {
                          void navigator.clipboard?.writeText(l.serial_key);
                          toast.success('Serial Key disalin', l.serial_key);
                        }}
                      >
                        {l.serial_key} <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <p className="text-[10px] text-muted-foreground">
                        {PAKET_LABEL[l.paket_type]} • {LICENSE_TYPE_LABEL[l.license_type]}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{l.store?.store_name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.store?.owner_name ?? '—'}
                        {l.store?.no_hp ? ` • ${l.store.no_hp}` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      {l.partner?.nama_toko ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge
                        variant={
                          l.status === 'active'
                            ? 'success'
                            : l.status === 'unused'
                              ? 'warning'
                              : l.status === 'blocked'
                                ? 'destructive'
                                : 'muted'
                        }
                      >
                        {STATUS_LABEL[l.status]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {l.hwid_locked ? (
                        <button
                          type="button"
                          className="font-mono text-[11px] text-muted-foreground hover:text-primary hover:underline"
                          onClick={() => {
                            void navigator.clipboard?.writeText(l.hwid_locked ?? '');
                            toast.success('HWID disalin', l.hwid_locked ?? '');
                          }}
                        >
                          {l.hwid_locked.slice(0, 8)}…{l.hwid_locked.slice(-4)}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {l.expires_at ? fmtDate(l.expires_at) : 'Selamanya'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-success tnum">
                      {rupiah(l.commission_idr)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        {l.status === 'blocked' ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Buka blokir"
                            onClick={() => setConfirm({ license: l, action: 'unblock' })}
                          >
                            <Unlock className="h-4 w-4 text-success" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Blokir lisensi"
                            onClick={() => setConfirm({ license: l, action: 'block' })}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Reset HWID (aktivasi ulang)"
                          onClick={() => setConfirm({ license: l, action: 'reset_hwid' })}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Perpanjang langganan"
                          onClick={() => {
                            setExtend(l);
                            setExtendMonths('12');
                          }}
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Hapus lisensi" onClick={() => setConfirm({ license: l, action: 'delete' })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="Detail & riwayat HWID" onClick={() => void openDetail(l)}>
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* DETAIL + RIWAYAT HWID */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Detail Lisensi
            </DialogTitle>
            <DialogDescription className="font-mono tracking-wider">{detail?.serial_key}</DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <Row label="Status" value={STATUS_LABEL[detail.status]} />
                <Row label="Toko Pembeli" value={detail.store?.store_name ?? '—'} />
                <Row label="Pembeli" value={detail.store?.owner_name ?? '—'} />
                <Row label="No. HP" value={detail.store?.no_hp ?? '—'} />
                <Row label="Alamat" value={detail.store?.alamat ?? '—'} />
                <Row label="Partner" value={detail.partner?.nama_toko ?? '—'} />
                <Separator />
                <Row label="Paket" value={PAKET_LABEL[detail.paket_type]} />
                <Row label="Tipe Lisensi" value={LICENSE_TYPE_LABEL[detail.license_type]} />
                <Row
                  label="Kedaluwarsa"
                  value={detail.expires_at ? fmtDateTime(detail.expires_at) : 'Selamanya'}
                />
                <Separator />
                <Row label="Harga Jual" value={rupiah(detail.price_idr)} />
                <Row label="Komisi Partner" value={rupiah(detail.commission_idr)} tone="text-success" />
                <Row label="Dibuat" value={fmtDateTime(detail.created_at)} />
                <Row
                  label="Diaktivasi"
                  value={detail.activated_at ? fmtDateTime(detail.activated_at) : 'Belum pernah'}
                />
              </div>

              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Fingerprint className="h-4 w-4" /> Hardware ID Terkunci
                </p>
                <p className="mt-1 break-all font-mono text-xs">{detail.hwid_locked ?? 'Belum diaktivasi'}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Aplikasi POS membandingkan HWID ini setiap kali dibuka. Copy folder aplikasi ke PC lain
                  akan membuat aplikasi terkunci.
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Riwayat Hardware ID</p>
                {history.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Belum ada riwayat. Lisensi ini belum pernah diaktivasi.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg border p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="break-all font-mono font-semibold">{h.hwid}</span>
                          {h.is_current ? (
                            <Badge variant="success" className="shrink-0 text-[10px]">
                              <CheckCircle2 className="h-3 w-3" /> Saat Ini
                            </Badge>
                          ) : (
                            <Badge variant="muted" className="shrink-0 text-[10px]">
                              Lama
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {fmtDateTime(h.created_at)}
                          {h.device_name ? ` • ${h.device_name}` : ''}
                          {h.app_version ? ` • v${h.app_version}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {logs.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <ShieldAlert className="h-4 w-4" /> Log Verifikasi
                  </p>
                  <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                    {logs.map((g, i) => (
                      <div
                        key={String(g.id ?? i)}
                        className="flex items-center justify-between gap-2 rounded border p-2 text-[11px]"
                      >
                        <span className="font-mono">{String(g.result ?? '-')}</span>
                        <span className="truncate text-muted-foreground">
                          {String(g.ip_address ?? '-')} • {fmtDateTime(String(g.activated_at ?? ''))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>
                  Tutup
                </Button>
                {detail.status === 'blocked' ? (
                  <Button
                    variant="success"
                    onClick={() => void doPatch(detail, 'unblock')}
                    loading={busyId === detail.id}
                  >
                    <Unlock className="h-4 w-4" /> Buka Blokir
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={() => setConfirm({ license: detail, action: 'block' })}
                  >
                    <Ban className="h-4 w-4" /> Blokir
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PERPANJANG */}
      <Dialog open={!!extend} onOpenChange={(o) => !o && setExtend(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Perpanjang Langganan</DialogTitle>
            <DialogDescription className="font-mono tracking-wider">{extend?.serial_key}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              {[1, 3, 6, 12, 24].map((m) => (
                <Button
                  key={m}
                  size="xs"
                  variant={extendMonths === String(m) ? 'default' : 'outline'}
                  onClick={() => setExtendMonths(String(m))}
                >
                  {m} bln
                </Button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={120}
              value={extendMonths}
              onChange={(e) => setExtendMonths(e.target.value.replace(/[^\d]/g, ''))}
              className="tnum"
            />
            <p className="text-xs text-muted-foreground">
              Berlaku sekarang: {extend?.expires_at ? fmtDate(extend.expires_at) : 'selamanya (permanen)'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtend(null)} disabled={extendBusy}>
              Batal
            </Button>
            <Button onClick={() => void submitExtend()} loading={extendBusy}>
              <CalendarPlus className="h-4 w-4" /> Perpanjang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KONFIRMASI */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === 'block' && 'Blokir lisensi ini?'}
              {confirm?.action === 'unblock' && 'Buka blokir lisensi ini?'}
              {confirm?.action === 'reset_hwid' && 'Reset Hardware ID?'}
              {confirm?.action === 'delete' && 'Hapus lisensi permanen?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === 'block' &&
                'Aplikasi POS pada perangkat pembeli akan langsung terkunci dan tidak bisa dipakai.'}
              {confirm?.action === 'unblock' &&
                'Lisensi kembali aktif dan aplikasi bisa dipakai kembali pada HWID yang tercatat.'}
              {confirm?.action === 'reset_hwid' &&
                'HWID dilepas sehingga lisensi bisa diaktivasi ulang di perangkat lain. Riwayat HWID lama ditandai tidak berlaku.'}
              {confirm?.action === 'delete' &&
                'Data lisensi dihapus permanen dari database. Tindakan ini tidak bisa dibatalkan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm?.action === 'unblock'
                  ? 'bg-success text-success-foreground hover:bg-success/90'
                  : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              }
              onClick={(e) => {
                e.preventDefault();
                if (confirm) void doPatch(confirm.license, confirm.action);
              }}
            >
              {confirm?.action === 'block' && <Ban className="mr-2 h-4 w-4" />}
              {confirm?.action === 'unblock' && <Unlock className="mr-2 h-4 w-4" />}
              {confirm?.action === 'reset_hwid' && <RotateCcw className="mr-2 h-4 w-4" />}
              {confirm?.action === 'delete' && <Trash2 className="mr-2 h-4 w-4" />}
              Ya, Lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${tone ?? ''}`}>{value}</span>
    </div>
  );
}
