import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

/** Toast ringan untuk umpan balik aksi (simpan, cetak, hapus, ...). */
export type ToastTone = 'ok' | 'error' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastApi {
  ok: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  return ctx;
}

const TONE = {
  ok: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  error: { cls: 'border-red-200 bg-red-50 text-red-800', Icon: AlertTriangle },
  info: { cls: 'border-zinc-200 bg-white text-zinc-800', Icon: Info },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const seq = React.useRef(0);

  const remove = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (tone: ToastTone, title: string, detail?: string) => {
      seq.current += 1;
      const id = seq.current;
      setItems((prev) => [...prev, { id, tone, title, detail }]);
      window.setTimeout(() => remove(id), tone === 'error' ? 6500 : 3800);
    },
    [remove],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      ok: (t, d) => push('ok', t, d),
      error: (t, d) => push('error', t, d),
      info: (t, d) => push('info', t, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[320px] flex-col gap-2">
        {items.map((t) => {
          const { cls, Icon } = TONE[t.tone];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex animate-fade-in items-start gap-2.5 rounded-xl border p-3 shadow-lg ${cls}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-tight">{t.title}</p>
                {t.detail ? <p className="mt-0.5 text-[12px] leading-snug opacity-80">{t.detail}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Tutup"
                className="shrink-0 opacity-50 transition hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
