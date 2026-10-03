import type { Metadata } from 'next';
import Image from 'next/image';
import { AlertCircle, LogIn, Sparkles, Store, User } from 'lucide-react';

/**
 * Halaman login — SERVER component, TANPA hydration React.
 *
 * Form dikirim apa adanya ke POST /api/auth/login (form-urlencoded) lalu
 * di-redirect 303. Tidak ada satu pun Client Component: tidak ada `useState`,
 * `onChange`, validasi live, atau apa pun yang benar-benar butuh JS.
 *
 * Tapi selama halaman ini dirender lewat App Router, browser tetap wajib
 * mengunduh react-dom (53,6 kB) + Next runtime (33,7 kB) lalu me-hydrate
 * pohon RSC — terukur 226 ms TBT di produksi untuk halaman yang butuh 0 ms.
 *
 * Karena itu hasil build-nya dipoles oleh `scripts/inline-login.mjs`:
 * CSS di-inline ke dalam `<style>` dan seluruh `<script>` React dibuang, jadi
 * HTML final benar-benar mandiri (nol request JS, nol request CSS).
 *
 * Konsekuensinya — semua perilaku ini HARUS tetap dijaga di sini:
 *   1. `?next=` dan `?error=` tidak lagi dibaca server (supaya halaman bisa
 *      di-prerender). Keduanya ditangani skrip inline di bawah.
 *   2. Redirect "sudah punya sesi -> /home" tetap ditangani `middleware.ts`.
 *   3. Tanpa JS, form tetap berfungsi: `next` default-nya `/home`.
 */

export const metadata: Metadata = { title: 'Masuk — KasirPro Portal' };

/** Informasi akun demo yang selalu ditampilkan di halaman login. */
const DEMO_USER = { username: 'demo', password: 'toko12345' };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col px-5 pb-8 pt-14 sm:max-w-[480px]">
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
        <input type="hidden" name="next" id="login-next" value="/home" />

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

        {/* Selalu ada di DOM; skrip yang akan membukanya. Atribut `hidden`
            disembunyikan oleh aturan `[hidden]` di globals.css — kelas `flex`
            di sini kalau menang akan membuat kotak kosong tetap terlihat.
            Teks diisi lewat `textContent`, jadi pesan dari URL tidak pernah
            diperlakukan sebagai HTML. */}
        <div
          id="login-error"
          hidden
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span id="login-error-text" />
        </div>

        <button type="submit" id="btn-masuk" className="btn-primary mt-2" data-loading="false">
          <LogIn className="h-4 w-4" />
          <span>Masuk</span>
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

      {/* Skrip ini satu-satunya JS di halaman (~1,2 kB). Penanda
          `__LOGIN_INLINE__` dipakai scripts/inline-login.mjs untuk membedakannya
          dari `<script>` runtime React yang harus dibuang. JANGAN dihapus penandanya. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `/*__LOGIN_INLINE__*/
(function () {
  var q = new URLSearchParams(location.search);

  /* ?next= -> field hidden. Hanya path lokal yang diterima; '//evil' ditolak
     supaya tidak mungkin terjadi open redirect lewat parameter. */
  var next = q.get('next');
  if (next && next.charAt(0) === '/' && next.charAt(1) !== '/') {
    var nf = document.getElementById('login-next');
    if (nf) nf.value = next;
  }

  /* ?error= -> banner. Dipasang lewat textContent, JANGAN innerHTML: pesan ini
     berasal dari URL dan tidak boleh pernah diperlakukan sebagai HTML. */
  var err = q.get('error');
  if (err) {
    var box = document.getElementById('login-error');
    var txt = document.getElementById('login-error-text');
    if (txt) txt.textContent = err;
    if (box) box.removeAttribute('hidden');
  }

  var pass = document.getElementById('password');
  var toggle = document.querySelector('[data-toggle-pass]');
  if (pass && toggle) {
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
      if (pass) pass.value = 'toko12345';
    });
  }

  /* Anti klik-ganda: 1 klik = 1 submit, tombol terkunci 1,5 detik.
     Kalau server tidak membalas dalam 1,5 detik (mis. jaringan lambat),
     tombol dilepas lagi supaya user tidak terkunci permanen. */
  var form = document.querySelector('form');
  var masuk = document.getElementById('btn-masuk');
  if (form && masuk) {
    var label = masuk.querySelector('span');
    form.addEventListener('submit', function (e) {
      /* Saat terkunci, batal-kan submit supaya tidak ada request kedua yang lolos
         (mis. user menahan Enter saat server lambat). */
      if (masuk.disabled) { if (e && e.preventDefault) e.preventDefault(); return; }
      masuk.disabled = true;
      masuk.setAttribute('data-loading', 'true');
      if (label) label.textContent = 'Memproses…';
      window.setTimeout(function () {
        masuk.disabled = false;
        masuk.setAttribute('data-loading', 'false');
        if (label) label.textContent = 'Masuk';
      }, 1500);
    });
  }

  /* PWA: next-pwa menyuntikkan pendaftaran sw.js lewat <script src> runtime
     React, jadi ikut ter-strip di sini. Daftarkan ulang saat idle supaya
     halaman login tetap bisa di-install sebagai PWA tanpa berebut FCP. */
  if ('serviceWorker' in navigator) {
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1500); };
    idle(function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    });
  }
})();`,
        }}
      />
    </main>
  );
}