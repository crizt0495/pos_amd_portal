import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const APP_VERSION = '1.0.0';

/* ------------------------------ money ------------------------------ */

export function rupiah(value: number | string | null | undefined, opts?: { compact?: boolean; decimals?: boolean }) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rp0';
  if (opts?.compact && Math.abs(n) >= 1_000_000) {
    return `Rp${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}jt`;
  }
  if (opts?.compact && Math.abs(n) >= 1_000) {
    return `Rp${(n / 1_000).toFixed(0)}rb`;
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: opts?.decimals ? 2 : 0,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  }).format(n);
}

export function toNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}

/** Bulatkan ke 2 desimal untuk menghindari error floating point (IDR => bulatin ke rupiah penuh). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/* ------------------------------ uuid ------------------------------- */

export function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // fallback untuk konteks non-secure / SSR test
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Short id untuk invoice (mis. INV-20260927-0007) */
export function randomSuffix(len = 4): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
  for (let i = 0; i < len; i += 1) {
    out += alphabet[arr[i] % alphabet.length];
  }
  return out;
}

/* ----------------------------- dates -------------------------------- */

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtTime(v: string | Date | null | undefined): string {
  if (!v) return '-';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  const day = x.getDate();
  x.setMonth(x.getMonth() + months);
  // clamp overflow (31 Jan + 1 month)
  if (x.getDate() < day) x.setDate(0);
  return x;
}

/* ---------------------------- misc --------------------------------- */

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function maskHwid(hwid: string | null | undefined): string {
  if (!hwid) return '-';
  if (hwid.length <= 12) return hwid;
  return `${hwid.slice(0, 6)}…${hwid.slice(-4)}`;
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
