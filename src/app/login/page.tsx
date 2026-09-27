'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, KeyRound, Lock, Mail, ShieldCheck, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import type { AppRole } from '@/types';

function roleHome(role: AppRole, next?: string | null): string {
  if (next && next.startsWith('/')) return next;
  if (role === 'super_admin') return '/admin';
  if (role === 'partner') return '/dashboard';
  return '/pos';
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<div className="grid min-h-screen place-items-center">Memuat…</div>}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const next = params.get('next');
  const urlError = params.get('error');

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(urlError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) return setError('Email wajib diisi.');
    if (password.length < 6) return setError('Password minimal 6 karakter.');

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !data.user) {
        setError(authError?.message ?? 'Login gagal. Periksa email & password.');
        setLoading(false);
        return;
      }

      // Ambil role dari profiles untuk menentukan halaman tujuan
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        setError('Akun Anda dinonaktifkan. Hubungi Super Admin.');
        setLoading(false);
        return;
      }

      const role = (profile?.role as AppRole) ?? 'owner';
      toast.success('Berhasil masuk', `Selamat datang kembali, ${email.split('@')[0]}.`);
      router.replace(roleHome(role, next));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.');
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel kiri — branding */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-foreground/15">
            <Store className="h-5 w-5" />
          </span>
          Kasir<span className="opacity-80">Pro</span>
        </div>

        <div className="max-w-md space-y-6">
          <h1 className="text-4xl font-extrabold leading-tight">
            Satu sistem untuk kasir, toko partner, dan Anda.
          </h1>
          <ul className="space-y-3 text-sm opacity-90">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Lisensi terkunci ke Hardware ID — tidak bisa dipakai di PC lain.
            </li>
            <li className="flex items-start gap-2">
              <Store className="mt-0.5 h-4 w-4 shrink-0" />
              Jatah lisensi, komisi, dan topup tercatat rapi per toko.
            </li>
            <li className="flex items-start gap-2">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              Kasir tetap jalan tanpa internet; data aman di perangkat.
            </li>
          </ul>
        </div>

        <p className="text-xs opacity-70">
          © {new Date().getFullYear()} KasirPro • Sistem Aktivasi Berbasis Hardware ID
        </p>
      </div>

      {/* Panel kanan — form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Store className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold">
              Kasir<span className="text-primary">Pro</span>
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold">Masuk ke Akun</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gunakan akun yang diberikan Super Admin atau toko Anda.
            </p>
          </div>

          <Tabs defaultValue="partner">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="partner">
                <Store className="h-4 w-4" /> Toko Partner
              </TabsTrigger>
              <TabsTrigger value="admin">
                <ShieldCheck className="h-4 w-4" /> Super Admin
              </TabsTrigger>
            </TabsList>

            {(['partner', 'admin'] as const).map((tab) => (
              <TabsContent key={tab} value={tab} className="mt-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {tab === 'admin' && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                      Panel Super Admin. Akun ini hanya dibuat dari halaman <strong>Super Admin</strong>.
                      Jika role akun Anda bukan <code>super_admin</code>, sistem akan mengarahkan ke
                      dashboard yang sesuai.
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        className="pl-9"
                        placeholder="nama@toko.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        className="pl-9"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="whitespace-pre-line">{error}</span>
                    </div>
                  )}

                  <Button type="submit" className="w-full" size="lg" loading={loading} disabled={loading}>
                    {loading ? 'Memproses…' : 'Masuk'}
                  </Button>
                </form>
              </TabsContent>
            ))}
          </Tabs>

          <div className="rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">Belum punya akun?</p>
            <p>
              Akun toko dibuat oleh Super Admin. End user cukup mengunduh aplikasi Kasir dan
              memasukkan Serial Key yang diberikan toko — tanpa perlu login.{' '}
              <Link href="/pos" className="font-semibold text-primary underline-offset-4 hover:underline">
                Buka Aplikasi Kasir
              </Link>
            </p>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              ← Kembali ke beranda
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
