'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  MapPin,
  MonitorSmartphone,
  Phone,
  RefreshCw,
  Search,
  Store,
} from 'lucide-react';

import { ErrorBox, PageTitle } from '@/components/admin/admin-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, StatCard } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { getDB, type LocalLicense } from '@/lib/db/local';
import { fetchAllStores, fetchAdminLicenses, type AdminLicenseRow } from '@/lib/admin-data';
import { datedFilename, downloadCsv, toCsv } from '@/lib/csv';
import { fmtDate, fmtDateTime, rupiah } from '@/lib/utils';
import { LICENSE_TYPE_LABEL, PAKET_LABEL, STATUS_LABEL, type Store as StoreRow } from '@/types';

export default function AdminStoresPage() {
  const auth = useAuth();
  const toast = useToast();

  const [stores, setStores] = React.useState<StoreRow[]>([]);
  const [licenses, setLicenses] = React.useState<AdminLicenseRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([fetchAllStores(), fetchAdminLicenses({ limit: 500 })]);
      setStores(s);
      setLicenses(l.licenses);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data toko.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auth.userId) void refresh();
  }, [auth.userId, refresh]);

  /** Status real-time dari perangkat yang sedang menjalankan aplikasi POS. */
  const localLicenses = useLiveQuery(
    () => getDB().licenses_cache.toArray(),
    [],
    [] as LocalLicense[],
  ) as LocalLicense[] | undefined;

  const localByLicenseId = React.useMemo(
    () => new Map((localLicenses ?? []).map((l) => [l.id, l])),
    [localLicenses],
  );

  const licenseByStore = React.useMemo(() => {
    const map = new Map<string, AdminLicenseRow>();
    for (const l of licenses) if (l.store_id) map.set(l.store_id, l);
    return map;
  }, [licenses]);

  const partnerName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const l of licenses) if (l.partner_id && l.partner) map.set(l.partner_id, l.partner.nama_toko);
    return map;
  }, [licenses]);

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
    const rows = stores.map((s) => licenseByStore.get(s.id) ?? null);
    return {
      total: stores.length,
      active: rows.filter((l) => statusOf(l, localByLicenseId) === 'active').length,
      unlocked: rows.filter((l) => l && !l.hwid_locked).length,
      noLicense: rows.filter((l) => !l).length,
      omzet: rows.reduce((a, l) => a + (l?.price_idr ?? 0), 0),
    };
  }, [stores, licenseByStore, localByLicenseId]);

  function exportCsv() {
    const header = [
      'Toko',
      'Pembeli',
      'No HP',
      'Alamat',
      'Paket',
      'Tipe Lisensi',
      'Aktif',
      'Serial Key',
      'Status',
      'HWID',
      'Diaktivasi',
      'Dibuat',
    ];
    const body = list.map((s) => {
      const l = licenseByStore.get(s.id) ?? null;
      const local = l ? localByLicenseId.get(l.id) : undefined;
      return [
        s.store_name,
        s.owner_name,
        s.no_hp ?? '',
        s.alamat ?? '',
        PAKET_LABEL[s.paket_type],
        LICENSE_TYPE_LABEL[s.license_type],
        s.is_active ? 1 : 0,
        l?.serial_key ?? '',
        local?.status ?? l?.status ?? '',
        l?.hwid_locked ?? '',
        l?.activated_at ?? '',
        s.created_at,
      ];
    });
    downloadCsv(datedFilename('toko-kasirpro'), toCsv([header, ...body]));
    toast.success('Data toko diunduh', `${list.length} baris CSV.`);
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageTitle
        title="Data Toko Pembeli"
        description="Semua toko yang pernah menerima lisensi dari partner mana pun"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={stores.length === 0}>
              Ekspor CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refresh()} loading={loading}>
              <RefreshCw className="h-4 w-4" /> Muat Ulang
            </Button>
          </>
        }
      />

      {error && <ErrorBox message={error} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Toko" value={stats.total} icon={<Store className="h-5 w-5" />} />
        <StatCard
          label="Lisensi Aktif"
          value={stats.active}
          icon={<MonitorSmartphone className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Belum Diaktivasi"
          value={stats.unlocked}
          icon={<KeyRound className="h-5 w-5" />}
          tone="warning"
          hint="HWID belum terkunci"
        />
        <StatCard
          label="Nilai Lisensi"
          value={rupiah(stats.omzet, { compact: true })}
          icon={<MonitorSmartphone className="h-5 w-5" />}
          tone="primary"
          hint={`${stats.noLicense} toko tanpa lisensi`}
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama toko, pemilik, no HP, atau alamat…"
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
          title={stores.length === 0 ? 'Belum ada toko' : 'Tidak ada toko yang cocok'}
          description="Data toko dibuat otomatis oleh partner saat membuat lisensi."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">Toko</th>
                  <th className="px-3 py-2.5 text-left">Kontak</th>
                  <th className="px-3 py-2.5 text-left">Partner</th>
                  <th className="px-3 py-2.5 text-left">Paket</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                  <th className="px-3 py-2.5 text-left">Serial Key</th>
                  <th className="px-3 py-2.5 text-left">HWID</th>
                  <th className="px-3 py-2.5 text-left">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const l = licenseByStore.get(s.id) ?? null;
                  const st = statusOf(l, localByLicenseId);
                  return (
                    <tr key={s.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{s.store_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.owner_name}
                          {!s.is_active && (
                            <Badge variant="muted" className="ml-1.5 text-[10px]">
                              Nonaktif
                            </Badge>
                          )}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {s.no_hp && (
                          <p className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {s.no_hp}
                          </p>
                        )}
                        {s.alamat && (
                          <p className="flex items-start gap-1 text-muted-foreground">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> <span>{s.alamat}</span>
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {s.partner_id ? partnerName.get(s.partner_id) ?? '—' : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {PAKET_LABEL[s.paket_type]}
                        <p className="text-[10px] text-muted-foreground">
                          {LICENSE_TYPE_LABEL[s.license_type]}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {st ? (
                          <Badge
                            variant={
                              st === 'active'
                                ? 'success'
                                : st === 'unused'
                                  ? 'warning'
                                  : st === 'blocked'
                                    ? 'destructive'
                                    : 'muted'
                            }
                          >
                            {STATUS_LABEL[st]}
                          </Badge>
                        ) : (
                          <Badge variant="muted">Tanpa Lisensi</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px]">
                        {l?.serial_key ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        {l?.hwid_locked ? `${l.hwid_locked.slice(0, 8)}…${l.hwid_locked.slice(-4)}` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {fmtDate(s.created_at)}
                        {l?.activated_at && (
                          <p className="text-[10px]">Aktif: {fmtDateTime(l.activated_at)}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          Status beresolusi real-time untuk perangkat yang sedang membuka aplikasi POS ini
          (diambil dari cache lokal <code className="rounded bg-muted px-1">licenses_cache</code>).
          Data server tetap acuan resmi.
        </span>
      </div>
    </div>
  );
}

function statusOf(
  license: AdminLicenseRow | null,
  localByLicenseId: Map<string, LocalLicense>,
): keyof typeof STATUS_LABEL | null {
  if (!license) return null;
  const local = localByLicenseId.get(license.id);
  return ((local?.status ?? license.status) as keyof typeof STATUS_LABEL) ?? null;
}
