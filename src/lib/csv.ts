/**
 * Helper CSV sisi browser — dipakai untuk ekspor produk, laporan penjualan,
 * dan laporan komisi. Sengaja tanpa dependensi eksternal.
 */

function escapeCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** Bangun string CSV dari baris (array of array). */
export function toCsv(rows: Array<Array<unknown>>, withBom = true): string {
  const body = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
  return withBom ? `\ufeff${body}` : body;
}

/** Unduh string CSV sebagai file ke folder unduhan browser. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Nama file bercap tanggal hari ini, mis. `laporan-2026-09-27.csv`. */
export function datedFilename(prefix: string, ext = 'csv'): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${ymd}.${ext}`;
}
