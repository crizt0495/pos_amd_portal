'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';

import { PartnerHeader } from '@/components/partner/partner-header';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Layout dashboard partner.
 * Membaca role & data partner dari Supabase (RLS membatasi partner ke datanya
 * sendiri), lalu menampilkan header + halaman anak.
 */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const auth = useAuth();
  const [quotaTick, setQuotaTick] = React.useState(0);

  // refresh kuota setelah halaman anak selesai membuat lisensi
  React.useEffect(() => {
    const handler = () => setQuotaTick((t) => t + 1);
    window.addEventListener('kasirpro:partner-updated', handler);
    return () => window.removeEventListener('kasirpro:partner-updated', handler);
  }, []);

  React.useEffect(() => {
    if (!auth.loading && !auth.userId) router.replace('/login?next=/dashboard');
  }, [auth.loading, auth.userId, router]);

  if (auth.loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!auth.userId) return null;

  if (auth.error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-md">
          <CardContent className="space-y-3 pt-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <p className="font-semibold">{auth.error}</p>
            <Button onClick={() => router.replace('/login')}>Kembali ke Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const partner = auth.partner;
  const quota = partner?.license_quota ?? 0;
  const quotaTotal = quota + (partner?.license_granted ?? 0);

  return (
    <div className="min-h-screen bg-muted/30">
      <PartnerHeader
        profile={auth.profile}
        storeName={partner?.nama_toko ?? auth.profile?.full_name ?? 'Toko Partner'}
        quota={quota}
        quotaTotal={quotaTotal}
        onLogout={auth.signOut}
      />
      {/* key agar halaman anak ikut re-render saat kuota berubah */}
      <div key={quotaTick}>{children}</div>
    </div>
  );
}
