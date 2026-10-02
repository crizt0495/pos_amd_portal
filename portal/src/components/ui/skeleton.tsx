/**
 * Placeholder saat data sedang dimuat.
 *
 * Bentuknya sengaja menyerupai isi halaman (kartu statistik, kartu komisi,
 * daftar key) supaya tidak ada lompatan tata letak setelah loading selesai.
 * Dipakai oleh `loading.tsx`.
 */

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200/70 ${className}`} />;
}

/** Kerangka halaman Home: kartu statistik, kartu komisi, daftar key. */
export function HomeSkeleton() {
  return (
    <main className="app-content" aria-busy="true" aria-live="polite" aria-label="Memuat data">
      <header className="mb-5 flex items-center justify-between gap-2">
        <Bar className="h-[22px] w-16" />
        <Bar className="h-11 w-11 rounded-full" />
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-soft space-y-2 p-4">
            <Bar className="h-6 w-10" />
            <Bar className="h-3 w-14" />
          </div>
        ))}
      </section>

      <section className="mt-3 rounded-2xl bg-zinc-900 p-4">
        <Bar className="h-3 w-24 bg-zinc-700" />
        <Bar className="mt-2 h-7 w-32 bg-zinc-700" />
      </section>

      <section className="mt-4 space-y-2">
        <Bar className="h-3.5 w-28" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card-soft space-y-2 p-3.5">
            <Bar className="h-3.5 w-36" />
            <Bar className="h-3 w-full" />
            <Bar className="h-3 w-24" />
          </div>
        ))}
      </section>
    </main>
  );
}
