'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  Loader2,
  MapPin,
  MonitorSmartphone,
  Phone,
  RefreshCw,
  Search,
  Store,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState, StatCard } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { getDB, type LocalLicense } from '@/lib/db/local';
import { fetchLicenses, fetchStores } from '@/lib/partner-data';
import { fmtDateTime, rupiah, toNumber } from '@/lib/utils';
import {
  LICENSE_TYPE_LABEL,
  PAKET_LABEL,
  STATUS_LABEL,
  type LicenseStatus,
  type LicenseWithStore,
  type Store as StoreRow,
} from '@/types';

export default function PartnerStoresPage() {
  const auth = useAuth();
  const toast = useToast();
  const partnerId = auth.partner?.id ?? null;

  const [licenses, setLicenses] = React.useState<LicenseWithStore[]>([]);
  const [stores, setStores] = React.useState<StoreRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [detail, setDetail] = React.useState<StoreRow | null>(null);

  const refresh = React.useCallback(async () => {
    if (!partnerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [lic, sto] = await Promise.all([fetchLicenses(partnerId), fetchStores(partnerId)]);
      setLicenses(lic);
      setStores(sto);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data toko.');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  /* Lisensi per toko (dari cache lokal perangkat yang sudah aktivasi) */
  const localLicenses = useLiveQuery(
    () => getDB().licenses_cache.toArray(),
    [],
    [] as LocalLicense[],
  ) as LocalLicense[] | undefined;

  const byStore = React.useMemo(() => {
    const map = new Map<string, LicenseWithStore>();
    for (const l of licenses) if (l.store_id) map.set(l.store_id, l);
    return map;
  }, [licenses]);

  const byStoreIdLocal = React.useMemo(() => {
    const map = new Map<string, LocalLicense>();
    for (const l of localLicenses ?? []) if (l.store_id) map.set(l.store_id, l);
    return map;
  }, [localLicenses]);

  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) =>
        s.store_name.toLowerCase().includes(q) ||
        s.owner_name.toLowerCase().includes(q) ||
        (s.no_hp ?? '').toLowerCase().includes(q) ||
        (s.alamat ?? '').toLowerCase().includes(q),
    );
  }, [stores, query]);

  const stats = React.useMemo(() => {
    let active = 0;
    let unused = 0;
    let problem = 0;
    for (const s of stores) {
      const lic = byStore.get(s.id);
      const local = byStoreIdLocal.get(s.id);
      const status = (local?.status ?? lic?.status) as LicenseStatus | undefined;
      if (status === 'active') active += 1;
      else if (status === 'unused') unused += 1;
      else if (status) problem += 1;
    }
    return { active, unused, problem, omzet: stores.reduce((a, s) => a + toNumber(licenses.find((l) => l.store_id === s.id)?.price_idr), 0) };
  }, [stores, byStore, byStoreIdLocal, licenses]);

  function statusOf(s: StoreRow): LicenseStatus | null {
    return (byStoreIdLocal.get(s.id)?.status ?? byStore.get(s.id)?.status ?? null) as LicenseStatus | null;
  }

  const detailLicense = detail ? byStore.get(detail.id) ?? null : null;
  const detailLocal = detail ? byStoreIdLocal.get(detail.id) ?? null : null;
  const detailStatus = (detailLocal?.status ?? detailLicense?.status ?? null) as LicenseStatus | null;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold">Toko Pembeli</h1>
          <p className="text-sm text-muted-foreground">
            Daftar toko yang sudah Anda beri lisensi, lengkap dengan data pembeli
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void refresh()}
          loading={loading}
        >
          <RefreshCw className="h-4 w-4" /> Muat Ulang
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Toko" value={stores.length} icon={<Store className="h-5 w-5" />} />
        <StatCard
          label="Sudah Aktif"
          value={stats.active}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
          hint="Aplikasi sudah dipakai di perangkat pembeli"
        />
        <StatCard
          label="Belum Diaktivasi"
          value={stats.unused}
          icon={<MonitorSmartphone className="h-5 w-5" />}
          tone="warning"
          hint="Serial key sudah dibagikan, belum diaktivasi"
        />
        <StatCard
          label="Nilai Terjual"
          value={rupiah(stats.omzet, { compact: true })}
          icon={<Phone className="h-5 w-5" />}
          tone="primary"
          hint={`Komisi Anda ${rupiah(licenses.reduce((a, l) => a + toNumber(l.commission_idr), 0), { compact: true })}`}
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama toko, pembeli, no HP, atau alamat…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="grid place-items-center rounded-xl border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Store className="h-10 w-10" />}
          title={stores.length === 0 ? 'Belum ada toko pembeli' : 'Tidak ada toko yang cocok'}
          description={
            stores.length === 0
              ? 'Data toko pembeli otomatis terisi saat Anda membuat lisensi di halaman Aktivasi.'
              : 'Ubah kata kunci pencarian.'
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const lic = byStore.get(s.id) ?? null;
            const st = statusOf(s);
            return (
              <Card key={s.id} className="flex flex-col">
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.store_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        Pemilik: {s.owner_name}
                      </p>
                    </div>
                    <Badge
                      variant={st === 'active' ? 'success' : st === 'unused' ? 'warning' : st ? 'destructive' : 'muted'}
                      className="shrink-0"
                    >
                      {st ? STATUS_LABEL[st] : 'Tanpa Lisensi'}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {s.no_hp && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {s.no_hp}
                      </p>
                    )}
                    {s.alamat && (
                      <p className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{s.alamat}</span>
                      </p>
                    )}
                    {s.device_note && (
                      <p className="flex items-center gap-1.5">
                        <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" /> {s.device_note}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Paket</span>
                      <span className="font-medium">{PAKET_LABEL[s.paket_type]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Lisensi</span>
                      <span className="font-medium">{LICENSE_TYPE_LABEL[s.license_type]}</span>
                    </div>
                    {lic && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Serial Key</span>
                          <button
                            type="button"
                            className="font-mono text-[11px] font-semibold hover:underline"
                            onClick={() => {
                              void navigator.clipboard?.writeText(lic.serial_key);
                              toast.success('Serial Key disalin', lic.serial_key);
                            }}
                          >
                            {lic.serial_key}
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Komisi Anda</span>
                          <span className="font-semibold text-success tnum">
                            {rupiah(lic.commission_idr)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <Button variant="outline" size="sm" className="mt-auto w-full" onClick={() => setDetail(s)}>
                    Lihat Detail
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* DETAIL TOKO */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" /> {detail?.store_name}
            </DialogTitle>
            <DialogDescription>Data pembeli &amp; status lisensinya</DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Status Lisensi</span>
                  <span className="text-right font-medium">
                    {detailStatus ? STATUS_LABEL[detailStatus] : '—'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Nama Pembeli</span>
                  <span className="text-right font-medium">{detail.owner_name}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">No. HP</span>
                  <span className="text-right font-medium">{detail.no_hp ?? '—'}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Alamat</span>
                  <span className="text-right font-medium">{detail.alamat ?? '—'}</span>
                </div>
                <Separator />
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Paket</span>
                  <span className="text-right font-medium">{PAKET_LABEL[detail.paket_type]}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Tipe Lisensi</span>
                  <span className="text-right font-medium">{LICENSE_TYPE_LABEL[detail.license_type]}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-muted-foreground">Catatan Perangkat</span>
                  <span className="text-right font-medium">{detail.device_note ?? '—'}</span>
                </div>
              </div>

              {detailLicense ? (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Fingerprint className="h-4 w-4" /> Informasi Lisensi
                  </p>
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">Serial Key</span>
                    <span className="text-right font-mono text-xs font-bold tracking-wider">
                      {detailLicense.serial_key}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">Hardware ID</span>
                    <span className="text-right font-mono text-[11px]">
                      {detailLicense.hwid_locked ?? 'Belum diaktivasi'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">Dibuat</span>
                    <span className="text-right font-medium">{fmtDateTime(detailLicense.created_at)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">Diaktivasi</span>
                    <span className="text-right font-medium">
                      {detailLicense.activated_at ? fmtDateTime(detailLicense.activated_at) : 'Belum'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">Harga Jual</span>
                    <span className="text-right font-medium tnum">{rupiah(detailLicense.price_idr)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-muted-foreground">Komisi Toko</span>
                    <span className="text-right font-semibold text-success tnum">
                      {rupiah(detailLicense.commission_idr)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Belum ada lisensi untuk toko ini.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
