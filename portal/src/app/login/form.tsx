'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2, LogIn, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPass, setShowPass] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(
    params.get('error') ? decodeURIComponent(params.get('error') as string) : null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Email toko dan password wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(
          authError.message.toLowerCase().includes('invalid')
            ? 'Email atau password salah.'
            : authError.message,
        );
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
          Gunakan email &amp; password yang diberikan admin.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email Toko" htmlFor="email">
          <div className="relative">
            <Store className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="toko@email.com"
              className="pl-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

      <div className="mt-auto rounded-2xl bg-zinc-50 p-4">
        <p className="text-[12px] font-semibold text-zinc-700">Belum punya akun?</p>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          Akun toko dibuat oleh admin. Hubungi admin untuk memperoleh Email Toko, password, dan
          jatah lisensi awal.
        </p>
      </div>
    </main>
  );
}
