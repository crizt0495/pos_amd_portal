'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  KeyRound,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
} from 'lucide-react';

import { PosGate, PosProvider, SyncBadge, usePos } from '@/components/pos/pos-provider';
import { PrintHost } from '@/lib/receipt';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getDB } from '@/lib/db/local';
import { useLiveQuery } from 'dexie-react-hooks';
import type { LicenseStatus } from '@/types';

const NAV = [
  { href: '/pos', label: 'Kasir', icon: ShoppingCart },
  { href: '/pos/products', label: 'Produk', icon: Package },
  { href: '/pos/transactions', label: 'Transaksi', icon: Receipt },
  { href: '/pos/reports', label: 'Laporan', icon: BarChart3 },
  { href: '/pos/settings', label: 'Pengaturan', icon: Settings },
];

function PosShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activation, hwid } = usePos();

  const cached = useLiveQuery(() => getDB().licenses_cache.toArray(), [], []);

  if (!activation) return <>{children}</>;

  const license = cached?.find((l) => l.id === activation.licenseId) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="flex h-14 items-center gap-3 px-3">
          <Link href="/pos" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Store className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">
              Kasir<span className="text-primary">Pro</span>
            </span>
          </Link>

          <nav className="no-scrollbar flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map((n) => {
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  <span className="hidden md:inline">{n.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <SyncBadge />
            {hwid && (
              <Badge variant="outline" className="hidden font-mono text-[10px] lg:inline-flex" title="Hardware ID perangkat ini">
                {hwid.hwid.slice(0, 6)}…{hwid.hwid.slice(-4)}
              </Badge>
            )}
            <Button asChild variant="ghost" size="icon-sm" title="Layar aktivasi">
              <Link href="/pos/activation">
                <KeyRound className="h-4 w-4" />
              </Link>
            </Button>
            <LicenseBadge status={(license?.status ?? 'active') as LicenseStatus} />
          </div>
        </div>

        {license && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {activation.storeName || license.store_name || 'Toko'}
            </span>
            {activation.ownerName && <span>Pemilik: {activation.ownerName}</span>}
            <span className="font-mono">{activation.serialKey}</span>
            {license.paket_type === 'bundle_pc_app' && <span>Paket: Bundle PC + APP</span>}
            {license.license_type === 'subscription' && license.expires_at && (
              <span>Berlaku s/d {new Date(license.expires_at).toLocaleDateString('id-ID')}</span>
            )}
            <Link href="/pos/activation" className="ml-auto underline-offset-2 hover:underline">
              Detail lisensi
            </Link>
          </div>
        )}
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

function LicenseBadge({ status }: { status: LicenseStatus }) {
  const map: Record<LicenseStatus, { v: 'success' | 'warning' | 'destructive' | 'muted'; t: string }> = {
    active: { v: 'success', t: 'Aktif' },
    unused: { v: 'warning', t: 'Belum Dipakai' },
    blocked: { v: 'destructive', t: 'Diblokir' },
    expired: { v: 'destructive', t: 'Kedaluwarsa' },
    revoked: { v: 'destructive', t: 'Dicabut' },
  };
  const s = map[status] ?? map.active!;
  return <Badge variant={s.v}>{s.t}</Badge>;
}

/**
 * Putuskan lisensi di perangkat ini.
 *
 * Menghapus cache aktivasi lokal sehingga kasir berhenti dan pengguna diminta
 * serial key baru. HWID di server TIDAK dilepas — hubungi toko Anda atau
 * Super Admin agar lisensi dilepas dari perangkat lama.
 */
export function DeactivateLicenseButton({ className }: { className?: string }) {
  const { deactivate } = usePos();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="outline"
      className={className}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await deactivate();
        setBusy(false);
        window.location.href = '/pos/activation';
      }}
    >
      <LogOut className="h-4 w-4" /> Putuskan Lisensi
    </Button>
  );
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PosProvider>
      <PosGate>
        <PosShell>{children}</PosShell>
        <PrintHost />
      </PosGate>
    </PosProvider>
  );
}
