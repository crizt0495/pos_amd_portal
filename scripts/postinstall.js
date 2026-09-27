/* eslint-disable no-console */
/**
 * postinstall — sanity check konfigurasi lingkungan.
 * Tidak pernah membatalkan install; hanya mencetak peringatan.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const envExample = path.join(root, '.env.example');
const envLocal = path.join(root, '.env.local');
const envProd = path.join(root, '.env.production');

function hasKeys(file) {
  if (!fs.existsSync(file)) return false;
  const content = fs.readFileSync(file, 'utf8');
  return (
    content.includes('NEXT_PUBLIC_SUPABASE_URL') &&
    content.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY') &&
    content.includes('SUPABASE_SERVICE_ROLE_KEY') &&
    !content.includes('xxxx')
  );
}

console.log('\n[KasirPro] Pemeriksaan konfigurasi environment…');

if (!fs.existsSync(envExample)) {
  console.log('  [!] .env.example tidak ditemukan.');
}

if (hasKeys(envLocal)) {
  console.log('  [✓] .env.local siap dipakai untuk `npm run dev`.');
} else if (hasKeys(envProd)) {
  console.log('  [✓] .env.production siap dipakai untuk `npm run build:exe`.');
} else {
  console.log('  [ ] .env.local belum diisi.');
  console.log('      Salin .env.example -> .env.local lalu isi URL & KEY dari Supabase Dashboard.');
  console.log('      Jalankan supabase/schema.sql di SQL Editor terlebih dahulu.');
}

console.log('[KasirPro] Selesai.\n');
