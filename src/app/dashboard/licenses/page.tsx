'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Eye,
  Fingerprint,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { fetchHwidHistory, fetchLicenses } from '@/lib/partner-data';
import { getDB } from '@/lib/db/local';
import { fmtDateTime, rupiah } from '@/lib/utils';
import {
  LICENSE_TYPE_LABEL,
  PAKET_LABEL,
  STATUS_LABEL,
  type HwidHistoryRow,
  type LicenseStatus,
  type LicenseWithStore,
} from '@/types';

const STATUS_FILTERS: Array<{ v: 'all' | LicenseStatus; label: string }> = [
  { v: 'all', label: 'Semua' },
  { v: 'unused', label: 'Belum Dipakai' },
  { v: 'active', label: 'Aktif' },
  { v: 'blocked', label: 'Diblokir' },
  { v: 'expired', label: 'Kedaluwarsa' },
];

export default function PartnerLicensesPage() {
  const auth = useAuth();
  const toast = useToast();

  const [licenses, setLicenses] = React.useState<LicenseWithStore[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<'all' | LicenseStatus>('all');
  const [detail, setDetail] = React.useState<LicenseWithStore | null>(null);
  const [history, setHistory] = React.useState<HwidHistoryRow[]>([]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLicenses(await fetchLicenses(auth.partner?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat lisensi.');
    } finally {
      setLoading(false);
    }
  }, [auth.partner?.id]);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  // Status real-time dari cache lokal perangkat yang sudah aktivasi
  const localStatus = useLiveQuery(
    () =>
      getDB()
        .licenses_cache.toArray()
        .then((rows) => new Map(rows.map((r) => [r.id, r.status as LicenseStatus]))),
    [],
    new Map<string, LicenseStatus>(),
  );

  const list = React.useMemo(() => {
    let out = licenses;
    if (status !== 'all') out = out.filter((l) => statusOf(l) === status);
    const q = query.trim().toLowerCase();
    if (!q) return out;
    return out.filter(
      (l) =>
        l.serial_key.toLowerCase().includes(q) ||
        (l.store?.store_name ?? '').toLowerCase().includes(q) ||
        (l.store?.owner_name ?? '').toLowerCase().includes(q) ||
        (l.hwid_locked ?? '').toLowerCase().includes(q) ||
        (l.store?.no_hp ?? '').toLowerCase().includes(q),
    );
    function statusOf(x: LicenseWithStore): LicenseStatus {
      return (localStatus?.get(x.id) as LicenseStatus) || x.status;
    }
  }, [licenses, status, query, localStatus]);

  async function openDetail(l: LicenseWithStore) {
    setDetail(l);
    try {
      setHistory((await fetchHwidHistory(l.id)) as HwidHistoryRow[]);
    } catch {
      setHistory([]);
    }
  }

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: licenses.length, unused: 0, active: 0, blocked: 0, expired: 0 };
    for (const l of licenses) {
      const s = (localStatus?.get(l.id) as LicenseStatus) || l.status;
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [licenses, localStatus]);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold">Lisensi Saya</h1>
          <p className="text-sm text-muted-foreground">
            {licenses.length} lisensi dibuat • {counts.active ?? 0} sudah aktif di perangkat pembeli
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void refresh()} loading={loading}>
          <RefreshCw className="h-4 w-4" /> Muat Ulang
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari serial key, nama toko, pembeli, no HP, atau HWID…"
            className="pl-9"
          />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.v}
              size="sm"
              variant={status === f.v ? 'default' : 'outline'}
              onClick={() => setStatus(f.v)}
              className="shrink-0"
            >
              {f.label}
              <span className="ml-1 rounded bg-black/10 px-1 text-[10px] tnum dark:bg-white/15">
                {counts[f.v] ?? 0}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Tabel */}
      {loading ? (
        <div className="grid place-items-center rounded-xl border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-10 w-10" />}
          title={licenses.length === 0 ? 'Belum ada lisensi' : 'Tidak ada lisensi yang cocok'}
          description={
            licenses.length === 0
              ? 'Buat lisensi pertama Anda dari Dashboard Aktivasi.'
              : 'Ubah kata kunci atau filter status.'
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">Serial Key</th>
                  <th className="px-3 py-2.5 text-left">Toko Pembeli</th>
                  <th className="px-3 py-2.5 text-left">Paket</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-left">HWID</th>
                  <th className="px-3 py-2.5 text-left">Dibuat</th>
                  <th className="px-3 py-2.5 text-right">Komisi</th>
                  <th className="px-3 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  const s = (localStatus?.get(l.id) as LicenseStatus) || l.status;
                  return (
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
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{l.store?.store_name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.store?.owner_name ?? '—'}
                          {l.store?.no_hp ? ` • ${l.store.no_hp}` : ''}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <p className="text-xs">{PAKET_LABEL[l.paket_type]}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {LICENSE_TYPE_LABEL[l.license_type]}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge
                          variant={
                            s === 'active' ? 'success' : s === 'unused' ? 'warning' : 'destructive'
                          }
                        >
                          {STATUS_LABEL[s]}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {l.hwid_locked ? (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {l.hwid_locked.slice(0, 8)}…{l.hwid_locked.slice(-4)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDateTime(l.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-success tnum">
                        {rupiah(l.commission_idr)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button variant="ghost" size="icon-sm" onClick={() => void openDetail(l)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* DETAIL */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Detail Lisensi
            </DialogTitle>
            <DialogDescription className="font-mono tracking-wider">{detail?.serial_key}</DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <Row label="Status" value={STATUS_LABEL[(localStatus?.get(detail.id) as LicenseStatus) || detail.status]} />
                <Row label="Toko Pembeli" value={detail.store?.store_name ?? '—'} />
                <Row label="Nama Pembeli" value={detail.store?.owner_name ?? '—'} />
                <Row label="No. HP" value={detail.store?.no_hp ?? '—'} />
                <Row label="Alamat" value={detail.store?.alamat ?? '—'} />
                <Separator />
                <Row label="Paket" value={PAKET_LABEL[detail.paket_type]} />
                <Row label="Tipe Lisensi" value={LICENSE_TYPE_LABEL[detail.license_type]} />
                {detail.expires_at && <Row label="Kedaluwarsa" value={fmtDateTime(detail.expires_at)} />}
                <Separator />
                <Row label="Harga Jual" value={rupiah(detail.price_idr)} />
                <Row label="Komisi Toko" value={rupiah(detail.commission_idr)} tone="text-success" />
                <Row label="Dibuat" value={fmtDateTime(detail.created_at)} />
                <Row label="Diaktivasi" value={detail.activated_at ? fmtDateTime(detail.activated_at) : 'Belum'} />
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Fingerprint className="h-4 w-4" /> Riwayat Hardware ID
                </p>
                {history.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Belum ada riwayat HWID. Lisensi ini belum pernah diaktivasi.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg border p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold">{h.hwid}</span>
                          {h.is_current ? (
                            <Badge variant="success" className="text-[10px]">
                              <CheckCircle2 className="h-3 w-3" /> Saat Ini
                            </Badge>
                          ) : (
                            <Badge variant="muted" className="text-[10px]">
                              Riwayat
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
            </div>
          )}
        </DialogContent>
      </Dialog>
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
