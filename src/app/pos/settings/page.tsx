'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Copy,
  Database,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  MonitorSmartphone,
  Printer,
  RefreshCw,
  Save,
  Store,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
import { useAppMeta, usePos } from '@/components/pos/pos-provider';
import { DeactivateLicenseButton } from '../layout';
import { useHwidInfo, testPrinter } from '@/lib/receipt';
import { getDB, getMeta, META_KEYS, type LocalLicense } from '@/lib/db/local';
import { isElectron } from '@/lib/hwid';
import { createClient } from '@/lib/supabase/client';
import { fmtDateTime, rupiah } from '@/lib/utils';
import { LICENSE_TYPE_LABEL, PAKET_LABEL } from '@/types';

export default function PosSettingsPage() {
  const { activation, hwid, online, sync, manualSync, expired } = usePos();
  const meta = useAppMeta();
  const toast = useToast();
  const hwInfo = useHwidInfo();

  const [resetOpen, setResetOpen] = React.useState(false);
  const [printerBusy, setPrinterBusy] = React.useState(false);
  const [user, setUser] = React.useState<{ email: string | null } | null>(null);
  const [resetting, setResetting] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const license = useLiveQuery(
    () => (activation?.licenseId ? getDB().licenses_cache.get(activation.licenseId) : undefined),
    [activation?.licenseId],
  ) as LocalLicense | undefined;

  const productCount = useLiveQuery(() => getDB().products.count(), [], 0);
  const txCount = useLiveQuery(() => getDB().transactions.count(), [], 0);
  const lastSync = useLiveQuery(() => getMeta<string | null>(META_KEYS.lastSyncAt, null), [], null);

  React.useEffect(() => {
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        setUser({ email: data.session?.user.email ?? null });
      } catch {
        setUser(null);
      }
    })();
  }, []);

  /**
   * Keluar dari akun sinkronisasi.
   *
   * Tidak menyentuh lisensi: transaksi lokal tetap tersimpan dan aplikasi
   * tetap bisa dipakai offline, hanya pengiriman ke server yang berhenti.
   */
  async function signOutSyncAccount() {
    setSigningOut(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      setUser({ email: null });
      toast.success('Keluar dari akun', 'Data lokal tetap aman, sinkronisasi cloud dijeda.');
    } catch (e) {
      toast.error('Gagal keluar', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setSigningOut(false);
    }
  }

  async function saveShop() {
    try {
      await Promise.all([
        meta.setStoreName(meta.storeName.trim() || 'Toko Saya'),
        meta.setShopAddress(meta.shopAddress.trim()),
        meta.setShopPhone(meta.shopPhone.trim()),
        meta.setCashierName(meta.cashierName.trim() || 'Kasir'),
        meta.setPrinterPort(meta.printerPort.trim()),
        meta.setPrinterWidth(Number(meta.printerWidth) || 58),
      ]);
      toast.success('Pengaturan tersimpan', 'Data toko & kasir disimpan di perangkat.');
    } catch {
      toast.error('Gagal menyimpan pengaturan');
    }
  }

  async function doPrintTest() {
    setPrinterBusy(true);
    try {
      const res = await testPrinter(meta.printerPort);
      if (res.ok) toast.success('Printer OK', res.message);
      else toast.error('Printer gagal', res.message);
    } catch (e) {
      toast.error('Gagal menguji printer', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setPrinterBusy(false);
    }
  }

  async function resetLocalData() {
    if (!window.confirm('Hapus SEMUA data lokal (produk & transaksi)? Tindakan ini tidak bisa dibatalkan.')) return;
    setResetting(true);
    try {
      const db = getDB();
      await db.transaction('rw', [db.products, db.transactions, db.transaction_items], async () => {
        await db.products.clear();
        await db.transactions.clear();
        await db.transaction_items.clear();
      });
      toast.success('Data lokal dihapus', 'Mulai transaksi baru dengan data produk yang baru.');
    } catch (e) {
      toast.error('Gagal menghapus', e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">
          Konfigurasi toko, printer, lisensi, dan data lokal aplikasi
        </p>
      </div>

      {expired && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Masa langganan habis</p>
            <p className="text-muted-foreground">
              Data toko Anda tetap tersimpan dan aplikasi masih dapat digunakan. Hubungi toko Anda untuk
              perpanjangan agar data dapat disinkronkan ke server kembali.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* DATA TOKO */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-5 w-5 text-primary" /> Data Toko &amp; Struk
            </CardTitle>
            <CardDescription>Dikakai pada header &amp; footer struk thermal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Nama Toko" id="s-name">
              <Input
                id="s-name"
                value={meta.storeName}
                onChange={(e) => meta.setStoreName(e.target.value)}
                placeholder="Toko Berkah Jaya"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama Kasir" id="s-cashier">
                <Input
                  id="s-cashier"
                  value={meta.cashierName}
                  onChange={(e) => meta.setCashierName(e.target.value)}
                />
              </Field>
              <Field label="No. Telepon" id="s-phone">
                <Input
                  id="s-phone"
                  value={meta.shopPhone}
                  onChange={(e) => meta.setShopPhone(e.target.value)}
                  placeholder="0812…"
                />
              </Field>
            </div>
            <Field label="Alamat" id="s-addr">
              <Input
                id="s-addr"
                value={meta.shopAddress}
                onChange={(e) => meta.setShopAddress(e.target.value)}
                placeholder="Jl. Merdeka No. 10"
              />
            </Field>
            <Button onClick={() => void saveShop()} size="sm">
              <Save className="h-4 w-4" /> Simpan Pengaturan
            </Button>
          </CardContent>
        </Card>

        {/* PRINTER */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Printer className="h-5 w-5 text-primary" /> Printer Thermal
            </CardTitle>
            <CardDescription>
              Lebar kertas {meta.printerWidth}mm •{' '}
              {isElectron() ? 'Mode desktop (ESC/POS)' : 'Mode browser (dialog cetak)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lebar Kertas (mm)" id="s-width">
                <Input
                  id="s-width"
                  type="number"
                  value={meta.printerWidth}
                  onChange={(e) => meta.setPrinterWidth(parseInt(e.target.value, 10) || 58)}
                  className="tnum"
                />
              </Field>
              <Field label="Port Printer" id="s-port">
                <Input
                  id="s-port"
                  value={meta.printerPort}
                  onChange={(e) => meta.setPrinterPort(e.target.value)}
                  placeholder="tcp://192.168.1.10:9100"
                  className="font-mono text-xs"
                />
              </Field>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">Contoh port printer:</p>
              <ul className="space-y-0.5 font-mono">
                <li>• Jaringan/LAN: tcp://192.168.1.10:9100</li>
                <li>• USB / COM: lihat bagian Printer di README Electron</li>
                <li>• Tanpa printer: preview struk &amp; cetak dari browser</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void doPrintTest()}
                loading={printerBusy}
                disabled={!isElectron()}
              >
                <Printer className="h-4 w-4" /> Cetak Struk Test
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void saveShop()}>
                <Save className="h-4 w-4" /> Simpan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* LISENSI */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-primary" /> Lisensi &amp; Aktivasi
            </CardTitle>
            <CardDescription>Status lisensi aplikasi ini</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activation ? (
              <>
                <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
                  <CopyRow label="Serial Key" value={activation.serialKey} mono />
                  <Separator />
                  <InfoRow label="Toko" value={activation.storeName ?? '-'} />
                  <InfoRow label="Pemilik" value={activation.ownerName ?? '-'} />
                  {license && (
                    <>
                      <InfoRow label="Paket" value={PAKET_LABEL[license.paket_type]} />
                      <InfoRow
                        label="Jenis Lisensi"
                        value={LICENSE_TYPE_LABEL[license.license_type]}
                      />
                      {license.expires_at && (
                        <InfoRow
                          label="Berlaku Sampai"
                          value={fmtDateTime(license.expires_at)}
                          tone={expired ? 'text-destructive' : 'text-success'}
                        />
                      )}
                      <InfoRow label="Aktivasi" value={fmtDateTime(license.activated_at)} />
                      <InfoRow
                        label="Lisensi Terjual"
                        value={rupiah(license.price_idr)}
                        hint={`Komisi toko ${rupiah(license.commission_idr)}`}
                      />
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void manualSync()}
                    disabled={!online}
                    loading={sync.phase === 'pushing' || sync.phase === 'checking'}
                  >
                    <RefreshCw className="h-4 w-4" /> Paksa Sinkronisasi
                  </Button>
                  <DeactivateLicenseButton className="text-destructive" />
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Aplikasi belum diaktivasi.</p>
                <Button asChild size="sm">
                  <a href="/pos/activation">
                    <KeyRound className="h-4 w-4" /> Aktivasi Sekarang
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PERANGKAT */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MonitorSmartphone className="h-5 w-5 text-primary" /> Perangkat &amp; Koneksi
            </CardTitle>
            <CardDescription>Hardware ID yang terkunci ke lisensi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow
              label="Sumber HWID"
              value={
                hwid?.source.includes('electron')
                  ? 'Motherboard/BIOS (Electron)'
                  : hwid?.source === 'browser-fingerprint'
                    ? 'Fingerprint Browser'
                    : 'Fallback'
              }
              tone="text-primary"
            />
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">Hardware ID</span>
              <span className="text-right font-mono text-xs font-semibold">
                {hwid?.hwid ?? hwInfo?.hwid ?? '—'}
              </span>
            </div>
            <InfoRow label="Tipe Perangkat" value={hwid?.deviceName ?? hwInfo?.deviceName ?? '—'} />
            <InfoRow
              label="Koneksi Internet"
              value={online ? 'Online' : 'Offline'}
              tone={online ? 'text-success' : 'text-destructive'}
            />
            <InfoRow
              label="Akun Sync"
              value={user?.email ?? 'Belum login'}
              tone={user?.email ? '' : 'text-warning'}
            />
            <InfoRow label="Mode Aplikasi" value={isElectron() ? 'Desktop (Electron)' : 'Web Browser'} />
            <Separator />
            <p className="text-xs text-muted-foreground">
              {user?.email
                ? 'Data transaksi akan dikirim ke server setiap 30 detik saat online.'
                : 'Untuk sinkronisasi ke server, masuk dengan akun yang diberikan toko Anda. Aplikasi tetap bisa dipakai penuh tanpa login.'}
            </p>
            {!user?.email && (
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href="/login">
                  <LogIn className="h-4 w-4" /> Masuk untuk Sinkronisasi Cloud
                </a>
              </Button>
            )}
            {user?.email && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                loading={signingOut}
                onClick={() => void signOutSyncAccount()}
              >
                <LogOut className="h-4 w-4" /> Keluar dari Akun Sinkronisasi
              </Button>
            )}
          </CardContent>
        </Card>

        {/* DATA LOKAL */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5 text-primary" /> Data Lokal (Dexie.js / IndexedDB)
            </CardTitle>
            <CardDescription>
              Database <code className="rounded bg-muted px-1">kasirpro_local</code> — semua transaksi
              ditulis di sini lebih dulu lalu disinkronkan ke Supabase
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <DataBox label="Produk" value={productCount} icon={<Store className="h-4 w-4" />} />
              <DataBox label="Transaksi" value={txCount} icon={<Database className="h-4 w-4" />} />
              <DataBox
                label="Belum Sync"
                value={sync.pendingProducts + sync.pendingTransactions}
                icon={<RefreshCw className="h-4 w-4" />}
                tone={(sync.pendingProducts + sync.pendingTransactions) > 0 ? 'text-warning' : 'text-success'}
              />
              <DataBox
                label="Sync Terakhir"
                value={lastSync ? fmtDateTime(lastSync) : 'Belum pernah'}
                icon={<Wifi className="h-4 w-4" />}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              {online ? (
                <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              <span>
                {online
                  ? 'Mode online. Sinkronisasi otomatis setiap 30 detik dan saat koneksi kembali.'
                  : 'Mode offline. Semua transaksi tetap aman di perangkat dan akan dikirim otomatis saat online.'}
                {sync.message && ` Status: ${sync.message}`}
              </span>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-sm font-semibold text-destructive">Zona Berbahaya</p>
              <p className="text-xs text-muted-foreground">
                Menghapus data lokal akan menghilangkan seluruh produk & transaksi yang tersimpan di
                perangkat ini. Data yang sudah tersinkron ke server tidak terpengaruh.
              </p>
              <Button variant="destructive" size="sm" onClick={() => setResetOpen(true)}>
                <Trash2 className="h-4 w-4" /> Hapus Semua Data Lokal
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus semua data lokal?</AlertDialogTitle>
            <AlertDialogDescription>
              Seluruh produk dan transaksi yang tersimpan di perangkat ini akan dihapus permanen.
              Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void resetLocalData();
              }}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Ya, Hapus Permanen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

/* ------------------------------------------------------------------ */

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className={`font-medium ${tone ?? ''}`}>{value}</span>
        {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

function CopyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const toast = useToast();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`font-semibold ${mono ? 'font-mono text-xs tracking-wider' : ''}`}>{value}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast.success('Disalin', value);
          }}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DataBox({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <span className={tone ?? 'text-muted-foreground'}>{icon}</span>}
      </div>
      <p className={`mt-0.5 text-sm font-bold ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

