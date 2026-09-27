'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, Boxes, Download, PieChart, TrendingUp, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { EmptyState, StatCard } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePos } from '@/components/pos/pos-provider';
import { datedFilename, downloadCsv, toCsv } from '@/lib/csv';
import { getDB, type LocalProduct, type LocalTransaction } from '@/lib/db/local';
import { fmtDate, rupiah } from '@/lib/utils';
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/types';

type Period = 'today' | '7d' | '30d' | 'all';

export default function PosReportsPage() {
  const { activation, sync } = usePos();
  const storeId = activation?.storeId ?? null;
  const [period, setPeriod] = React.useState<Period>('today');

  const transactions = useLiveQuery(
    () => (storeId ? getDB().transactions.where('store_id').equals(storeId).toArray() : []),
    [storeId],
    [] as LocalTransaction[],
  ) as LocalTransaction[] | undefined;

  const products = useLiveQuery(
    () => (storeId ? getDB().products.where('store_id').equals(storeId).toArray() : []),
    [storeId],
    [] as LocalProduct[],
  ) as LocalProduct[] | undefined;

  const items = useLiveQuery(
    () => (storeId ? getDB().transaction_items.where('store_id').equals(storeId).toArray() : []),
    [storeId],
    [],
  ) as Array<{ id: string; transaction_id: string; product_id: string | null; product_name: string; qty: number; price: number; cost: number; subtotal: number; store_id: string }> | undefined;

  /* --- filter periode ---------------------------------------------- */
  const filtered = React.useMemo(() => {
    const all = (transactions ?? []).filter((t) => t.status === 'completed');
    if (period === 'all') return all;
    const now = new Date();
    const from = new Date(now);
    if (period === 'today') from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - (period === '7d' ? 6 : 29));
    return all.filter((t) => new Date(t.created_at) >= from);
  }, [transactions, period]);

  const filteredIds = React.useMemo(() => new Set(filtered.map((t) => t.id)), [filtered]);

  /* --- agregasi ----------------------------------------------------- */
  const summary = React.useMemo(() => {
    const revenue = filtered.reduce((s, t) => s + t.total, 0);
    const cost = filtered.reduce((s, t) => s + t.total_cost, 0);
    const discount = filtered.reduce((s, t) => s + t.discount_amount, 0);
    const qtySold = (items ?? [])
      .filter((i) => filteredIds.has(i.transaction_id))
      .reduce((s, i) => s + i.qty, 0);
    return {
      count: filtered.length,
      revenue,
      cost,
      discount,
      profit: revenue - cost,
      qtySold,
      avg: filtered.length ? revenue / filtered.length : 0,
    };
  }, [filtered, items, filteredIds]);

  /** Penjualan harian (grafik batang sederhana, tanpa dependensi chart) */
  const daily = React.useMemo(() => {
    const map = new Map<string, { revenue: number; profit: number; count: number }>();
    for (const t of filtered) {
      const key = t.created_at.slice(0, 10);
      const row = map.get(key) ?? { revenue: 0, profit: 0, count: 0 };
      row.revenue += t.total;
      row.profit += t.total - t.total_cost;
      row.count += 1;
      map.set(key, row);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  }, [filtered]);

  /** Metode pembayaran */
  const byPayment = React.useMemo(() => {
    const map = new Map<PaymentMethod, { total: number; count: number }>();
    for (const t of filtered) {
      const method = t.payment_method as PaymentMethod;
      const row = map.get(method) ?? { total: 0, count: 0 };
      row.total += t.total;
      row.count += 1;
      map.set(method, row);
    }
    return [...map.entries()]
      .map(([k, v]) => ({ method: k, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  /** Produk terlaris */
  const topProducts = React.useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
    for (const i of items ?? []) {
      if (!filteredIds.has(i.transaction_id)) continue;
      const row = map.get(i.product_name) ?? { name: i.product_name, qty: 0, revenue: 0, profit: 0 };
      row.qty += i.qty;
      row.revenue += i.subtotal;
      row.profit += (i.price - i.cost) * i.qty;
      map.set(i.product_name, row);
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  }, [items, filteredIds]);

  const stockValue = React.useMemo(
    () => (products ?? []).reduce((s, p) => s + p.stock * p.cost, 0),
    [products],
  );
  const stockRetail = React.useMemo(
    () => (products ?? []).reduce((s, p) => s + p.stock * p.price, 0),
    [products],
  );

  function exportCsv() {
    const rows = [
      ['Laporan Penjualan KasirPro'],
      ['Periode', period === 'all' ? 'Semua' : period],
      ['Dibuat', new Date().toLocaleString('id-ID')],
      [],
      ['Ringkasan'],
      ['Transaksi', String(summary.count)],
      ['Omzet', String(summary.revenue)],
      ['HPP', String(summary.cost)],
      ['Laba Kotor', String(summary.profit)],
      ['Diskon', String(summary.discount)],
      ['Rata-rata per transaksi', String(Math.round(summary.avg))],
      [],
      ['Produk Terlaris'],
      ['Produk', 'Qty', 'Omzet', 'Laba'],
      ...topProducts.map((p) => [p.name, String(p.qty), String(p.revenue), String(p.profit)]),
    ];
    downloadCsv(datedFilename('laporan-kasirpro'), toCsv(rows));
  }

  const maxDaily = Math.max(...daily.map((d) => d[1].revenue), 1);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Laporan</h1>
          <p className="text-sm text-muted-foreground">
            Dihitung dari database lokal — tetap tersedia saat offline
            {sync.lastSyncAt && ` • sync terakhir ${new Date(sync.lastSyncAt).toLocaleString('id-ID')}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hari Ini</SelectItem>
              <SelectItem value="7d">7 Hari Terakhir</SelectItem>
              <SelectItem value="30d">30 Hari Terakhir</SelectItem>
              <SelectItem value="all">Semua Waktu</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {(transactions ?? []).length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="Belum ada data laporan"
          description="Laporan penjualan, stok, dan laba rugi akan muncul setelah ada transaksi."
        />
      ) : (
        <>
          {/* STAT CARDS */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Transaksi" value={summary.count} icon={<Wallet className="h-4 w-4" />} />
            <StatCard
              label="Omzet"
              value={rupiah(summary.revenue, { compact: true })}
              tone="primary"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Laba Kotor"
              value={rupiah(summary.profit, { compact: true })}
              tone="success"
              hint={`Margin ${summary.revenue ? Math.round((summary.profit / summary.revenue) * 100) : 0}%`}
            />
            <StatCard
              label="Item Terjual"
              value={summary.qtySold}
              icon={<Boxes className="h-4 w-4" />}
              hint={`Rata-rata ${rupiah(summary.avg, { compact: true })}/trx`}
            />
            <StatCard
              label="Nilai Stok"
              value={rupiah(stockValue, { compact: true })}
              hint={`Modal • jual ${rupiah(stockRetail, { compact: true })}`}
              icon={<PieChart className="h-4 w-4" />}
            />
          </div>

          <Tabs defaultValue="sales">
            <TabsList>
              <TabsTrigger value="sales">Penjualan</TabsTrigger>
              <TabsTrigger value="profit">Laba Rugi</TabsTrigger>
              <TabsTrigger value="stock">Stok</TabsTrigger>
            </TabsList>

            {/* PENJUALAN */}
            <TabsContent value="sales" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Penjualan Harian</CardTitle>
                  <CardDescription>Omzet {daily.length} hari terakhir dalam periode terpilih</CardDescription>
                </CardHeader>
                <CardContent>
                  {daily.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Belum ada penjualan pada periode ini.</p>
                  ) : (
                    <div className="flex h-44 items-end gap-1.5 overflow-x-auto">
                      {daily.map(([date, v]) => (
                        <div key={date} className="group flex min-w-[34px] flex-1 flex-col items-center gap-1">
                          <div
                            className="relative w-full rounded-t bg-primary/80 transition-colors hover:bg-primary"
                            style={{ height: `${Math.max(4, (v.revenue / maxDaily) * 100)}%` }}
                            title={`${fmtDate(date)}: ${rupiah(v.revenue)} (${v.count} trx)`}
                          >
                            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                              {rupiah(v.revenue, { compact: true })}
                            </span>
                          </div>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(date).getDate()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Metode Pembayaran</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {byPayment.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">Belum ada data.</p>
                    ) : (
                      byPayment.map((p) => {
                        const pctVal = summary.revenue ? (p.total / summary.revenue) * 100 : 0;
                        return (
                          <div key={p.method} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">
                                {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                                <span className="ml-1.5 text-xs text-muted-foreground">({p.count}×)</span>
                              </span>
                              <span className="font-semibold tnum">{rupiah(p.total)}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${pctVal}%` }} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Produk Terlaris</CardTitle>
                    <CardDescription>Berdasarkan quantity terjual pada periode ini</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {topProducts.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">Belum ada data.</p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {topProducts.slice(0, 20).map((p, i) => (
                          <div key={p.name} className="flex items-center gap-2 text-sm">
                            <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
                              {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            <Badge variant="muted" className="shrink-0 tnum">
                              {p.qty}
                            </Badge>
                            <span className="w-24 shrink-0 text-right font-medium tnum">
                              {rupiah(p.revenue, { compact: true })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* LABA RUGI */}
            <TabsContent value="profit">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Laporan Laba Rugi Sederhana</CardTitle>
                  <CardDescription>
                    Omzet − Harga Pokok Penjualan (HPP). HPP diambil dari harga modal produk saat transaksi.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <PLRow label="Omzet Penjualan" value={summary.revenue} />
                  <PLRow label="Harga Pokok Penjualan (HPP)" value={-summary.cost} tone="text-destructive" />
                  <Separator />
                  <PLRow label="Laba Kotor" value={summary.profit} strong />
                  {summary.discount > 0 && (
                    <>
                      <Separator />
                      <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                        <p>
                          <strong>Catatan:</strong> dari omzet {rupiah(summary.revenue)}, total diskon yang
                          diberikan {rupiah(summary.discount)}. Diskon sudah terpotong dari angka di atas.
                        </p>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniBox label="Trx" value={String(summary.count)} />
                    <MiniBox label="Omzet/Trx" value={rupiah(summary.avg, { compact: true })} />
                    <MiniBox
                      label="Margin"
                      value={`${summary.revenue ? Math.round((summary.profit / summary.revenue) * 100) : 0}%`}
                    />
                    <MiniBox
                      label="Laba/Trx"
                      value={rupiah(summary.count ? summary.profit / summary.count : 0, { compact: true })}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* STOK */}
            <TabsContent value="stock">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Jenis Produk" value={(products ?? []).length} />
                <StatCard
                  label="Total Unit"
                  value={(products ?? []).reduce((s, p) => s + p.stock, 0)}
                />
                <StatCard label="Nilai Modal" value={rupiah(stockValue, { compact: true })} tone="primary" />
                <StatCard
                  label="Potensi Laba"
                  value={rupiah(stockRetail - stockValue, { compact: true })}
                  tone="success"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Daftar Stok</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                    {(products ?? [])
                      .slice()
                      .sort((a, b) => a.stock - b.stock)
                      .map((p) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.category} • {rupiah(p.price)} / {p.unit}
                            </p>
                          </div>
                          <Badge variant={p.stock <= 0 ? 'destructive' : p.stock <= p.min_stock ? 'warning' : 'secondary'}>
                            {p.stock} {p.unit}
                          </Badge>
                          <span className="hidden w-28 text-right text-xs text-muted-foreground tnum sm:block">
                            {rupiah(p.stock * p.cost)}
                          </span>
                        </div>
                      ))}
                    {(products ?? []).length === 0 && (
                      <p className="py-6 text-center text-sm text-muted-foreground">Belum ada produk.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function PLRow({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className={`tnum ${strong ? 'text-lg font-bold text-success' : 'font-medium'} ${tone ?? ''}`}>
        {value < 0 ? `- ${rupiah(Math.abs(value))}` : rupiah(value)}
      </span>
    </div>
  );
}

function MiniBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold tnum">{value}</p>
    </div>
  );
}
