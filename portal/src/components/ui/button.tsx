'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  outline: 'btn-outline',
  ghost: 'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[14px] font-semibold text-zinc-700 transition active:scale-[0.99] disabled:opacity-50',
  danger: 'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-50',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-10',
  md: 'h-12',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      data-loading={loading ? 'true' : undefined}
      aria-busy={loading || undefined}
      className={cn(VARIANT[variant], SIZE[size], 'disabled:pointer-events-none', className)}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
