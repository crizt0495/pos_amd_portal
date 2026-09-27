import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createAdminClient, hasServiceRole } from '@/lib/supabase/admin';
import { clientIpFromRequest, userAgentFromRequest } from '@/lib/supabase/session';
import { normalizeSerialKey } from '@/lib/serial';
import type { ActivateResponse, LicenseType, PaketType } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  serialKey: z.string().min(6).max(64),
  hwid: z.string().min(8).max(128).regex(/^[A-Za-z0-9-]+$/),
});

/**
 * POST /api/pos/verify
 * Cek status lisensi + kecocokan HWID tanpa mengubah apa pun.
 * Dipakai aplikasi client saat start (jika online) untuk mendeteksi
 * aplikasi yang di-copy ke PC lain.
 */
export async function POST(req: Request) {
  if (!hasServiceRole()) {
    return NextResponse.json(
      { ok: false, code: 'NETWORK', message: 'Server belum dikonfigurasi.' },
      { status: 500 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'NETWORK', message: 'Body JSON tidak valid.' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_KEY', message: 'Serial Key / HWID tidak valid.' },
      { status: 422 },
    );
  }

  const serialKey = normalizeSerialKey(parsed.data.serialKey);
  const hwid = parsed.data.hwid.toUpperCase();
  const admin = createAdminClient();
  const ip = clientIpFromRequest(req);
  const ua = userAgentFromRequest(req);

  const { data: licRaw, error } = await admin
    .from('licenses')
    .select('*')
    .eq('serial_key', serialKey)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, code: 'NETWORK', message: error.message }, { status: 500 });
  }
  if (!licRaw) {
    return NextResponse.json(
      { ok: false, code: 'INVALID_KEY', message: 'Serial Key tidak valid.' },
      { status: 404 },
    );
  }

  const l = licRaw as unknown as {
    id: string;
    store_id: string | null;
    hwid_locked: string | null;
    status: string;
    paket_type: PaketType;
    license_type: LicenseType;
    expires_at: string | null;
  };

  let storeName: string | null = null;
  let ownerName: string | null = null;
  if (l.store_id) {
    const { data: store } = await admin
      .from('stores')
      .select('store_name, owner_name')
      .eq('id', l.store_id)
      .maybeSingle();
    storeName = store?.store_name ?? null;
    ownerName = store?.owner_name ?? null;
  }

  const base = {
    license: {
      id: l.id,
      partnerId: null,
      storeId: l.store_id,
      storeName,
      ownerName,
      paketType: l.paket_type,
      licenseType: l.license_type,
      hwidLocked: l.hwid_locked,
      lockedNow: false,
      expiresAt: l.expires_at,
    },
    loggedHwid: l.hwid_locked,
  } satisfies Partial<ActivateResponse>;

  if (l.status === 'blocked' || l.status === 'revoked') {
    await admin.from('hwid_logs').insert({
      license_id: l.id,
      hwid,
      ip_address: ip,
      user_agent: ua,
      result: 'blocked',
      detail: 'Verify: lisensi diblokir',
    });
    return NextResponse.json(
      { ...base, ok: false, code: 'BLOCKED', message: 'Lisensi diblokir admin.' },
      { status: 403 },
    );
  }

  if (l.status === 'expired' || (l.expires_at && new Date(l.expires_at).getTime() < Date.now())) {
    return NextResponse.json(
      { ...base, ok: false, code: 'EXPIRED', message: 'Masa langganan habis.' },
      { status: 403 },
    );
  }

  if (l.status !== 'active') {
    return NextResponse.json(
      { ...base, ok: false, code: 'NOT_ACTIVE', message: 'Lisensi belum diaktifkan di perangkat ini.' },
      { status: 403 },
    );
  }

  if (l.hwid_locked !== hwid) {
    await admin.from('hwid_logs').insert({
      license_id: l.id,
      hwid,
      ip_address: ip,
      user_agent: ua,
      result: 'mismatch',
      detail: `Verify: HWID tidak cocok (terkunci ${l.hwid_locked})`,
    });
    return NextResponse.json(
      {
        ...base,
        ok: false,
        code: 'HWID_MISMATCH',
        message: 'Lisensi terkunci di perangkat lain. Aplikasi ini adalah salinan.',
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    { ...base, ok: true, code: 'ALREADY_ACTIVE', message: 'Lisensi valid.' },
    { status: 200 },
  );
}
