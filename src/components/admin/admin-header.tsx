'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Store,
  Users,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

const NAV = [
  { href: '/admin', label: 'Ringkasan', icon: LayoutDashboard },
  { href: '/admin/partners', label: 'Partner', icon: Users },
  { href: '/admin/licenses', label: 'Lisensi & HWID', icon: KeyRound },
  { href: '/admin/stores', label: 'Toko', icon: Store },
  { href: '/admin/finance', label: 'Keuangan', icon: Wallet },
];

export function AdminHeader({ profile }: { profile: Profile | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link href="/admin" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">
            Kasir<span className="text-primary">Pro</span> Admin
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
          <Button asChild variant="ghost" size="xs" className="hidden sm:inline-flex">
            <Link href="/dashboard">Mode Partner</Link>
          </Button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full bg-foreground/10 text-sm font-bold"
              title={profile?.email ?? 'Super Admin'}
            >
              <ShieldCheck className="h-4 w-4" />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="absolute right-0 z-50 mt-2 w-60 rounded-lg border bg-popover p-1 shadow-lg">
                  <div className="border-b px-3 py-2">
                    <p className="truncate text-sm font-semibold">Super Admin</p>
                    <p className="truncate text-xs text-muted-foreground">{profile?.email ?? '-'}</p>
                    <Badge variant="destructive" className="mt-1.5 text-[10px]">
                      <ShieldCheck className="h-3 w-3" /> Akses Penuh
                    </Badge>
                  </div>
                  <div className="border-b px-3 py-2 md:hidden">
                    {NAV.map((n) => (
                      <Link
                        key={n.href}
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-sm"
                      >
                        <n.icon className="h-4 w-4" /> {n.label}
                      </Link>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void (async () => {
                        const supabase = createClient();
                        await supabase.auth.signOut();
                        router.replace('/login');
                        router.refresh();
                      })();
                    }}
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
    </header>
  );
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <Activity className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
