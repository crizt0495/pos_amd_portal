/**
 * Serial Key KasirPro.
 * Format : KPRO-XXXX-XXXX-XXXX
 * Alfabet: tanpa karakter ambigu (I, O, 0, 1 dihapus) supaya mudah dibaca/diketik.
 */

export const SERIAL_PREFIX = 'KPRO';
export const SERIAL_REGEX = /^KPRO-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomGroup(len = 4): string {
  const buf = new Uint32Array(len);
  const hasCrypto =
    typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function';
  if (hasCrypto) crypto.getRandomValues(buf);

  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += ALPHABET[hasCrypto ? buf[i]! % ALPHABET.length : Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function generateSerialKey(): string {
  return `${SERIAL_PREFIX}-${randomGroup()}-${randomGroup()}-${randomGroup()}`;
}

/**
 * Rapikan input user menjadi `KPRO-XXXX-XXXX-XXXX`.
 * Menerima "kpro xxxx", "KPROXXXX", "KPRO-XXXX-XXXX-XXXX".
 */
export function normalizeSerialKey(input: string): string {
  const raw = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';

  let body = raw.startsWith(SERIAL_PREFIX) ? raw.slice(SERIAL_PREFIX.length) : raw;
  while (body.startsWith(SERIAL_PREFIX)) body = body.slice(SERIAL_PREFIX.length);
  body = body.slice(0, 12);

  const groups = body.match(/.{1,4}/g) ?? [];
  const joined = groups.join('-');
  return joined ? `${SERIAL_PREFIX}-${joined}` : '';
}

export function isValidSerialKeyFormat(key: string): boolean {
  return SERIAL_REGEX.test(normalizeSerialKey(key));
}
