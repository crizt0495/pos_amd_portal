/**
 * Aturan validasi form yang dipakai bersama oleh halaman /aktivasi dan /profile.
 * Dipisah supaya tidak ada duplikasi pola cek di tiap form.
 */

/** Nomor HP Indonesia: diawali 08, total 10-13 digit (mis. 081234567890). */
export const POLA_HP = /^08[0-9]{8,11}$/;

/** Buang semua karakter selain digit. */
export const hanyaDigit = (s: string) => s.replace(/\D/g, '');

/** Nama toko / pembeli: minimal 3 karakter setelah dipangkas spasi. */
export const namaValid = (nama: string, min = 3) => nama.trim().length >= min;

/**
 * Validasi no HP.
 *
 * Default (`wajib` = false) dipakai field opsional seperti No HP di /profile:
 * kosong = tidak error, tapi bila diisi harus cocok pola 08xx.
 *
 * Field wajib (mis. Telepon di /aktivasi) memakai `wajib: true` supaya kosong
 * ikut dianggap salah — tanpa itu tombol Generate Key bisa aktif lalu ditolak
 * server dengan 422.
 */
export function cekTelepon(telepon: string, wajib = false): string {
  const angka = hanyaDigit(telepon);
  if (angka.length === 0) return wajib ? 'Nomor HP wajib diisi.' : '';
  if (!POLA_HP.test(angka)) return 'Nomor HP harus diawali 08 dan 10-13 digit (mis. 081234567890).';
  return '';
}

/** Validasi alamat: wajib diisi, minimal 10 karakter. */
export function cekAlamat(alamat: string, min = 10): string {
  const n = alamat.trim().length;
  if (n === 0) return 'Alamat wajib diisi.';
  if (n < min) return `Alamat minimal ${min} karakter.`;
  return '';
}
