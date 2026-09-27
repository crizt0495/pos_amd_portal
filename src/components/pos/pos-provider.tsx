'use client';

import * as React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, ShieldAlert, Wifi, WifiOff } from 'lucide-react';

import {
  clearActivation,
  getActivation,
  getDB,
  getMeta,
  META_KEYS,
  setMeta,
  type LocalActivation,
} from '@/lib/db/local';
import { getHwid, type HwidResult } from '@/lib/hwid';
import { startAutoSync, subscribeSync, syncNow, type SyncState } from '@/lib/db/sync';
import { activateLicense, isExpired, verifyLicenseOnline } from '@/lib/activation';
import { APP_VERSION } from '@/lib/utils';
import type { ActivateResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PosContextValue {
  ready: boolean;
  activation: LocalActivation | null;
  hwid: HwidResult | null;
  online: boolean;
  sync: SyncState;
  expired: boolean;
  /** Tampilkan lock ketika HWID lokal tidak cocok dengan cache lisensi. */
  tampered: boolean;
  /** Sedang memverifikasi lisensi ke server (untuk status loading tombol). */
  checking: boolean;
  refresh: () => Promise<void>;
  activate: (serialKey: string) => Promise<ActivateResponse>;
  deactivate: () => Promise<void>;
  recheck: () => Promise<void>;
  manualSync: () => Promise<void>;
}

const PosContext = React.createContext<PosContextValue | null>(null);

export function usePos(): PosContextValue {
  const ctx = React.useContext(PosContext);
  if (!ctx) throw new Error('usePos harus dipakai di dalam <PosProvider>');
  return ctx;
}

export function PosProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [activation, setActivation] = React.useState<LocalActivation | null>(null);
  const [hwid, setHwid] = React.useState<HwidResult | null>(null);
  const [online, setOnline] = React.useState(true);
  const [sync, setSync] = React.useState<SyncState>({
    phase: 'idle',
    lastSyncAt: null,
    pendingProducts: 0,
    pendingTransactions: 0,
    message: '',
    online: true,
    licenseValid: false,
  });
  const [tampered, setTampered] = React.useState(false);
  const [checking, setChecking] = React.useState(false);

  const load = React.useCallback(async () => {
    const [act, hw] = await Promise.all([getActivation(), getHwid()]);
    setActivation(act);
    setHwid(hw);

    // HWID tersimpan di 2 tempat: Dexie (hwid_cache) & lisensi (server).
    // Cek konsistensi lokal -> mendeteksi salinan file database.
    if (act) {
      const db = getDB();
      const cachedHwid = await db.hwid_cache.get('current');
      if (cachedHwid && cachedHwid.hwid !== act.hwid) {
        setTampered(true);
      } else if (cachedHwid) {
        await db.hwid_cache.update('current', { last_checked: new Date().toISOString() });
      }
    }
    setReady(true);
  }, []);

  React.useEffect(() => {
    let stop: (() => void) | undefined;
    void (async () => {
      await load();
      stop = startAutoSync();
    })();
    return () => stop?.();
  }, [load]);

  React.useEffect(() => subscribeSync(setSync), []);

  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  /** Verifikasi online saat aplikasi dibuka (mendeteksi aplikasi yang dicopy). */
  const recheck = React.useCallback(async () => {
    const act = await getActivation();
    const hw = await getHwid();
    if (!act || !navigator.onLine) return;
    setChecking(true);
    try {
      const res = await verifyLicenseOnline(act.serialKey, hw.hwid);
      if (!res.ok && (res.code === 'HWID_MISMATCH' || res.code === 'BLOCKED')) {
        setTampered(true);
      }
    } catch {
      /* offline / server down: abaikan, tetap izinkan offline */
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void recheck();
  }, [recheck]);

  const value = React.useMemo<PosContextValue>(
    () => ({
      ready,
      activation,
      hwid,
      online,
      sync,
      expired: activation ? isExpired(activation.expiresAt) : false,
      tampered,
      checking,
      refresh: load,
      activate: async (serialKey: string) => {
        const res = await activateLicense(serialKey);
        if (res.ok) {
          setTampered(false);
          await load();
        }
        return res;
      },
      deactivate: async () => {
        await clearActivation();
        setActivation(null);
        setTampered(false);
        await load();
      },
      recheck,
      manualSync: async () => {
        await syncNow(true);
      },
    }),
    [ready, activation, hwid, online, sync, tampered, checking, load, recheck],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

/* ------------------------------------------------------------------ */
/* Gate                                                                */
/* ------------------------------------------------------------------ */

export function PosGate({ children }: { children: React.ReactNode }) {
  const { ready, activation, online, tampered, checking, recheck } = usePos();
  const router = useRouter();

  // 1) Still loading -> skeleton
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Menyiapkan database lokal…</p>
        </div>
      </div>
    );
  }

  // 2) Salinan aplikasi terdeteksi -> aplikasi terkunci
  if (tampered) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <Card className="w-full max-w-lg border-destructive/50">
          <CardContent className="space-y-4 pt-6 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-destructive/10">
              <ShieldAlert className="h-9 w-9 text-destructive" />
            </span>
            <div>
              <h1 className="text-xl font-bold">Aplikasi Terkunci</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Hardware ID perangkat ini tidak cocok dengan lisensi yang terdaftar. Aplikasi ini
                kemungkinan telah disalin ke komputer lain.
              </p>
            </div>
            <div className="rounded-lg border bg-muted/50 p-3 text-left text-xs">
              <p className="font-semibold">Yang perlu dilakukan:</p>
              <ol className="mt-1 list-decimal space-y-1 pl-4 text-muted-foreground">
                <li>Kembalikan aplikasi ke komputer asli, atau</li>
                <li>Hubungi Super Admin untuk reset HWID lisensi Anda.</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" onClick={() => void recheck()} loading={checking}>
                <Wifi className="h-4 w-4" /> Cek Ulang dengan Server
              </Button>
              <Button onClick={() => router.push('/pos/activation')}>Lihat Detail Lisensi</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3) Belum diaktivasi
  if (!activation) {
    return (
      <div className="min-h-screen bg-muted/30">
        {children}
      </div>
    );
  }

  // 4) Sudah aktif
  return (
    <>
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-warning/90 px-4 py-1.5 text-xs font-medium text-warning-foreground">
          <WifiOff className="h-3.5 w-3.5" /> Mode Offline — transaksi tetap tersimpan di perangkat ini
        </div>
      )}
      {children}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Badge status koneksi + sinkronisasi                                 */
