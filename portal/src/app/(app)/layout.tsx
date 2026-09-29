import { BottomNav } from '@/components/portal/bottom-nav';

/**
 * Layout terproteksi: proteksi route sudah ditangani middleware (mengalihkan
 * ke /login bila belum login). Layout ini tidak memanggil Supabase sama
 * sekali — menghemat satu round-trip `auth.getUser()` di tiap halaman.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  );
}