'use strict';
/**
 * Mock portal KasirPro — meniru PERSIS state machine RPC `activate_license`
 * yang ada di portal/supabase/schema.sql (status unused/active/blocked/revoked
 * + kunci HWID), supaya sisi desktop bisa diuji tanpa Supabase sungguhan.
 *
 * Jalankan:  node mock-portal.cjs 8899
 */
const http = require('node:http');

const PORT = Number(process.argv[2] || 8899);

/** "database" licenses */
const db = new Map();

function put(lic) {
  db.set(lic.serial_key.toUpperCase(), {
    license_id: `lic-${lic.serial_key}`,
    partner_id: 'partner-1',
    nama_toko: 'Toko Berkah Jaya',
    pembeli_nama: 'Budi Santoso',
    paket_type: 'app_only',
    license_type: 'sekali',
    status: 'unused',
    hwid_locked: null,
    locked_now: false,
    activated_at: null,
    expires_at: null,
    ...lic,
  });
}

/* ------------------------- seed data uji ------------------------- */
put({ serial_key: 'KPRO-TEST-FREE-0001' }); // belum dipakai
put({ serial_key: 'KPRO-TAKE-0000-0002' }); // dipaksa "active" + terkunci
db.get('KPRO-TAKE-0000-0002').status = 'active';
db.get('KPRO-TAKE-0000-0002').hwid_locked = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
db.get('KPRO-TAKE-0000-0002').activated_at = new Date().toISOString();
put({ serial_key: 'KPRO-BLOC-0000-0003', status: 'blocked' });
put({ serial_key: 'KPRO-EXPR-0000-0004', expires_at: '2020-01-01T00:00:00.000Z' });
put({ serial_key: 'KPRO-OPEN-0000-0005', license_type: 'langganan', expires_at: '2099-12-31T00:00:00.000Z' });

const STATUS = {
  ACTIVATED: 200,
  ALREADY_ACTIVE: 200,
  INVALID_KEY: 404,
  NOT_ACTIVE: 403,
  BLOCKED: 403,
  EXPIRED: 403,
  HWID_MISMATCH: 403,
  NETWORK: 500,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function normalize(input) {
  const raw = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  let body = raw.startsWith('KPRO') ? raw.slice(4) : raw;
  while (body.startsWith('KPRO')) body = body.slice(4);
  body = body.slice(0, 12);
  const groups = body.match(/.{1,4}/g) ?? [];
  const joined = groups.join('-');
  return joined ? `KPRO-${joined}` : '';
}

/* -------- logika yang sama dengan activate_license() di schema.sql -------- */
function activateLicense(pSerialKey, pHwid, pDeviceName, pAppVersion) {
  const key = String(pSerialKey ?? '').trim();
  const hwid = String(pHwid ?? '').trim().toUpperCase();
  const lic = db.get(key.toUpperCase());

  if (!lic) {
    return {
      ok: false,
      code: 'INVALID_KEY',
      message: 'Serial Key tidak ditemukan. Periksa kembali kode dari toko Anda.',
    };
  }

  if (lic.status === 'blocked' || lic.status === 'revoked') {
    return {
      ok: false,
      code: 'BLOCKED',
      message: 'Serial Key ini telah diblokir. Hubungi toko Anda.',
      license: lic,
    };
  }

  if (lic.expires_at && new Date(lic.expires_at).getTime() < Date.now()) {
    lic.status = 'revoked';
    return {
      ok: false,
      code: 'EXPIRED',
      message: 'Masa langganan Serial Key ini sudah habis. Hubungi toko Anda.',
      license: { ...lic, status: 'expired' },
    };
  }

  if (lic.status === 'active' && lic.hwid_locked) {
    if (lic.hwid_locked === hwid) {
      return {
        ok: true,
        code: 'ALREADY_ACTIVE',
        message: 'Serial Key ini sudah aktif di perangkat ini.',
        license: { ...lic, locked_now: false },
      };
    }
    return {
      ok: false,
      code: 'HWID_MISMATCH',
      message:
        'Lisensi terikat perangkat lain. Aktifkan di komputer kasir yang sama.',
      license: { ...lic, locked_now: false },
    };
  }

  if (lic.hwid_locked && lic.hwid_locked !== hwid) {
    return {
      ok: false,
      code: 'HWID_MISMATCH',
      message:
        'Lisensi terikat perangkat lain. Aktifkan di komputer kasir yang sama.',
      license: { ...lic, locked_now: false },
    };
  }

  // kunci HWID
  lic.hwid_locked = hwid;
  lic.hwid_locked_at = new Date().toISOString();
  lic.status = 'active';
  lic.activated_at = new Date().toISOString();
  lic.device_name = pDeviceName ?? lic.device_name;
  lic.app_version = pAppVersion ?? lic.app_version;
  lic.locked_now = true;

  return {
    ok: true,
    code: 'ACTIVATED',
    message: 'Serial Key berhasil diaktifkan dan terkunci ke perangkat ini.',
    license: { ...lic },
  };
}

/* ------------------------------ server ------------------------------ */
const server = http.createServer((req, res) => {
  const send = (status, body) => {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(text),
      ...CORS,
    });
    res.end(text);
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.url === '/health') {
    send(200, { ok: true, keys: db.size });
    return;
  }

  /* ---- endpoint yang ditembak desktop ---- */
  if (req.url === '/api/activate' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        send(400, { ok: false, code: 'INVALID_KEY', message: 'Body JSON tidak valid.' });
        return;
      }

      const schema = { serial_key: body.serial_key, hwid: body.hwid };
      if (!schema.serial_key || String(schema.serial_key).length < 6) {
        send(422, { ok: false, code: 'INVALID_KEY', message: 'Serial Key tidak valid.' });
        return;
      }
      if (!schema.hwid || String(schema.hwid).length < 8 || !/^[A-Za-z0-9-]+$/.test(schema.hwid)) {
        send(422, { ok: false, code: 'INVALID_KEY', message: 'HWID tidak valid' });
        return;
      }

      const key = normalize(schema.serial_key);
      if (!key) {
        send(422, { ok: false, code: 'INVALID_KEY', message: 'Format Serial Key tidak dikenali.' });
        return;
      }

      const out = activateLicense(
        key,
        schema.hwid,
        body.device_name,
        body.app_version,
      );

      const status = STATUS[out.code] ?? 400;
      const payload = {
        ok: out.ok,
        code: out.code,
        message: out.message,
        license: out.license
          ? {
              serial_key: key,
              partner_id: out.license.partner_id,
              nama_toko: out.license.nama_toko,
              pembeli_nama: out.license.pembeli_nama,
              paket_type: out.license.paket_type,
              license_type: out.license.license_type,
              status: out.license.status,
              hwid_locked: out.license.hwid_locked,
              locked_now: Boolean(out.license.locked_now),
              activated_at: out.license.activated_at,
              expires_at: out.license.expires_at,
            }
          : undefined,
        locked_hwid: out.code === 'HWID_MISMATCH' ? out.license?.hwid_locked ?? null : null,
        server_time: new Date().toISOString(),
      };
      send(status, payload);
    });
    return;
  }

  send(404, { ok: false, message: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock portal siap di http://127.0.0.1:${PORT}`);
});
