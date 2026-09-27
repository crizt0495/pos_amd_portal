'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';

import { AdminHeader } from '@/components/admin/admin-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';

/**
 * Layout Panel Super Admin.
 * Middleware sudah menyaring non-super_admin, di sini tetap dicek lagi
 * supaya aman kalau halaman diakses langsung (mis. via refresh).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const auth = useAuth();

  React.useEffect(() => {
    if (!auth.loading && !auth.userId) router.replace('/login?next=/admin');
  }, [auth.loading, auth.userId, router]);

  if (auth.loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!auth.userId) return null;

  if (auth.role !== 'super_admin') {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-md">
          <CardContent className="space-y-3 pt-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <p className="font-semibold">Akses khusus Super Admin</p>
            <p className="text-sm text-muted-foreground">
              Akun ini tidak memiliki role super_admin. Hubungi administrator sistem.
            </p>
            <Button onClick={() => router.replace('/pos')}>Kembali ke Aplikasi Kasir</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminHeader profile={auth.profile} />
      {children}
    </div>
  );
}
