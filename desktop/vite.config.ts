import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Di mode dev, Vite butuh inline script (React Refresh) dan koneksi websocket
 * untuk HMR — keduanya dilarang oleh CSP ketat yang dipakai di build produksi.
 * Jadi meta CSP hanya dibiarkan saat `vite build`.
 */
function cspProductionOnly(): Plugin {
  return {
    name: 'kasirpro-csp-production-only',
    transformIndexHtml(html) {
      return html.replace(/[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/g, '');
    },
    apply: 'build',
  };
}

export default defineConfig({
  plugins: [react(), cspProductionOnly()],
  // Electron memuat file build lewat file:// -> path harus relatif
  base: './',
  server: {
    port: 5273,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
