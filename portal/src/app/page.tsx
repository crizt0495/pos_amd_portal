import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/supabase/guard';

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? '/home' : '/login');
}
