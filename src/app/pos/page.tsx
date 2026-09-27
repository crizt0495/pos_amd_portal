'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BadgePercent,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Percent,
  Printer,
  QrCode,
  Save,
  ShoppingCart,
  Trash2,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ProductPicker, CartRow } from '@/components/pos/product-picker';
import { ReceiptMarkup, printReceipt, type ReceiptData } from '@/lib/receipt';
import { useAppMeta, usePos } from '@/components/pos/pos-provider';
import { addToCart, computeChange, computeTotals, saveCheckout } from '@/lib/cart';
import { getDB, type LocalProduct } from '@/lib/db/local';
import { round2, rupiah } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABEL,
  type CartLine,
  type DiscountType,
  type PaymentMethod,
} from '@/types';

const QUICK_CASH = [20000, 50000, 100000, 150000, 200000, 500000];

export default function PosCheckoutPage() {
  const router = useRouter();
  const toast = useToast();
  const { activation, online, manualSync, sync } = usePos();
  const meta = useAppMeta();

  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [discountType, setDiscountType] = React.useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = React.useState(0);
  const [payment, setPayment] = React.useState<PaymentMethod>('cash');
  const [paid, setPaid] = React.useState(0);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [lastReceipt, setLastReceipt] = React.useState<ReceiptData | null>(null);
  const [showReceipt, setShowReceipt] = React.useState(false);

  const products = useLiveQuery(
    () => getDB().products.where('is_active').equals(1 as never).toArray(),
    [],
    [] as LocalProduct[],
  ) as LocalProduct[] | undefined;

  const totals = computeTotals(lines, discountType, discountValue);
  const changeDue = computeChange(totals.total, paid);

  // Reset nominal bayar whenever total berubah & metode tunai
  React.useEffect(() => {
    if (payment === 'cash') {
      setPaid((prev) => (prev < totals.total ? totals.total : prev));
    } else {
      setPaid(totals.total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.total, payment]);

  function onAdd(incoming: CartLine[]) {
    setLines((prev) => addToCart(prev, incoming));
  }

  function onQty(index: number, qty: number) {
    setLines((prev) => {
      const next = [...prev];
      const line = next[index];
      if (!line) return prev;
      // Batasi qty dengan stok tersedia
      const stock = products?.find((p) => p.id === line.product_id)?.stock;
      let capped = Math.max(1, qty);
      if (typeof stock === 'number') capped = Math.min(capped, Math.max(1, stock));
      next[index] = { ...line, qty: round2(capped) };
      return next;
    });
  }

  function onRemove(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (!activation?.storeId) {
      toast.error('Toko belum terhubung', 'Lisensi tidak memiliki store_id. Hubungi admin.');
      return;
    }
    if (!lines.length) {
      toast.warning('Keranjang kosong', 'Tambahkan produk terlebih dahulu.');
      return;
    }
    if (payment === 'cash' && paid < totals.total) {
      toast.error('Pembayaran kurang', 'Nominal bayar harus ≥ total belanja.');
      return;
    }

    setBusy(true);
    try {
      const result = await saveCheckout({
        lines,
        discountType,
        discountValue,
        paymentMethod: payment,
        paid: payment === 'cash' ? paid : totals.total,
        note: note.trim() || null,
        cashierName: meta.cashierName || 'Kasir',
        storeId: activation.storeId,
      });

      const receipt: ReceiptData = {
        invoiceNo: result.transaction.invoice_no,
        createdAt: result.transaction.created_at,
        storeName: meta.storeName || activation.storeName || 'Toko Saya',
        storeAddress: meta.shopAddress,
        storePhone: meta.shopPhone,
        cashierName: meta.cashierName || 'Kasir',
        items: result.items.map((i) => ({
          name: i.product_name,
          price: i.price,
          qty: i.qty,
          discount: i.discount,
          subtotal: i.subtotal,
        })),
        subtotal: result.totals.subtotal,
        discountAmount: result.totals.discountAmount,
        total: result.totals.total,
        paid: result.transaction.paid,
        changeDue: result.changeDue,
        paymentMethod: PAYMENT_METHOD_LABEL[result.transaction.payment_method],
        note: result.transaction.note,
        serialKey: activation.serialKey,
      };
      setLastReceipt(receipt);
      setShowReceipt(true);

      // Reset keranjang
      setLines([]);
      setDiscountType('none');
      setDiscountValue(0);
      setPaid(0);
      setNote('');
      setConfirmOpen(false);

      toast.success(
        'Transaksi Tersimpan',
        `${result.transaction.invoice_no} • ${rupiah(result.totals.total)}${
          online ? '' : ' (tersimpan lokal, akan sync nanti)'
        }`,
      );

      if (online) void manualSync();
    } catch (e) {
      toast.error('Gagal menyimpan transaksi', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  }

  async function doPrint() {
    if (!lastReceipt) return;
    const res = await printReceipt(lastReceipt, meta.printerPort);
    if (res.via === 'browser-print') {
      toast.info('Cetak via Browser', 'Gunakan printer 58mm sebagai printer tujuan dialog cetak.');
    } else {
      toast.success('Struk Tercetak', 'Printer thermal menerima data struk.');
    }
  }

  if (!activation) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 font-medium">Aplikasi belum diaktivasi</p>
          <Button className="mt-4" onClick={() => router.push('/pos/activation')}>
            Ke Layar Aktivasi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-5">
      {/* KIRI: Produk */}
      <section className="min-h-0 border-b bg-background lg:col-span-3 lg:border-b-0 lg:border-r">
        <div className="h-[calc(100vh-8.5rem)]">
          <ProductPicker onAdd={onAdd} cartCount={totals.itemCount} />
        </div>
      </section>

      {/* KANAN: Keranjang + Pembayaran */}
      <section className="flex min-h-0 flex-col bg-background lg:col-span-2">
        <div className="flex h-[min(46vh,22rem)] flex-col border-b lg:h-auto lg:max-h-[38vh]">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="h-4 w-4" /> Keranjang
              {lines.length > 0 && <Badge variant="secondary">{lines.length}</Badge>}
            </p>
            {lines.length > 0 && (
              <Button variant="ghost" size="xs" onClick={() => setLines([])}>
                <Trash2 className="h-3.5 w-3.5" /> Kosongkan
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Belum ada produk. Scan barcode atau pilih produk di sebelah kiri.
              </p>
            ) : (
              lines.map((l, i) => (
                <CartRow key={`${l.product_id ?? l.barcode ?? l.name}-${i}`} line={l} index={i} onQty={onQty} onRemove={onRemove} />
              ))
            )}
          </div>
        </div>

        {/* Ringkasan & pembayaran */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {/* Diskon */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs">Diskon</Label>
              <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa diskon</SelectItem>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                  <SelectItem value="fixed">Rupiah (Rp)</SelectItem>
                </SelectContent>
              </Select>
              {discountType !== 'none' && (
                <div className="relative w-28">
                  {discountType === 'percent' ? (
                    <Percent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  ) : (
                    <BadgePercent className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  )}
                  <Input
                    type="number"
                    min={0}
                    step={discountType === 'percent' ? 1 : 100}
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    className="h-8 pl-7 text-xs tnum"
                    placeholder="0"
                  />
                </div>
              )}
            </div>
            <div className="space-y-1 rounded-lg bg-muted/50 p-2.5 text-sm">
              <SummaryRow label="Subtotal" value={rupiah(totals.subtotal)} />
              {totals.itemDiscount > 0 && (
                <SummaryRow label="Diskon item" value={`- ${rupiah(totals.itemDiscount)}`} tone="text-destructive" />
              )}
              {totals.discountAmount > 0 && (
                <SummaryRow
                  label={`Diskon transaksi`}
                  value={`- ${rupiah(totals.discountAmount)}`}
                  tone="text-destructive"
                />
              )}
              <Separator className="my-1" />
              <div className="flex items-center justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-primary tnum">{rupiah(totals.total)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Item {totals.itemCount} • Laba {rupiah(totals.profit)}</span>
                <span>{discountType === 'percent' && discountValue > 0 ? `(${discountValue}%)` : ''}</span>
              </div>
            </div>
          </div>

          {/* Metode bayar */}
          <div className="space-y-2">
            <Label className="text-xs">Metode Pembayaran</Label>
            <div className="grid grid-cols-5 gap-1.5">
              <PayMethodBtn value="cash" current={payment} onSelect={setPayment} icon={Banknote} label="Tunai" />
              <PayMethodBtn value="qris" current={payment} onSelect={setPayment} icon={QrCode} label="QRIS" />
              <PayMethodBtn value="transfer" current={payment} onSelect={setPayment} icon={Wallet} label="Transfer" />
              <PayMethodBtn value="debit" current={payment} onSelect={setPayment} icon={CreditCard} label="Debit" />
              <PayMethodBtn value="credit" current={payment} onSelect={setPayment} icon={CreditCard} label="Kredit" />
            </div>
          </div>

          {/* Nominal bayar */}
          {payment === 'cash' ? (
            <div className="space-y-2">
              <Label className="text-xs" htmlFor="paid">
                Nominal Bayar
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  Rp
                </span>
                <Input
                  id="paid"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={paid || ''}
                  onChange={(e) => setPaid(parseFloat(e.target.value) || 0)}
                  className="h-10 pl-9 text-base font-semibold tnum"
                  placeholder="0"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {QUICK_CASH.map((v) => (
                  <Button
                    key={v}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setPaid(v)}
                    className="tnum"
                  >
                    {rupiah(v, { compact: true })}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setPaid(totals.total)}
                  className="tnum"
                >
                  Pas
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setPaid(Math.ceil(totals.total / 100000) * 100000)}
                  className="tnum"
                >
                  Bulat
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-success/15 px-3 py-2">
                <span className="text-sm font-semibold">Kembalian</span>
                <span
                  className={`text-lg font-bold tnum ${changeDue < 0 ? 'text-destructive' : 'text-success'}`}
                >
                  {changeDue < 0 ? `Kurang ${rupiah(Math.abs(changeDue))}` : rupiah(changeDue)}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center text-sm">
              <p className="font-medium">{PAYMENT_METHOD_LABEL[payment]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pembayaran non-tunai dicatat otomatis sebesar total belanja.
              </p>
            </div>
          )}

          {/* Catatan */}
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="note">
              Catatan (opsional)
            </Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. nama pelanggan, promo…"
              className="h-9 text-xs"
              maxLength={200}
            />
          </div>

          {/* Tombol utama */}
          <div className="sticky bottom-0 space-y-2 border-t bg-background p-2">
            <Button
              size="lg"
              className="h-12 w-full text-base"
              disabled={!lines.length || busy || (payment === 'cash' && paid < totals.total)}
              onClick={() => setConfirmOpen(true)}
            >
              <Save className="h-4 w-4" /> Simpan Transaksi {rupiah(totals.total)}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              {online
                ? sync.pendingTransactions > 0
                  ? `${sync.pendingTransactions} transaksi menunggu sync`
                  : 'Data disimpan ke Dexie lalu disinkron ke server'
                : 'Mode offline — data aman di perangkat, sync saat online'}
            </p>
          </div>
        </div>
      </section>

      {/* KONFIRMASI */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Simpan transaksi?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="mt-2 block space-y-1">
                <span className="flex justify-between text-sm">
                  <span>Item</span>
                  <span className="font-medium tnum">{totals.itemCount}</span>
                </span>
                <span className="flex justify-between text-sm">
                  <span>Total</span>
                  <span className="font-semibold tnum">{rupiah(totals.total)}</span>
                </span>
                <span className="flex justify-between text-sm">
                  <span>{PAYMENT_METHOD_LABEL[payment]}</span>
                  <span className="font-medium tnum">{rupiah(payment === 'cash' ? paid : totals.total)}</span>
                </span>
                {payment === 'cash' && (
                  <span className="flex justify-between text-sm font-semibold text-success">
                    <span>Kembalian</span>
                    <span className="tnum">{rupiah(changeDue)}</span>
                  </span>
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Simpan &amp; Bayar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* STRUK / CETAK */}
      <AlertDialog open={showReceipt} onOpenChange={setShowReceipt}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" /> Transaksi Berhasil
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lastReceipt?.invoiceNo} • {rupiah(lastReceipt?.total ?? 0)}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {lastReceipt && (
            <div className="max-h-[45vh] overflow-y-auto rounded-lg border bg-white p-2">
              <ReceiptMarkup data={lastReceipt} />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Tutup</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doPrint()}>
              <Printer className="mr-2 h-4 w-4" /> Cetak Struk
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium tnum ${tone ?? ''}`}>{value}</span>
    </div>
  );
}

function PayMethodBtn({
  value,
  current,
  onSelect,
  icon: Icon,
  label,
}: {
  value: PaymentMethod;
  current: PaymentMethod;
  onSelect: (v: PaymentMethod) => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex flex-col items-center gap-0.5 rounded-md border px-1 py-2 text-[10px] font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input hover:bg-accent'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}


