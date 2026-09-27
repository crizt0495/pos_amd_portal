import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CloudOff,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  Lock,
  MonitorSmartphone,
  Printer,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Store,
  Wifi,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PAKET_COMMISSION, PAKET_PRICE } from '@/types';
import { rupiah } from '@/lib/utils';

export const metadata = { title: 'KasirPro — Kasir Offline-First & Aktivasi Hardware ID' };

const FEATURES = [
  {
    icon: CloudOff,
    title: 'Offline-First 100%',
    desc: 'Semua transaksi ditulis ke Dexie.js (IndexedDB) di perangkat dulu. Jual tetap jalan walau internet mati, sync otomatis saat online.',
  },
  {
    icon: Fingerprint,
    title: 'Hardware Locking',
    desc: 'Lisensi dikunci ke Motherboard Serial + Processor ID. Aplikasi yang di-copy ke PC lain langsung terkunci.',
  },
  {
    icon: Receipt,
    title: 'Struk Thermal 58mm',
    desc: 'Cetak struk ke printer thermal USB/LAN/serial, atau preview & cetak langsung dari browser.',
  },
  {
    icon: BarChart3,
    title: 'Laporan Real-time',
    desc: 'Penjualan, stok, laba rugi — semuanya dihitung dari data lokal sehingga tetap bisa dilihat offline.',
  },
  {
    icon: KeyRound,
    title: 'Sistem Lisensi Berlapis',
    desc: 'Super Admin → Partner/Toko Komputer → End User. Jatah lisensi, komisi, dan topup dikelola dari satu panel.',
  },
  {
    icon: ShieldCheck,
    title: 'Audit HWID',
    desc: 'Setiap percobaan aktivasi dicatat: HWID, IP, hasil, dan waktu. Deteksi salinan lebih dulu.',
  },
];

