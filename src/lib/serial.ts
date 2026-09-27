import { randomSuffix } from '@/lib/utils';

/**
 * Format Serial Key  : KPRO-XXXX-XXXX-XXXX
 * Alfabet            : Crockford base32 tanpa karakter ambigu (I, O, 0, 1 dihapus)
 *                    -> aman diketik manual / dibacacustomers dari kertas.
 */
export const SERIAL_PREFIX = 'KPRO';
export const SERIAL_REGEX = /^KPRO-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function normalizeSerialKey(input: string): string {
  const raw = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  // Buang prefix berulang, mis. user mengetik "KPRO KPRO-XXXX-XXXX-XXXX"
  let body = raw.startsWith(SERIAL_PREFIX) ? raw.slice(SERIAL_PREFIX.length) : raw;
  while (body.startsWith(SERIAL_PREFIX)) body = body.slice(SERIAL_PREFIX.length);

  const groups: string[] = [];
  for (let i = 0; i < 4; i += 1) groups.push(body.slice(i * 4, i * 4 + 4));

  const bodyOut = groups.filter(Boolean).join('-');
  return bodyOut ? `${SERIAL_PREFIX}-${bodyOut}` : '';
}

export function generateSerialKey(): string {
  const groups = [randomSuffix(4), randomSuffix(4), randomSuffix(4)];
  return `${SERIAL_PREFIX}-${groups.join('-')}`;
}

export function isValidSerialKeyFormat(key: string): boolean {
  return SERIAL_REGEX.test(normalizeSerialKey(key));
}

/** Format bertahap untuk input user: KPRO- -> KPRO-A -> ... */
export function formatSerialKeyInput(value: string): string {
  const cleaned = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let body = cleaned.startsWith(SERIAL_PREFIX) ? cleaned.slice(SERIAL_PREFIX.length) : cleaned;
  while (body.startsWith(SERIAL_PREFIX)) body = body.slice(SERIAL_PREFIX.length);
  body = body.slice(0, 12);
  const groups = body.match(/.{1,4}/g) ?? [];
  const joined = groups.join('-');
  return joined ? `${SERIAL_PREFIX}-${joined}` : '';
}
