'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant; duration?: number }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const remove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue['toast']>(
    ({ title, description, variant = 'info', duration = 4200 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev.slice(-4), { id, title, description, variant, duration }]);
      if (duration > 0) {
        window.setTimeout(() => remove(id), duration);
      }
    },
    [remove],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (t, d) => toast({ title: t, description: d, variant: 'success' }),
      error: (t, d) => toast({ title: t, description: d, variant: 'error', duration: 7000 }),
      info: (t, d) => toast({ title: t, description: d, variant: 'info' }),
      warning: (t, d) => toast({ title: t, description: d, variant: 'warning', duration: 6000 }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:items-end sm:p-4">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertCircle,
};

const STYLES: Record<ToastVariant, string> = {
  success: 'border-success/40 bg-success/10 text-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-foreground',
  info: 'border-primary/40 bg-primary/10 text-foreground',
  warning: 'border-warning/50 bg-warning/10 text-foreground',
};

const ICON_STYLES: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
  warning: 'text-warning',
};

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const Icon = ICONS[item.variant];
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur',
        STYLES[item.variant],
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_STYLES[item.variant])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Tutup"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Tetap aman dipakai di luar provider (mis. unit test / Storybook)
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return ctx;
}
