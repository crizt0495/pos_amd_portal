'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn('field-input', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn('field-textarea', className)} rows={3} {...props} />;
});

/**
 * Input nomor telepon — hanya menerima angka.
 *
 * Tiga lapis pertahanan, karena `inputMode` saja tidak cukup:
 * 1. `inputMode="numeric"` → keyboard HP langsung numeric, bukan ada tombol huruf.
 * 2. Saring di `onChange` → karakter yang lolos dari keyboard atau dari paste
 *    (mis. "0812-3456-abc" ditempel dari WA) langsung dibuang, bukan baru
 *    ditolak saat submit. Value yang tampil selalu bersih.
 * 3. `pattern="[0-9]*"` → petunjuk untuk browser & pembantu aksesibilitas.
 *
 * `maxLength` (default 15) memotong di sisi input, bukan karena error.
 */
export const InputTelepon = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'maxLength' | 'type'> & {
    onChange: (v: string) => void;
    maxLength?: number;
  }
>(function InputTelepon({ className, onChange, maxLength = 15, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="tel"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="tel"
      maxLength={maxLength}
      className={cn('field-input', className)}
      {...props}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
    />
  );
});

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  /** Pesan validasi. Kalau ada, border input jadi merah + teks bantuan di bawah. */
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[12px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

/** Pilihan 2 (atau lebih) berbentuk segmented button — ramah sentuhan di mobile. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  name,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; sub?: string }[];
  name: string;
}) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={name}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn('seg-option', active && 'seg-option-active')}
          >
            <span className="block truncate">{opt.label}</span>
            {opt.sub ? (
              <span className={cn('block text-[11px]', active ? 'text-white/70' : 'text-zinc-500')}>
                {opt.sub}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
