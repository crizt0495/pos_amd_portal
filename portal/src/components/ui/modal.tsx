'use client';

import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  labelledBy?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={cn(
          'relative w-full max-w-[400px] animate-sheet-up rounded-3xl bg-white p-5 shadow-xl',
        )}
      >
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            // text-zinc-600, bukan text-zinc-500: di atas bg-zinc-100, zinc-500 hanya
            // 4,40:1 dan gagal WCAG AA (butuh 4,50:1).
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
