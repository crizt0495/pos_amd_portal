'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-10 text-center',
        className,
      )}
    >
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'primary';
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    primary: 'text-primary',
  };
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {icon && <div className={cn('opacity-70', tones[tone])}>{icon}</div>}
      </div>
      <p className={cn('mt-2 text-2xl font-bold tnum', tones[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
