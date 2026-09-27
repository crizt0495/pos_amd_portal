'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { KeyRound, LayoutDashboard, LogOut, Store, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { QUOTA_LOW_WARNING, TOPUP_AMOUNT, type Profile } from '@/types';

const NAV = [
  { href: '/dashboard', label: 'Aktivasi', icon: LayoutDashboard },
  { href: '/dashboard/licenses', label: 'Lisensi Saya', icon: KeyRound },
  { href: '/dashboard/commissions', label: 'Komisi', icon: Wallet },
  { href: '/dashboard/stores', label: 'Toko Pembeli', icon: Store },
];

export function PartnerHeader({
  profile,
  storeName,
  quota,
  quotaTotal,
  onLogout,
}: {
  profile: Profile | null;
  storeName: string;
  quota: number;
  quotaTotal: number;
  onLogout: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const low = quota <= QUOTA_LOW_WARNING;
  const usedPct = quotaTotal > 0 ? Math.min(100, ((quotaTotal - quota) / quotaTotal) * 100) : 0;

  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">
            Kasir<span className="text-primary">Pro</span>
          </span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname === n.href
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Kuota */}
          <button
            type="button"
            onClick={() => router.push('/dashboard/commissions')}
            className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors hover:bg-accent"
            title="Sisa kuota lisensi"
          >
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <div className="text-left">
              <p className="text-[10px] leading-none text-muted-foreground">Sisa Lisensi</p>
              <p className={cn('text-sm font-bold leading-tight tnum', low ? 'text-destructive' : 'text-success')}>
                {quota}/{quotaTotal}
              </p>
            </div>
          </button>

          {profile?.role === 'super_admin' && (
            <Button asChild variant="ghost" size="xs">
              <Link href="/admin">Panel Admin</Link>
            </Button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary"
              title={profile?.email ?? storeName}
            >
              {(storeName || profile?.email || '?').slice(0, 1).toUpperCase()}
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border bg-popover p-1 shadow-lg">
                  <div className="border-b px-3 py-2">
                    <p className="truncate text-sm font-semibold">{storeName}</p>
                    <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
                    <Badge variant="secondary" className="mt-1.5 text-[10px]">
                      {profile?.role === 'super_admin' ? 'Super Admin' : 'Partner'}
                    </Badge>
                  </div>
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="block rounded px-3 py-2 text-sm hover:bg-accent md:hidden"
                  >
                    Menu
                  </Link>
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" /> Keluar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alert kuota menipis */}
      {low && (
        <div className="flex flex-wrap items-center gap-2 border-t border-warning/40 bg-warning/15 px-4 py-2 text-xs">
          <span className="font-semibold text-warning-foreground">
            ⚠ Stok lisensi menipis — sisa {quota} dari {quotaTotal}.
          </span>
          <span className="text-muted-foreground">
            Hubungi Super Admin untuk topup +{TOPUP_AMOUNT} lisensi.
          </span>
          <Button asChild size="xs" variant="warning" className="ml-auto">
            <Link href="/dashboard/commissions">Lihat Detail</Link>
          </Button>
        </div>
      )}

      {/* Progress */}
      <div className="h-1 w-full bg-muted">
        <Progress
          value={usedPct}
          className="h-1 rounded-none"
          indicatorClassName={low ? 'bg-destructive' : 'bg-primary'}
        />
      </div>
    </header>
  );
}

export async function logoutPartner(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

export function usePartnerLogout() {
  const router = useRouter();
  return async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };
}