/* ------------------------------------------------------------------ */

export function SyncBadge() {
  const { sync, online, activation, manualSync } = usePos();
  const pending = sync.pendingProducts + sync.pendingTransactions;

  const variant = !online
    ? 'warning'
    : sync.phase === 'error'
      ? 'destructive'
      : pending > 0
        ? 'secondary'
        : 'success';

  const label = !online
    ? 'Offline'
    : sync.phase === 'checking'
      ? 'Cek lisensi…'
      : sync.phase === 'pushing'
        ? 'Sync…'
        : sync.phase === 'error'
          ? 'Sync gagal'
          : pending > 0
            ? `${pending} belum sync`
            : 'Tersinkron';

  return (
    <button
      type="button"
      onClick={() => void manualSync()}
      disabled={!online || !activation}
      className="outline-none"
      title="Klik untuk sinkronkan sekarang"
    >
      <Badge variant={variant} className="cursor-pointer gap-1.5 hover:opacity-80">
        {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {label}
        {sync.phase === 'pushing' && <Loader2 className="h-3 w-3 animate-spin" />}
      </Badge>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks kecil                                                         */
/* ------------------------------------------------------------------ */

export function useMeta<T>(key: string, fallback: T): [T, (v: T) => Promise<void>] {
  const value = useLiveQuery(async () => getMeta<T>(key, fallback), [key], fallback);
  const set = React.useCallback((v: T) => setMeta(key, v), [key]);
  return [(value as T) ?? fallback, set];
}

export function useAppMeta() {
  const [storeName, setStoreName] = useMeta<string>(META_KEYS.storeName, 'Toko Saya');
  const [cashierName, setCashierName] = useMeta<string>(META_KEYS.cashierName, 'Kasir');
  const [shopAddress, setShopAddress] = useMeta<string>(META_KEYS.shopAddress, '');
  const [shopPhone, setShopPhone] = useMeta<string>(META_KEYS.shopPhone, '');
  const [printerPort, setPrinterPort] = useMeta<string>(META_KEYS.printerPort, '');
  const [printerWidth, setPrinterWidth] = useMeta<number>(META_KEYS.printerWidth, 58);

  return {
    storeName,
    setStoreName,
    cashierName,
    setCashierName,
    shopAddress,
    setShopAddress,
    shopPhone,
    setShopPhone,
    printerPort,
    setPrinterPort,
    printerWidth,
    setPrinterWidth,
  };
}

export { APP_VERSION, AlertTriangle };
