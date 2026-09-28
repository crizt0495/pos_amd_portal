'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2, LogIn, Sparkles, Store, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';

/** Informasi akun demo yang selalu ditampilkan di halaman login. */
const DEMO_USER = { username: 'demo', password: 'toko12345' };

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    params.get('error') ? decodeURIComponent(params.get('error') as string) : null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message || 'Gagal masuk. Coba lagi.');
        return;
      }

      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? next : '/home');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  function fillDemo() {
    setUsername(DEMO_USER.username);
    setPassword(DEMO_USER.password);
    setError(null);
  }

  return (
    <main className="flex min-h-[100dvh] flex-col px-5 pb-8 pt-14">
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
          <p className="text-[12px] text-zinc-400">Operasional Toko Komputer</p>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="text-[26px] font-bold leading-snug">Masuk ke Toko Anda</h1>
        <p className="mt-1.5 text-[14px] text-zinc-500">
          Gunakan username &amp; password yang diberikan admin.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Username" htmlFor="username">
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              id="username"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="demo atau email toko"
              className="pl-10"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              className="pr-16"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-zinc-500"
            >
              {showPass ? 'Sembunyi' : 'Lihat'}
            </button>
          </div>
        </Field>

        {error ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button type="submit" loading={loading} className="mt-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Masuk
        </Button>
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
          onClick={fillDemo}
          className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white active:scale-[.98]"
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
    </main>
  );
}