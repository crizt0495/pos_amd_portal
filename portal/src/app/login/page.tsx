import { Suspense } from 'react';

import LoginForm from './form';

export const metadata = { title: 'Masuk — KasirPro Portal' };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <LoginForm />
    </Suspense>
  );
}
