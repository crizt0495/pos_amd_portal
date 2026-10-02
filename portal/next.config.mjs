import withPWAInit from '@ducanh2912/next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // manifest.json dibuat manual (lihat public/manifest.json) — jangan ditimpa generator
  buildExcludes: [/manifest\.json$/],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  compiler: {
    // Buang console.* di produksi. Kode ini tidak memakainya sama sekali
    // (hasil grep: 0 pemanggilan), jadi ini murni pennyiksaan ukuran bundle.
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Minifikasi sudah SELALU memakai SWC di Next 14, jadi `swcMinify` tidak
  // mengubah apa pun. Ditulis hanya agar konfigurasi eksplisit.
  swcMinify: true,

  experimental: {
    // Hanya ikon lucide yang benar-benar dipakai ikut ter-bundle, bukan
    // seluruh ~(1500) ikon. Audit `unused-javascript` ada di halaman ini.
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js'],
  },

  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
