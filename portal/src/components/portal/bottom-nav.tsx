'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Home, KeyRound, User } from 'lucide-react';

import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/aktivasi', label: 'Aktivasi', Icon: KeyRound },
  { href: '/profile', label: 'Profile', Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-zinc-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="grid grid-cols-3">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <button
                type="button"
                onClick={() => router.push(href)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition',
                  active ? 'text-zinc-900' : 'text-zinc-400',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full transition',
                    active && 'bg-zinc-100',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 1.9} />
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
