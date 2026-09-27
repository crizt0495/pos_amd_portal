#!/usr/bin/env node
/**
 * Generate TypeScript types untuk database Supabase.
 *
 * Mengambil OpenAPI schema dari PostgREST lalu menulis file
 * `src/types/database.generated.ts`. Jalankan setiap kali `supabase/schema.sql`
 * berubah:
 *
 *   npm run supabase:types
 *
 * Environment yang dibutuhkan (boleh ada di .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_ANON_KEY
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* --------------------------- env loading ---------------------------- */

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = { ...loadEnvFile(resolve(root, '.env.local')), ...loadEnvFile(resolve(root, '.env')) };

function envOf(...names) {
  for (const n of names) {
    const v = process.env[n] || fileEnv[n];
    if (v) return v;
  }
  return '';
}

const url = envOf('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL');
const key = envOf('SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi di .env.local');
  process.exit(1);
}

/* ------------------------------ types -------------------------------- */

function tsTypeOf(schema) {
  if (!schema) return 'unknown';
  if (schema.enum) {
    const values = schema.enum.map((v) => JSON.stringify(v));
    return values.length ? values.join(' | ') : 'string';
  }
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
    case 'array':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function toCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function renderTable(table, def) {
  const required = new Set(def.required ?? []);
  const lines = [];
  lines.push(`      ${table}: {`);
  lines.push(`        Row: {`);
  for (const [col, colDef] of Object.entries(def.properties ?? {})) {
    lines.push(`          ${col}: ${tsTypeOf(colDef)}`);
  }
  lines.push('        }');
  lines.push('        Insert: {');
  for (const [col, colDef] of Object.entries(def.properties ?? {})) {
    const nullable = colDef.type === 'string' && colDef.format === 'uuid' ? true : false;
    const opt = required.has(col) ? '' : '?';
    lines.push(`          ${col}${opt}: ${tsTypeOf(colDef)}${opt === '' || nullable ? '' : ' | null'}`);
  }
  lines.push('        }');
  lines.push('        Update: {');
  for (const [col, colDef] of Object.entries(def.properties ?? {})) {
    const t = tsTypeOf(colDef);
    lines.push(`          ${col}?: ${t} | null`);
  }
  lines.push('        }');
  lines.push('        Relationships: []');
  lines.push('      }');
  return lines.join('\n');
}

async function main() {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/openapi+json',
    },
  });

  if (!res.ok) {
    console.error(`Gagal mengambil OpenAPI schema: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const spec = await res.json();
  const definitions = spec?.components?.schemas ?? {};
  const tables = Object.keys(definitions).filter((k) => !k.startsWith('Rpc') || false);

  const header = `/**
 * AUTO-GENERATED — jangan diedit manual.
 * Sumber: OpenAPI schema PostgREST (Supabase).
 * Regenerate: npm run supabase:types
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
`;

  const body = tables
    .filter((t) => definitions[t]?.properties)
    .map((t) => renderTable(t, definitions[t]))
    .join('\n');

  const views = Object.keys(definitions['Views']?.properties ?? {});
  const enums = Object.keys(definitions['Enums']?.properties ?? {});

  const footer = `    };
    Views: {
${views.map((v) => `      ${v}: { Row: unknown; Insert: never; Update: never; Relationships: [] }`).join('\n') || '      // (tidak ada view)'}
    };
    Functions: {
      current_app_role: { Args: Record<PropertyKey, never>; Returns: string };
      is_super_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_partner: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_partner_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      current_store_id: { Args: Record<PropertyKey, never>; Returns: string | null };
    };
    Enums: {
${enums.map((e) => `      ${toCamel(e)}: ${definitions.Enums.properties[e].enum.map((v) => JSON.stringify(v)).join(' | ')}`).join('\n') || '      // (tidak ada enum)'}
    };
    CompositeTypes: {
      // (tidak ada composite type)
    };
  };
}
`;

  const out = `${header}${body}\n${footer}`;
  const outFile = resolve(root, 'src/types/database.generated.ts');
  writeFileSync(outFile, out, 'utf8');
  console.log(`Types dibuat: ${outFile} (${tables.length} tabel)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
