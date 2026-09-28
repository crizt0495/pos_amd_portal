#!/usr/bin/env node
/**
 * Buat akun demo toko@contoh.com lewat endpoint Auth Supabase (bukan SQL).
 *
 * Mengapa tidak insert auth.users manual? Akun dari SQL tidak punya baris
 * auth.identities sehingga GoTrue menolak login (500 "Database error querying
 * schema"). User yang dibuat lewat API/Dashboard dilengkapi identities dan
 * memicu trigger on_auth_user_created -> baris partners otomatis.
 *
 * Pemakaian:
 *   node portal/scripts/create-demo-user.mjs            # defaults demo
 *   node portal/scripts/create-demo-user.mjs --email a@b.co --password rahasia --nama "Toko Saya" --username toko
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTAL = path.resolve(HERE, '..');

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

async function main() {
  const env = readEnv(path.join(PORTAL, '.env.local'));
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY di portal/.env.local');
    process.exit(2);
  }

  const email = arg('--email') || 'toko@contoh.com';
  const password = arg('--password') || 'toko12345';
  const nama = arg('--nama') || 'DEMO Toko Berkah';
  const username = (arg('--username') || 'demo').toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const endpoint = `${supabaseUrl}/auth/v1/admin/users`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nama_toko: nama, username },
    }),
  });

  const body = await res.json();
  if (res.status === 200 || res.status === 201) {
    console.log(
      `OK   user dibuat: ${body.email} (id ${body.id}) — partner dibuat otomatis oleh trigger.`,
    );
    console.log(`     login portal: username "${username}" / password ${password.replace(/./g, '*')}`);
    console.log(`     (email ${body.email} / password juga tetap bisa dipakai)`);
    return 0;
  }

  if (body.msg && /already been registered|Email already registered/i.test(body.msg)) {
    console.log(`OK   user ${email} sudah ada (${body.msg})`);
    console.log(`     login portal: username "${username}" / password ${password.replace(/./g, '*')}`);
    return 0;
  }

  console.error(`GAGAL (HTTP ${res.status}):`, body.msg || JSON.stringify(body));
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('fatal:', e.message);
    process.exit(1);
  });