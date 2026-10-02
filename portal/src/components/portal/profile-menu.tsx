'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogOut, User } from 'lucide-react';

import { inisial } from '@/lib/format';
import { useClickCooldown } from '@/lib/useButtonGuard';

/**
 * Menu profil di kanan atas header.
 *
 * Sebelumnya ada DUA kontrol terpisah di pojok kanan atas: pil berisi nama
 * toko (membuka halaman /profile) + tombol icon logout kecil. Di HP keduanya
 * memakan lebar, jadi logout terasa buried. Kini digabung jadi satu avatar
 * inisial; diklik membuka dropdown kecil di bawahnya.
 *
 * Sengaja TIDAK pakai modal/backdrop — dropdown cukup untuk satu aksi, dan
 * modal bikin layar HP penuh. `right-0` menjaga dropdown tetap di dalam
 * viewport walau di layar sempit.
 */
export function ProfileMenu({ namaToko, email }: { namaToko: string; email: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const ui = useClickCooldown(1500);

  // Klik di luar -> tutup.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Escape -> tutup, lalu kembalikan fokus ke tombol pemicu.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      ref.current?.querySelector('button')?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu profil"
        title={namaToko}
        className="grid h-9 w-9 place-items-center rounded-full bg-zinc-900 text-[12.5px] font-bold text-white transition hover:bg-zinc-700 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        {inisial(namaToko)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-56 animate-fade-in rounded-xl border border-zinc-100 bg-white py-2 shadow-xl"
        >
          <div className="border-b border-zinc-100 px-4 pb-2.5 pt-1">
            <p className="truncate text-[13px] font-bold text-zinc-900">{namaToko}</p>
            {email ? (
              <p className="truncate text-[11.5px] text-zinc-500" title={email}>
                {email}
              </p>
            ) : null}
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            <User className="h-4 w-4 shrink-0 text-zinc-400" />
            Atur Profil
          </Link>

          <form
            method="post"
            action="/api/auth/logout"
            onSubmit={(e) => {
              // Cegah logout ganda: klik kedua dalam 1,5 detik tidak di-forward.
              if (ui.locked('keluar')) {
                e.preventDefault();
                return;
              }
              ui.run(() => undefined, 'keluar');
            }}
          >
            <button
              type="submit"
              role="menuitem"
              disabled={ui.locked('keluar')}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Keluar
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
