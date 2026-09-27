'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Ban,
  Eye,
  Printer,
  Receipt as ReceiptIcon,
  Search,
  Undo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useAppMeta, usePos } from '@/components/pos/pos-provider';
import { printReceipt, type ReceiptData } from '@/lib/receipt';
import { getDB, type LocalTransaction, type LocalTransactionItem } from '@/lib/db/local';
import { voidTransaction } from '@/lib/cart';
import { syncNow } from '@/lib/db/sync';
import { fmtDateTime, rupiah } from '@/lib/utils';
import { PAYMENT_METHOD_LABEL } from '@/types';

export default function PosTransactionsPage() {
  const { activation, online } = usePos();
  const meta = useAppMeta();
  const toast = useToast();

  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<'all' | 'completed' | 'void'>('all');
  const [detail, setDetail] = React.useState<{
    tx: LocalTransaction;
    items: LocalTransactionItem[];
  } | null>(null);
  const [voidTarget, setVoidTarget] = React.useState<LocalTransaction | null>(null);
  const [busy, setBusy] = React.useState(false);

  const transactions = useLiveQuery(
    () =>
      activation?.storeId
        ? getDB().transactions.where('store_id').equals(activation.storeId).reverse().sortBy('created_at')
        : [],
    [activation?.storeId],
    [] as LocalTransaction[],
  ) as LocalTransaction[] | undefined;

  const list = React.useMemo(() => {
    const all = (transactions ?? []).filter((t) => (status === 'all' ? true : t.status === status));
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) =>
        t.invoice_no.toLowerCase().includes(q) ||
        (t.cashier_name ?? '').toLowerCase().includes(q) ||
        (t.note ?? '').toLowerCase().includes(q) ||
        (t.payment_method ?? '').toLowerCase().includes(q),
    );
  }, [transactions, query, status]);

  async function openDetail(t: LocalTransaction) {
    const items = await getDB().transaction_items.where('transaction_id').equals(t.id).toArray();
    setDetail({ tx: t, items });
  }

  /** Muat item transaksi dari Dexie lalu cetak ulang struk. */
  async function reprint(t: LocalTransaction) {
    setBusy(true);
    try {
      const items = await getDB().transaction_items.where('transaction_id').equals(t.id).toArray();
      const res = await printReceipt(buildReceipt({ tx: t, items }));
      if (res.error) toast.error('Cetak lewat dialog print', res.error);
      else toast.success('Struk dicetak', t.invoice_no);
    } catch (e) {
      toast.error('Gagal mencetak', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmVoid() {
    if (!voidTarget) return;
    setBusy(true);
    try {
      await voidTransaction(voidTarget.id);
      toast.success('Transaksi dibatalkan', `${voidTarget.invoice_no} — stok dikembalikan.`);
      setVoidTarget(null);
      if (detail?.tx.id === voidTarget.id) setDetail(null);
      if (online) void syncNow(true);
    } catch (e) {
      toast.error('Gagal membatalkan', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  }

  function buildReceipt(d: { tx: LocalTransaction; items: LocalTransactionItem[] }): ReceiptData {
    return {
      invoiceNo: d.tx.invoice_no,
      createdAt: d.tx.created_at,
      storeName: meta.storeName || activation?.storeName || 'Toko Saya',
      storeAddress: meta.shopAddress,
      storePhone: meta.shopPhone,
      cashierName: d.tx.cashier_name || 'Kasir',
      items: d.items.map((i) => ({
        name: i.product_name,
        price: i.price,
        qty: i.qty,
        discount: i.discount,
        subtotal: i.subtotal,
      })),
      subtotal: d.tx.subtotal,
      discountAmount: d.tx.discount_amount,
      total: d.tx.total,
      paid: d.tx.paid,
      changeDue: d.tx.change_due,
      paymentMethod: PAYMENT_METHOD_LABEL[d.tx.payment_method] ?? d.tx.payment_method,
      note: d.tx.note,
      serialKey: activation?.serialKey ?? null,
    };
  }

  const totals = React.useMemo(() => {
    const valid = list.filter((t) => t.status === 'completed');
    return {
      count: valid.length,
      revenue: valid.reduce((s, t) => s + t.total, 0),
      profit: valid.reduce((s, t) => s + (t.total - t.total_cost), 0),
      items: valid.reduce((s, t) => s + t.discount_amount, 0),
    };
  }, [list]);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Riwayat Transaksi</h1>
        <p className="text-sm text-muted-foreground">
          {(transactions ?? []).length} transaksi tersimpan di perangkat ini
        </p>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Transaksi" value={String(totals.count)} />
        <MiniStat label="Omzet" value={rupiah(totals.revenue, { compact: true })} tone="text-primary" />
        <MiniStat label="Laba Kotor" value={rupiah(totals.profit, { compact: true })} tone="text-success" />
        <MiniStat label="Total Diskon" value={rupiah(totals.items, { compact: true })} tone="text-warning" />
      </div>

      {/* Filter */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari no. transaksi, kasir, metode bayar, catatan…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ['all', 'Semua'],
              ['completed', 'Selesai'],
              ['void', 'Dibatalkan'],
            ] as const
          ).map(([v, label]) => (
            <Button
              key={v}
              size="sm"
              variant={status === v ? 'default' : 'outline'}
              onClick={() => setStatus(v)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ReceiptIcon className="h-10 w-10" />}
          title="Belum ada transaksi"
          description="Transaksi yang disimpan di kasir akan muncul di sini, lengkap dengan detail dan struknya."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="divide-y">
            {list.map((t) => (
              <div
                key={t.id}
                className={`flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-muted/30 ${
                  t.status === 'void' ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-[130px] flex-1">
                  <p className="font-mono text-sm font-semibold">{t.invoice_no}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(t.created_at)} • {t.cashier_name || 'Kasir'}
                  </p>
                </div>

                <Badge variant="secondary" className="shrink-0">
                  {PAYMENT_METHOD_LABEL[t.payment_method] ?? t.payment_method}
                </Badge>

                {t.status === 'void' ? (
                  <Badge variant="destructive" className="shrink-0">
                    <Ban className="h-3 w-3" /> Dibatalkan
                  </Badge>
                ) : (
                  <Badge variant={t._dirty === 1 ? 'warning' : 'success'} className="shrink-0">
                    {t._dirty === 1 ? 'Belum sync' : 'Tersinkron'}
                  </Badge>
                )}

                <span className="w-28 shrink-0 text-right text-sm font-bold tnum">
                  {rupiah(t.total)}
                </span>

                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="icon-sm" onClick={() => void openDetail(t)} title="Detail">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title="Cetak ulang struk"
                    disabled={busy}
                    onClick={() => void reprint(t)}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                  {t.status === 'completed' && (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="text-destructive"
                      title="Batalkan transaksi"
                      onClick={() => setVoidTarget(t)}
                    >
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DIALOG DETAIL */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptIcon className="h-5 w-5" /> {detail?.tx.invoice_no}
            </DialogTitle>
            <DialogDescription>
              {detail ? fmtDateTime(detail.tx.created_at) : ''} • {detail?.tx.cashier_name}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-3">
              {detail.tx.status === 'void' && (
                <Badge variant="destructive">Transaksi ini telah dibatalkan (stok dikembalikan)</Badge>
              )}

              <div className="space-y-1.5 rounded-lg border p-3">
                {detail.items.map((i) => (
                  <div key={i.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.product_name}</p>
                      <p className="text-xs text-muted-foreground tnum">
                        {i.qty} × {rupiah(i.price)}
                        {i.discount > 0 && ` • diskon ${rupiah(i.discount)}`}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium tnum">{rupiah(i.subtotal)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                <Row label="Subtotal" value={rupiah(detail.tx.subtotal)} />
                {detail.tx.discount_amount > 0 && (
                  <Row label="Diskon" value={`- ${rupiah(detail.tx.discount_amount)}`} tone="text-destructive" />
                )}
                <Separator className="my-1" />
                <Row label="Total" value={rupiah(detail.tx.total)} strong />
                <Row
                  label={PAYMENT_METHOD_LABEL[detail.tx.payment_method] ?? detail.tx.payment_method}
                  value={rupiah(detail.tx.paid)}
                />
                <Row label="Kembalian" value={rupiah(detail.tx.change_due)} tone="text-success" />
                <Row label="Laba kotor" value={rupiah(detail.tx.total - detail.tx.total_cost)} tone="text-success" />
                {detail.tx.note && <Row label="Catatan" value={detail.tx.note} />}
                <Row
                  label="Status sinkron"
                  value={detail.tx._dirty === 1 ? 'Belum dikirim ke server' : 'Tersinkron'}
                  tone={detail.tx._dirty === 1 ? 'text-warning' : 'text-success'}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  loading={busy}
                  onClick={() => void reprint(detail.tx)}
                >
                  <Printer className="h-4 w-4" /> Cetak Ulang
                </Button>
                {detail.tx.status === 'completed' && (
                  <Button variant="destructive" onClick={() => setVoidTarget(detail.tx)}>
                    <Undo2 className="h-4 w-4" /> Batalkan
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* KONFIRMASI VOID */}
      <AlertDialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan transaksi {voidTarget?.invoice_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              Stok produk akan dikembalikan. Tindakan ini tercatat di laporan dan dikirim ke server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Tidak</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmVoid();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tnum ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tnum ${strong ? 'font-bold text-primary' : 'font-medium'} ${tone ?? ''}`}>{value}</span>
    </div>
  );
}
