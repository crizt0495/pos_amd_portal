/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Electron loads the app from http://localhost:3000, so the Next server must
  // listen on all interfaces but be reachable on localhost.
  output: 'standalone',
  eslint: {
    // Do not block production builds on lint findings.
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverComponentsExternalPackages: ['node-machine-id', 'node-thermal-printer'],
  },
};

export default nextConfig;
