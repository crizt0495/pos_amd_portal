import * as React from 'react';
import { BarChart3, Boxes, LogOut, Receipt, Store, WifiOff } from 'lucide-react';

import { licenseApi, settingsApi, system } from './lib/api';
import { ToastProvider, useToast } from './components/Toast';
import ActivationScreen from './screens/Activation';
import KasirScreen from './screens/Kasir';
import ProdukScreen from './screens/Produk';
import LaporanScreen from './screens/Laporan';
import type { LicenseStatus } from './types';

type TabKey = 'kasir' | 'produk' | 'laporan';

const TABS: { key: TabKey; label: string; Icon: typeof Receipt }[] = [
  { key: 'kasir', label: 'Kasir', Icon: Receipt },
  { key: 'produk', label: 'Produk', Icon: Boxes },
  { key: 'laporan', label: 'Laporan', Icon: BarChart3 },
];

/* ------------------------------------------------------------------ */
/* Splash                                                              */
/* ------------------------------------------------------------------ */

function Splash() {
  return (
    <div className="grid h-full place-items-center bg-zinc-100">
      <div className="flex flex-col items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-zinc-900">
          <Receipt className="h-7 w-7 text-white" />
        </span>
        <p className="text-[13px] text-zinc-500">Menyiapkan database kasir...</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shell (setelah lisensi valid)                                       */
/* ------------------------------------------------------------------ */

interface AppInfo {
  version: string;
  portalUrl: string;
  escpos: boolean;
  platform: string;
}

function Shell({
  status,
  onLocked,
}: {
  status: LicenseStatus;
  onLocked: (next: LicenseStatus) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = React.useState<TabKey>('kasir');
  const [store, setStore] = React.useState({
    name: 'KasirPro',
    address: '' as string,
    phone: '' as string,
    cashier: 'Kasir',
  });
  const [info, setInfo] = React.useState<AppInfo | null>(null);
  const [offline, setOffline] = React.useState(false);

  /* ------------------------------ settings ----------------------------- */
  const loadStore = React.useCallback(async () => {
    const [name, address, phone, cashier] = await Promise.all([
      settingsApi.get<string>('storeName', 'KasirPro'),
      settingsApi.get<string>('storeAddress', ''),
      settingsApi.get<string>('storePhone', ''),
      settingsApi.get<string>('cashierName', 'Kasir'),
    ]);
    setStore({
      name: name || status.license?.nama_toko || 'KasirPro',
      address: address || '',
      phone: phone || '',
      cashier: cashier || 'Kasir',
    });
  }, [status.license?.nama_toko]);

  React.useEffect(() => {
    void loadStore();
    void system.appInfo().then((res) => {
      if (res.ok) {
        setInfo({
          version: res.version ?? '0.0.0',
          portalUrl: res.portalUrl ?? '',
          escpos: Boolean(res.escpos),
          platform: res.platform ?? '',
        });
      }
    });

    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [loadStore]);

  /* ------------- refresh stok saat pindah tab (kasper Live) ------------- */
  const handleVoid = React.useCallback(
    async (invoiceNo: string) => {
      toast.ok(`Transaksi ${invoiceNo} dibatalkan`, 'Stok produk sudah dikembalikan.');
      await loadStore();
    },
    [loadStore, toast],
  );

  return (
    <div className="flex h-full bg-zinc-100">
      {/* ---------------------------- sidebar ---------------------------- */}
      <aside className="flex w-[196px] shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex items-center gap-2.5 border-b border-zinc-100 px-4 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-900">
            <Receipt className="h-4 w-4 text-white" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-tight text-zinc-900">KasirPro</p>
            <p className="truncate text-[10.5px] text-zinc-500">{info?.version ?? '1.0.0'}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-2.5">
          {TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition ${
                  active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-zinc-100 p-3 text-[10.5px] text-zinc-500">
          <div className="flex items-start gap-1.5">
            <Store className="mt-px h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-zinc-700">{store.name}</p>
              <p className="truncate">{store.cashier}</p>
            </div>
          </div>

          {offline ? (
            <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-amber-700">
              <WifiOff className="h-3 w-3" /> Offline — data tetap aman
            </p>
          ) : null}

          <button
            type="button"
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left transition hover:text-zinc-800"
            onClick={async () => {
              const res = await licenseApi.check();
              if (!res.ok) {
                onLocked(res);
                return;
              }
              toast.ok('Lisensi valid', res.license?.serial_key ?? '');
            }}
            title="Cek lisensi & HWID perangkat"
          >
            <LogOut className="h-3.5 w-3.5 rotate-180" />
            <span className="truncate">Lisensi: {status.license?.serial_key ?? '-'}</span>
          </button>
        </div>
      </aside>

      {/* ------------------------------ main ----------------------------- */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-2.5">
          <div>
            <h1 className="text-[15px] font-bold leading-tight text-zinc-900">
              {TABS.find((t) => t.key === tab)?.label}
            </h1>
            <p className="text-[11px] text-zinc-500">
              {new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="text-right text-[11px] text-zinc-500">
            <p className="font-semibold text-zinc-700">{store.cashier}</p>
            {info?.portalUrl ? (
              <p className="max-w-[220px] truncate" title={info.portalUrl}>
                {info.portalUrl.replace(/^https?:\/\//, '')}
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'kasir' ? <KasirScreen store={store} /> : null}
          {tab === 'produk' ? <ProdukScreen /> : null}
          {tab === 'laporan' ? <LaporanScreen onVoid={handleVoid} /> : null}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

function Root() {
  const [status, setStatus] = React.useState<LicenseStatus | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        setStatus(await licenseApi.check());
      } catch (err) {
        setStatus({
          ok: false,
          code: 'ERROR',
          message: err instanceof Error ? err.message : 'Gagal memeriksa lisensi.',
        });
      }
    })();
  }, []);

  if (!status) return <Splash />;
  if (!status.ok) return <ActivationScreen status={status} onActivated={async () => setStatus(await licenseApi.check())} />;

  return <Shell status={status} onLocked={setStatus} />;
}

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}
