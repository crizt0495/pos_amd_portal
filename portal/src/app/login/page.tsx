import type { Metadata } from 'next';
import Image from 'next/image';
import { AlertCircle, LogIn, Sparkles, Store, User } from 'lucide-react';

/**
 * Halaman login — SERVER component (tanpa hydration React).
 *
 * Form dikirim langsung ke POST /api/auth/login (form-urlencoded) lalu
 * di-redirect 303. Alasan tanpa hydration: membuat halaman login sangat
 * ringan (TBT ~0) sehingga skor Lighthouse Performance = 100 dan halaman
 * tetap berfungsi walau JS lambat/offline-render.
 */

export const metadata: Metadata = { title: 'Masuk — KasirPro Portal' };

/** Informasi akun demo yang selalu ditampilkan di halaman login. */
const DEMO_USER = { username: 'demo', password: 'toko12345' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/home';

  let error: string | null = null;
  if (sp.error) {
    try {
      error = decodeURIComponent(sp.error);
    } catch {
      error = sp.error;
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-8 pt-14">
      <div className="mb-10 flex items-center gap-3">
        <Image
          src="/icons/icon-192.png"
          alt="Logo KasirPro"
          width={44}
          height={44}
          className="rounded-xl"
          priority
        />
        <div>
          <p className="text-[17px] font-bold leading-tight">KasirPro Portal</p>
          <p className="text-[12px] text-zinc-500">Operasional Toko Komputer</p>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-[26px] font-bold leading-snug">Masuk ke Toko Anda</h1>
        <p className="mt-1.5 text-[14px] text-zinc-500">
          Gunakan username &amp; password yang diberikan admin.
        </p>
      </div>

      <form method="post" action="/api/auth/login" className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />

        <div>
          <label className="field-label" htmlFor="username">
            Username
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="username"
              name="username"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
              placeholder="demo atau email toko"
              className="field-input pl-10"
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="field-input pr-14"
            />
            <button
              type="button"
              data-toggle-pass
              className="absolute right-1 top-1/2 grid h-11 min-w-[44px] -translate-y-1/2 place-items-center rounded-xl px-1 text-[12px] font-semibold text-zinc-500 active:bg-zinc-100"
            >
              Lihat
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <button type="submit" className="btn-primary mt-2">
          <LogIn className="h-4 w-4" />
          Masuk
        </button>
      </form>

      <div className="my-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-amber-800">
          <Sparkles className="h-3.5 w-3.5" />
          Akun Demo — coba langsung
        </p>
        <div className="mt-2 space-y-1 text-[12px] text-amber-900">
          <p>
            Username: <span className="font-mono font-semibold">{DEMO_USER.username}</span>
          </p>
          <p>
            Password: <span className="font-mono font-semibold">{DEMO_USER.password}</span>
          </p>
        </div>
        <button
          type="button"
          id="btn-demo"
          className="mt-3 rounded-lg bg-amber-700 px-4 text-[12px] font-semibold text-white min-h-[44px] active:scale-[.98]"
        >
          Isi otomatis
        </button>
      </div>

      <div className="mt-auto rounded-2xl bg-zinc-50 p-4">
        <p className="text-[12px] font-semibold text-zinc-700">
          <Store className="mr-1 inline h-3.5 w-3.5 text-zinc-400" />
          Belum punya akun?
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          Akun toko dibuat oleh admin. Hubungi admin untuk memperoleh username, password, dan jatah
          lisensi awal.
        </p>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
(function () {
  var pass = document.getElementById('password');
  if (!pass) return;
  var toggle = document.querySelector('[data-toggle-pass]');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var hidden = pass.type === 'password';
      pass.type = hidden ? 'text' : 'password';
      toggle.textContent = hidden ? 'Sembunyi' : 'Lihat';
    });
  }
  var demo = document.getElementById('btn-demo');
  if (demo) {
    demo.addEventListener('click', function () {
      var u = document.getElementById('username');
      if (u) u.value = 'demo';
      pass.value = 'toko12345';
    });
  }
})();
`,
        }}
      />
    </main>
  );
}