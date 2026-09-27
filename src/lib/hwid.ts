import { sha256Hex } from '@/lib/utils';

/**
 * ===========================================================================
 *  HARDWARE ID (HWID) — WAJIB untuk hardware locking lisensi
 * ===========================================================================
 *  Prioritas sumber HWID:
 *   1. Electron  -> IPC ke main process -> node-machine-id (motherboard/BIOS UUID)
 *                   `machineIdSync({ original: true })` = motherboard UUID.
 *   2. Web       -> fingerprint gabungan: userAgent + hardwareConcurrency +
 *                   platform + language + screen + timezone + deviceMemory,
 *                   di-hash SHA-256 menjadi 32 hex char.
 *
 *  Format normalisasi server: uppercase 32-char hex.
 */

export const HWID_PREFIX = 'KP';

export interface HwidResult {
  hwid: string;
  source: 'electron-machine-id' | 'electron-bios' | 'browser-fingerprint' | 'fallback';
  deviceName: string;
  raw: string;
}

interface ElectronBridge {
  getHwid?: () => Promise<{ ok: boolean; hwid?: string; deviceName?: string; source?: string; raw?: string; error?: string }>;
  printReceipt?: (payload: unknown) => Promise<{ ok: boolean; error?: string }>;
  openExternal?: (url: string) => Promise<{ ok: boolean; error?: string }>;
  appInfo?: () => Promise<{ version: string; platform: string; electron: boolean }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridge;
  }
}

/** Ubah string mentah (UUID motherboard, dll) menjadi 32 hex char uppercase. */
export async function normalizeHwid(raw: string): Promise<string> {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  // UUID / string yang sudah 32 hex -> pakai langsung
  const compact = trimmed.replace(/[^a-fA-F0-9]/g, '');
  if (compact.length === 32) return compact.toUpperCase();
  const hashed = await sha256Hex(trimmed);
  return hashed.slice(0, 32).toUpperCase();
}

function guessDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Perangkat Tidak Diketahui';
  const ua = navigator.userAgent || '';
  let os = 'Unknown OS';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${os}-${navigator.hardwareConcurrency || 1}CPU`;
}

/** Fingerprint browser: deterministik per perangkat, hash jadi 32 hex. */
async function browserFingerprint(): Promise<{ raw: string; deviceName: string }> {
  const nav = globalThis.navigator;
  const scr = globalThis.screen;
  const rawParts = [
    'fp2',
    nav?.userAgent ?? 'no-ua',
    String(nav?.platform ?? ''),
    String(nav?.language ?? ''),
    String(nav?.languages?.join(',') ?? ''),
    String(nav?.hardwareConcurrency ?? ''),
    String((nav as unknown as { deviceMemory?: number })?.deviceMemory ?? ''),
    String(nav?.maxTouchPoints ?? 0),
    scr ? `${scr.width}x${scr.height}x${scr.colorDepth}` : 'no-screen',
    scr ? `${scr.availWidth}x${scr.availHeight}` : 'no-avail',
    String(new Date().getTimezoneOffset()),
  ];
  return { raw: rawParts.join('|'), deviceName: guessDeviceName() };
}

let cached: HwidResult | null = null;

/**
 * Ambil HWID perangkat. Aman dipanggil berkali-kali (hasil di-cache).
 * Tidak pernah melempar error — kalau gagal, tetap mengembalikan HWID fallback
 * supaya aplikasi POS tidak terkunci total saat HWID asli tidak terbaca.
 */
export async function getHwid(): Promise<HwidResult> {
  if (cached) return cached;

  // 1. Electron bridge (HWID asli dari motherboard / BIOS)
  if (typeof window !== 'undefined' && window.electronAPI?.getHwid) {
    try {
      const res = await window.electronAPI.getHwid();
      if (res?.ok && res.hwid) {
        cached = {
          hwid: res.hwid,
          source: (res.source as HwidResult['source']) ?? 'electron-machine-id',
          deviceName: res.deviceName || guessDeviceName(),
          raw: res.raw || res.hwid,
        };
        return cached;
      }
    } catch {
      /* jatuh ke fallback */
    }
  }

  // 2. Web: fingerprint browser
  try {
    const { raw, deviceName } = await browserFingerprint();
    cached = {
      hwid: await normalizeHwid(raw),
      source: 'browser-fingerprint',
      deviceName,
      raw,
    };
    return cached;
  } catch {
    // 3. Fallback terakhir: userAgent + hardwareConcurrency (sesuai spesifikasi)
    const nav = globalThis.navigator;
    const raw = `fb|${nav?.userAgent ?? 'no-ua'}|${nav?.hardwareConcurrency ?? 0}`;
    cached = {
      hwid: await normalizeHwid(raw),
      source: 'fallback',
      deviceName: guessDeviceName(),
      raw,
    };
    return cached;
  }
}

export function clearHwidCache() {
  cached = null;
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI);
}