const STEPS = [
  { n: 1, title: 'Toko bikin lisensi', desc: 'Dashboard aktivasi toko isi data pembeli + paket, sistem generate Serial Key KPRO-XXXX-XXXX-XXXX.' },
  { n: 2, title: 'Pemasang input Serial Key', desc: 'Aplikasi client di PC pembeli menginput kode, wajib online untuk proses ini.' },
  { n: 3, title: 'HWID terkunci', desc: 'Server menyimpan HWID ke licenses.hwid_locked + hwid_history. Status jadi active.' },
  { n: 4, title: 'Kasir langsung jalan', desc: 'Masuk ke POS, offline pun tetap bisa transaksi. Sync otomatis saat online.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/40">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Store className="h-5 w-5" />
            </span>
            <span className="text-lg">
              Kasir<span className="text-primary">Pro</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link href="/pos">Buka Aplikasi Kasir</Link>
            </Button>
            <Button asChild>
              <Link href="/login">
                Masuk Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="container grid gap-10 py-14 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
            <Badge variant="secondary" className="gap-1.5">
              <Wifi className="h-3.5 w-3.5 text-success" /> Offline-first + Sync otomatis
            </Badge>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Aplikasi Kasir dengan{' '}
              <span className="bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
                Aktivasi Berbasis Hardware ID
              </span>
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
              KasirPro adalah paket lengkap: aplikasi kasir offline-first untuk kasir, dashboard
              aktivasi untuk toko komputer partner, dan panel administrasi untuk Anda sebagai Super Admin.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/pos">
                  <ShoppingCart className="h-4 w-4" /> Jalankan Aplikasi Kasir
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">
                  <LayoutDashboard className="h-4 w-4" /> Dashboard Aktivasi Toko
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-4 w-4 text-success" /> HWID terkunci permanen
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MonitorSmartphone className="h-4 w-4 text-success" /> Windows 64-bit (.exe)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Printer className="h-4 w-4 text-success" /> Thermal 58mm
              </span>
            </div>
          </div>

          {/* Mockup POS */}
          <div className="relative">
            <div className="rounded-2xl border bg-card p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                </div>
                <span className="text-xs text-muted-foreground">KasirPro — Toko Berkah Jaya</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-5">
                <div className="space-y-2 sm:col-span-3">
                  {[
                    ['Indomie Goreng', '2', 'Rp6.000', 'Rp12.000'],
                    ['Aqua Botol 600ml', '1', 'Rp4.000', 'Rp4.000'],
                    ['Roti Sari Roti', '3', 'Rp18.000', 'Rp18.000'],
                  ].map(([name, qty, price, sub]) => (
                    <div key={name} className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {qty} × {price}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tnum">{sub}</span>
                    </div>
                  ))}
                  <div className="rounded-lg border-2 border-dashed p-2 text-center text-xs text-muted-foreground">
                    Scan barcode / cari produk…
                  </div>
                </div>
                <div className="space-y-2 rounded-lg bg-muted/50 p-3 sm:col-span-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tnum">Rp34.000</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Diskon 5%</span>
                    <span className="tnum">-Rp1.700</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-base font-bold">
                    <span>Total</span>
                    <span className="tnum text-primary">Rp32.300</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tunai</span>
                    <span className="tnum">Rp50.000</span>
                  </div>
                  <div className="flex justify-between rounded-md bg-success/15 px-2 py-1.5 text-sm font-semibold text-success">
                    <span>Kembalian</span>
                    <span className="tnum">Rp17.700</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <span className="rounded-md bg-primary/15 py-1.5 text-center text-xs font-semibold text-primary">
                      Bayar
                    </span>
                    <span className="rounded-md bg-muted py-1.5 text-center text-xs font-semibold">
                      Cetak
                    </span>
                  </div>
                  <p className="pt-1 text-center text-[10px] text-muted-foreground">
                    ✓ Tersimpan lokal • ⇡ 0 antrian sync
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HARGA PAKET */}
        <section className="border-y bg-muted/30 py-14">
          <div className="container">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">Paket & Bagi Hasil</h2>
            <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
              Harga tetap, komisi toko partner otomatis dihitung saat lisensi dibuat.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MonitorSmartphone className="h-5 w-5 text-primary" /> Bundle PC + APP
                  </CardTitle>
                  <CardDescription>Kasir Purchased lengkap dengan perangkat PC kasir.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-extrabold tnum">{rupiah(PAKET_PRICE.bundle_pc_app)}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-success/10 p-3">
                      <p className="text-xs text-muted-foreground">Toko Partner</p>
                      <p className="font-bold text-success tnum">{rupiah(PAKET_COMMISSION.bundle_pc_app)}</p>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3">
                      <p className="text-xs text-muted-foreground">Super Admin</p>
                      <p className="font-bold text-primary tnum">
                        {rupiah(PAKET_PRICE.bundle_pc_app - PAKET_COMMISSION.bundle_pc_app)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-primary" /> Aplikasi Saja
                  </CardTitle>
                  <CardDescription>Pasang aplikasi kasir di PC yang sudah ada.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-3xl font-extrabold tnum">{rupiah(PAKET_PRICE.app_only)}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-success/10 p-3">
                      <p className="text-xs text-muted-foreground">Toko Partner</p>
                      <p className="font-bold text-success tnum">{rupiah(PAKET_COMMISSION.app_only)}</p>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3">
                      <p className="text-xs text-muted-foreground">Super Admin</p>
                      <p className="font-bold text-primary tnum">
                        {rupiah(PAKET_PRICE.app_only - PAKET_COMMISSION.app_only)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Untuk paket <strong>Langganan</strong>, komisi partner flat 10% dari nilai langganan, dibayar
              berulang (recurring).
            </p>
          </div>
        </section>

        {/* ALUR AKTIVASI */}
        <section className="container py-14">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Alur Aktivasi</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-muted-foreground">
            Empat langkah, dari toko partner sampai aplikasi siap dipakai.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <Card key={s.n} className="relative overflow-hidden">
                <CardContent className="pt-6">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {s.n}
                  </span>
                  <p className="mt-3 font-semibold">{s.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* FITUR */}
        <section className="border-t bg-muted/30 py-14">
          <div className="container">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">Fitur Lengkap</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title} className="h-full">
                  <CardContent className="pt-6">
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <p className="mt-3 font-semibold">{f.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container py-16">
          <div className="rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground">
            <h2 className="text-2xl font-bold sm:text-3xl">Siap mulai berjualan?</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm opacity-90">
              Masuk ke aplikasi kasir, masukkan Serial Key dari toko Anda, dan langsung berjualan —
              bahkan tanpa internet.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link href="/pos">Buka Aplikasi Kasir</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link href="/login">Login Toko / Admin</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} KasirPro. Dibuat untuk distro kasir & aktivasi lisensi.</p>
          <div className="flex gap-4">
            <Link href="/pos" className="hover:text-foreground">
              Aplikasi Kasir
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Partner
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
