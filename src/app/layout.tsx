import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'KasirPro — Sistem Kasir & Aktivasi Lisensi',
    template: '%s · KasirPro',
  },
  description:
    'KasirPro — aplikasi kasir offline-first dengan sistem aktivasi berbasis Hardware ID. Jual lisensi ke toko, kunci lisensi per perangkat.',
  applicationName: 'KasirPro',
  icons: {
    icon: '/icon.svg',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1d4ed8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ToastProvider>
          <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
