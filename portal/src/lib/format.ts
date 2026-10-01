/** Format angka & tanggal gaya Indonesia. */

const ANGKA = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "Rp. 500.000" — format sesuai wireframe. */
export function rupiah(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rp. 0';
  return `Rp. ${ANGKA.format(n)}`;
}

/** Versi ringkas untuk kartu statistik: 1.250.000 -> "Rp. 1,25jt". */
export function rupiahRingkas(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rp. 0';
  if (Math.abs(n) >= 1_000_000) return `Rp. ${(n / 1_000_000).toFixed(2).replace('.', ',')}jt`;
  if (Math.abs(n) >= 1_000) return `Rp. ${ANGKA.format(Math.round(n / 1_000))}rb`;
  return rupiah(n);
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/** "Senin, 10 Nov 2025" */
export function tanggalPanjang(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** "10 Nov 2025, 14:32" */
export function tanggalWaktu(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function inisial(nama: string | null | undefined): string {
  if (!nama) return 'TK';
  return nama
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Nomor telepon: hanya digit, maksimal 15 karakter.
 *
 * Semua karakter lain (huruf, spasi, `-`, `+`) dibuang. Ini lapisan terakhir —
 * `InputTelepon` sudah menyaring saat mengetik, dan zod di API route sudah
 * menolak, tapi fungsi ini dipakai lagi tepat sebelum request dikirim supaya
 * data yang tersimpan ke database dijamin angka murni.
 */
export function bersihkanTelepon(v: string): string {
  return (v ?? '').replace(/\D/g, '').slice(0, 15);
}
