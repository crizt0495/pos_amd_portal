'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Download,
  Edit3,
  Package,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { usePos } from '@/components/pos/pos-provider';
import { datedFilename, downloadCsv, toCsv } from '@/lib/csv';
import { getDB, type LocalProduct } from '@/lib/db/local';
import { rupiah, uuidv4 } from '@/lib/utils';
import { syncNow } from '@/lib/db/sync';

const CATEGORIES = ['Umum', 'Makanan', 'Minuman', 'Snack', 'Rumah Tangga', 'Obat', 'Kosmetik', 'Lainnya'];

interface FormState {
  id: string | null;
  name: string;
  barcode: string;
  sku: string;
  category: string;
  price: string;
  cost: string;
  stock: string;
  minStock: string;
  unit: string;
  isActive: boolean;
}

const EMPTY: FormState = {
  id: null,
  name: '',
  barcode: '',
  sku: '',
  category: 'Umum',
  price: '',
  cost: '',
  stock: '0',
  minStock: '0',
  unit: 'pcs',
  isActive: true,
};

export default function PosProductsPage() {
  const { activation } = usePos();
  const toast = useToast();

  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const products = useLiveQuery(
    () => (activation?.storeId ? getDB().products.where('store_id').equals(activation.storeId).toArray() : []),
    [activation?.storeId],
    [] as LocalProduct[],
  ) as LocalProduct[] | undefined;

  const list = React.useMemo(() => {
    const all = products ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q),
    );
  }, [products, query]);

  const lowStock = (products ?? []).filter((p) => p.stock <= p.min_stock && p.is_active);

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(p: LocalProduct) {
    setForm({
      id: p.id,
      name: p.name,
      barcode: p.barcode ?? '',
      sku: p.sku ?? '',
      category: p.category || 'Umum',
      price: String(p.price),
      cost: String(p.cost),
      stock: String(p.stock),
      minStock: String(p.min_stock),
      unit: p.unit,
      isActive: p.is_active,
    });
    setOpen(true);
  }

  async function save() {
    if (!activation?.storeId) return;
    if (!form.name.trim()) return toast.error('Nama produk wajib diisi.');
    const price = parseFloat(form.price) || 0;
    const cost = parseFloat(form.cost) || 0;
    if (price < 0 || cost < 0) return toast.error('Harga tidak boleh negatif.');

    setSaving(true);
    try {
      const db = getDB();
      const now = new Date().toISOString();
      const existing = form.id ? await db.products.get(form.id) : undefined;

      await db.products.put({
        id: form.id ?? uuidv4(),
        store_id: activation.storeId,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        name: form.name.trim(),
        category: form.category,
        price,
        cost,
        stock: parseInt(form.stock, 10) || 0,
        min_stock: parseInt(form.minStock, 10) || 0,
        unit: form.unit.trim() || 'pcs',
        image_url: null,
        is_active: form.isActive,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        _dirty: 1,
      });

      toast.success(form.id ? 'Produk diperbarui' : 'Produk ditambahkan', form.name);
      setOpen(false);
    } catch (e) {
      toast.error('Gagal menyimpan produk', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: LocalProduct) {
    if (!window.confirm(`Hapus produk "${p.name}"? Riwayat transaksi tetap tersimpan.`)) return;
    const db = getDB();
    await db.products.delete(p.id);
    toast.success('Produk dihapus', p.name);
  }

  /* --------------------------- import / export -------------------- */

  function exportCsv() {
    const header = ['nama', 'barcode', 'sku', 'kategori', 'harga', 'modal', 'stok', 'stok_min', 'satuan', 'aktif'];
    const rows = (products ?? []).map((p) => [
      p.name,
      p.barcode ?? '',
      p.sku ?? '',
      p.category,
      p.price,
      p.cost,
      p.stock,
      p.min_stock,
      p.unit,
      p.is_active ? 1 : 0,
    ]);
    downloadCsv(datedFilename('produk-kasirpro'), toCsv([header, ...rows]));
    toast.success('Produk diekspor', `${rows.length} baris CSV.`);
  }

  async function importCsv(file: File) {
    if (!activation?.storeId) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return toast.error('File CSV kosong atau tidak valid.');

    const parse = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]!;
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else inQuote = !inQuote;
        } else if (ch === ',' && !inQuote) {
          out.push(cur);
          cur = '';
        } else cur += ch;
      }
      out.push(cur);
      return out;
    };

    const db = getDB();
    const now = new Date().toISOString();
    const batch: LocalProduct[] = [];
    let count = 0;

    for (let i = 1; i < lines.length; i += 1) {
      const cols = parse(lines[i]!);
      if (!cols[0]?.trim()) continue;
      const name = cols[0]!.trim();
      const barcode = cols[1]?.trim() || null;
      const existing = barcode
        ? await db.products.where('store_id').equals(activation.storeId).filter((p) => p.barcode === barcode).first()
        : await db.products.where('store_id').equals(activation.storeId).filter((p) => p.name === name).first();

      batch.push({
        id: existing?.id ?? uuidv4(),
        store_id: activation.storeId,
        name,
        barcode,
        sku: cols[2]?.trim() || null,
        category: cols[3]?.trim() || 'Umum',
        price: parseFloat(cols[4] ?? '0') || 0,
        cost: parseFloat(cols[5] ?? '0') || 0,
        stock: parseInt(cols[6] ?? '0', 10) || 0,
        min_stock: parseInt(cols[7] ?? '0', 10) || 0,
        unit: cols[8]?.trim() || 'pcs',
        image_url: null,
        is_active: (cols[9] ?? '1') !== '0',
        created_at: existing?.created_at ?? now,
        updated_at: now,
        _dirty: 1,
      });
      count += 1;
    }

    await db.products.bulkPut(batch);
    toast.success('Import selesai', `${count} produk masuk ke database lokal.`);
    void syncNow(true);
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-xl font-bold">Produk</h1>
          <p className="text-sm text-muted-foreground">
            {(products ?? []).length} produk di database lokal (tersinkron otomatis)
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importCsv(f);
              e.target.value = '';
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" /> Tambah Produk
          </Button>
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="h-4 w-4 text-warning" />
          <span>
            <strong>{lowStock.length} produk</strong> stoknya menipis:{' '}
            {lowStock.slice(0, 5).map((p) => p.name).join(', ')}
            {lowStock.length > 5 && '…'}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama / barcode / SKU / kategori…"
          className="pl-9"
        />
      </div>

      {/* List */}
      {list.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={products && products.length === 0 ? 'Belum ada produk' : 'Produk tidak ditemukan'}
          description={
            products && products.length === 0
              ? 'Tambahkan produk satu per satu, atau import dari CSV untuk mempercepat.'
              : 'Coba kata kunci lain.'
          }
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Tambah Produk
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Nama</th>
                    <th className="px-3 py-2.5 text-left">Barcode / SKU</th>
                    <th className="px-3 py-2.5 text-left">Kategori</th>
                    <th className="px-3 py-2.5 text-right">Harga</th>
                    <th className="px-3 py-2.5 text-right">Modal</th>
                    <th className="px-3 py-2.5 text-right">Stok</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-3 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {p.barcode || '—'}
                        {p.sku && <span className="ml-1.5">{p.sku}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="muted">{p.category}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tnum">{rupiah(p.price)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground tnum">{rupiah(p.cost)}</td>
                      <td className="px-3 py-2 text-right tnum">
                        <span className={p.stock <= p.min_stock ? 'font-semibold text-warning' : ''}>
                          {p.stock} {p.unit}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant={p.is_active ? 'success' : 'muted'}>
                          {p.is_active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => void remove(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {list.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.barcode || p.sku || '—'} • {p.category}
                    </p>
                  </div>
                  <Badge variant={p.is_active ? 'success' : 'muted'}>
                    {p.is_active ? 'Aktif' : 'Off'}
                  </Badge>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <div className="text-sm">
                    <span className="font-bold text-primary tnum">{rupiah(p.price)}</span>
                    <span className="ml-2 text-xs text-muted-foreground tnum">
                      stok {p.stock} {p.unit}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="icon-sm" onClick={() => openEdit(p)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={() => void remove(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* DIALOG FORM */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Produk' : 'Tambah Produk'}</DialogTitle>
            <DialogDescription>
              Data disimpan ke database lokal lebih dulu, lalu disinkronkan ke server.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nama Produk *</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Indomie Goreng"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-barcode">Barcode</Label>
                <Input
                  id="p-barcode"
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="8991002101215"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-sku">SKU</Label>
                <Input
                  id="p-sku"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="IND-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-cat">Kategori</Label>
                <select
                  id="p-cat"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-unit">Satuan</Label>
                <Input
                  id="p-unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="pcs / kg / bungkus"
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Harga Jual (Rp) *</Label>
                <Input
                  id="p-price"
                  type="number"
                  min={0}
                  step={100}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="3500"
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-cost">Harga Modal (Rp)</Label>
                <Input
                  id="p-cost"
                  type="number"
                  min={0}
                  step={100}
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="3000"
                  className="tnum"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-stock">Stok</Label>
                <Input
                  id="p-stock"
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-min">Stok Min</Label>
                <Input
                  id="p-min"
                  type="number"
                  value={form.minStock}
                  onChange={(e) => setForm({ ...form, minStock: e.target.value })}
                  className="tnum"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-margin">Margin</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted/50 px-3 text-sm tnum">
                  {(() => {
                    const p = parseFloat(form.price) || 0;
                    const c = parseFloat(form.cost) || 0;
                    if (!p) return '—';
                    return `${Math.round(((p - c) / p) * 100)}%`;
                  })()}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Produk Aktif</p>
                <p className="text-xs text-muted-foreground">Nonaktif = tidak muncul di layar kasir</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              Simpan Produk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
