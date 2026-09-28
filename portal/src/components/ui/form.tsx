'use client';

import * as React from 'react';

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

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-[12px] text-zinc-400">{hint}</p> : null}
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
              <span className={cn('block text-[11px]', active ? 'text-white/70' : 'text-zinc-400')}>
                {opt.sub}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
