'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';
import type { AppRole, Partner, Profile } from '@/types';

export interface AuthState {
  loading: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  role: AppRole | null;
  partner: Partner | null;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const EMPTY: AuthState = {
  loading: true,
  session: null,
  userId: null,
  email: null,
  profile: null,
  role: null,
  partner: null,
  error: null,
  refresh: async () => {},
  signOut: async () => {},
};

/**
 * Sesi + role + data partner untuk halaman dashboard.
 * RLS Supabase otomatis membatasi partner hanya melihat datanya sendiri.
 */
export function useAuth(): AuthState {
  const [state, setState] = React.useState<AuthState>(EMPTY);
  const router = useRouter();

  const load = React.useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.user) {
        setState({ ...EMPTY, loading: false });
        return;
      }

      const userId = session.user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.is_active === false) {
        await supabase.auth.signOut();
        setState({ ...EMPTY, loading: false, error: 'Akun Anda dinonaktifkan.' });
        return;
      }

      const { data: partner } = await supabase
        .from('partners')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      setState({
        loading: false,
        session,
        userId,
        email: session.user.email ?? null,
        profile: (profile as Profile) ?? null,
        role: (profile?.role as AppRole) ?? null,
        partner: (partner as Partner) ?? null,
        error: null,
        refresh: async () => {},
        signOut: async () => {},
      });
    } catch (e) {
      setState({
        ...EMPTY,
        loading: false,
        error: e instanceof Error ? e.message : 'Gagal memuat sesi.',
      });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const signOut = React.useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setState(EMPTY);
    router.replace('/login');
    router.refresh();
  }, [router]);

  return React.useMemo(
    () => ({ ...state, refresh: load, signOut }),
    [state, load, signOut],
  );
}
