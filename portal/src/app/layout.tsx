import type { Metadata, Viewport } from 'next';

import { env } from '@/lib/env';

import './globals.css';

export const metadata: Metadata = {
  title: `${env.appName}`,
  description: 'Portal operasional toko: generate serial key, pantau komisi, kelola profil toko.',
  applicationName: env.appName,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: env.appName,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#111827',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
