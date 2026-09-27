'use client';

import * as React from 'react';
import {
  Camera,
  Check,
  Minus,
  Package,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn, rupiah } from '@/lib/utils';
import { getDB, type LocalProduct } from '@/lib/db/local';
import type { CartLine } from '@/types';

export interface ProductPickerProps {
  onAdd: (lines: CartLine[]) => void;
  cartCount: number;
}

const BARCODE_FALLBACKS = new Set(['', 'unknown', 'undefined', 'null', 'noprice', 'found']);

/**
 * Panel products: pencarian + grid tombol cepat.
 * Mendukung:
 *  - ketik barcode / nama (scanner keyboard-wedge)
 *  - scan dengan kamera (BarcodeDetector API bila tersedia)
 *  - fallback daftar static untuk browser tanpa kamera
 */
export function ProductPicker({ onAdd, cartCount }: ProductPickerProps) {
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [scanOpen, setScanOpen] = React.useState(false);

  const products = useLiveQuery(
    () => getDB().products.where('is_active').equals(1 as never).toArray(),
    [],
    [] as LocalProduct[],
  ) as LocalProduct[] | undefined;

  const list = React.useMemo(() => {
    const all = (products ?? []).filter((p) => p.is_active);
    const byCategory =
      category === 'all' ? all : all.filter((p) => (p.category || 'Umum') === category);
    const q = query.trim().toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q),
    );
  }, [products, query, category]);

  const categories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of products ?? []) set.add(p.category || 'Umum');
    return ['all', ...[...set].sort()];
  }, [products]);

  const handleScan = React.useCallback(
    (code: string) => {
      const clean = code.trim();
      if (!clean || BARCODE_FALLBACKS.has(clean.toLowerCase())) return;
      const found = (products ?? []).find(
        (p) => p.barcode === clean || p.sku?.toLowerCase() === clean.toLowerCase(),
      );
      if (found) {
        onAdd([toLine(found)]);
        setQuery('');
        return;
      }
      // barcode tidak dikenal -> tetap masukkan sebagai item manual
      onAdd([
        {
          product_id: null,
          barcode: clean,
          name: `Item ${clean}`,
          price: 0,
          cost: 0,
          qty: 1,
          discount: 0,
          unit: 'pcs',
        },
      ]);
      setQuery('');
    },
    [products, onAdd],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Search + scan */}
      <div className="space-y-2 p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleScan(query);
                }
              }}
              placeholder="Scan barcode atau cari nama produk…"
              className="h-11 pl-9 pr-9"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant={scanOpen ? 'default' : 'outline'}
            size="icon-lg"
            onClick={() => setScanOpen((v) => !v)}
            title="Scan dengan kamera"
          >
            {scanOpen ? <Check className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          </Button>
        </div>

        {scanOpen && <BarcodeScanner onDetected={handleScan} />}

        {/* Kategori */}
        {categories.length > 2 && (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  category === c
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-background hover:bg-accent',
                )}
              >
                {c === 'all' ? 'Semua' : c}
              </button>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Grid produk */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Package className="h-10 w-10 opacity-40" />
            <p className="text-sm font-medium">
              {products && products.length === 0 ? 'Belum ada produk' : 'Produk tidak ditemukan'}
            </p>
            {products && products.length === 0 && (
              <Button asChild variant="outline" size="sm">
                <a href="/pos/products">Tambah produk</a>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAdd([toLine(p)])}
                className={cn(
                  'flex flex-col justify-between rounded-lg border bg-card p-2.5 text-left transition-all',
                  'hover:border-primary hover:bg-primary/5 active:scale-[0.98]',
                  p.stock <= 0 && 'opacity-60',
                )}
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-tight">{p.name}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {p.barcode || p.sku || '—'}
                  </p>
                </div>
                <div className="mt-2 flex items-end justify-between gap-1">
                  <span className="text-sm font-bold text-primary tnum">{rupiah(p.price)}</span>
                  <Badge variant={p.stock <= p.min_stock ? 'warning' : 'muted'} className="px-1.5 py-0 text-[10px]">
                    {p.stock} {p.unit}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {cartCount > 0 && (
        <div className="border-t bg-muted/40 px-3 py-1.5 text-center text-xs text-muted-foreground">
          {cartCount} item di keranjang · pindai barcode langsung untuk menambah
        </div>
      )}
    </div>
  );
}

export function toLine(p: LocalProduct): CartLine {
  return {
    product_id: p.id,
    barcode: p.barcode,
    name: p.name,
    price: p.price,
    cost: p.cost,
    qty: 1,
    discount: 0,
    unit: p.unit,
  };
}

/* ------------------------------------------------------------------ */
/* Barcode scanner (kamera)                                            */
/* ------------------------------------------------------------------ */

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number>(0);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!window.BarcodeDetector) {
        setError('Browser tidak mendukung BarcodeDetector. Gunakan scanner USB (keyboard-wedge) atau ketik barcode.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Kamera tidak tersedia di perangkat/browser ini.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);

        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code'],
        });
        let last = '';
        let lastAt = 0;

        const tick = async () => {
          if (cancelled) return;
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const codes = await detector.detect(videoRef.current);
              const value = codes[0]?.rawValue;
              if (value) {
                const now = Date.now();
                if (value !== last || now - lastAt > 2000) {
                  last = value;
                  lastAt = now;
                  onDetected(value);
                }
              }
            } catch {
              /* frame belum siap */
            }
          }
          rafRef.current = requestAnimationFrame(() => void tick());
        };
        rafRef.current = requestAnimationFrame(() => void tick());
      } catch (e) {
        setError(
          e instanceof Error
            ? `Gagal mengakses kamera: ${e.message}`
            : 'Gagal mengakses kamera. Pastikan izin kamera diberikan.',
        );
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onDetected]);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/50 p-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {ready && (
          <div className="pointer-events-none absolute inset-4 rounded-lg border-2 border-success/80" />
        )}
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-white/70">
            <ScanLine className="h-8 w-8 animate-pulse" />
          </div>
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Arahkan kamera ke barcode. Kode akan masuk ke keranjang otomatis.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cart                                                                */
/* ------------------------------------------------------------------ */

export function CartRow({
  line,
  index,
  onQty,
  onRemove,
}: {
  line: CartLine;
  index: number;
  onQty: (index: number, qty: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <p className="text-xs text-muted-foreground tnum">
          {rupiah(line.price)} / {line.unit}
          {line.barcode ? ` · ${line.barcode}` : ''}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onQty(index, line.qty - 1)}
          disabled={line.qty <= 1}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          value={line.qty}
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(',', '.'));
            onQty(index, Number.isFinite(v) && v > 0 ? v : 1);
          }}
          className="h-8 w-14 px-1 text-center text-sm tnum"
          inputMode="decimal"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => onQty(index, line.qty + 1)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <span className="w-24 text-right text-sm font-semibold tnum">
        {rupiah((line.price - line.discount) * line.qty)}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(index)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
