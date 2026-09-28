'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');

/**
 * ===========================================================================
 *  Database KasirPro Desktop — 100% OFFLINE
 * ===========================================================================
 *  Lokasi   : <userData>/kasir.db   (tidak pernah menyentuh internet)
 *  Tabel    : products, transactions, transaction_items, app_license, settings
 *  Mode     : WAL (aman Evenza/crash), foreign_keys ON
 *
 *  Semua fungsi di file ini dipanggil dari main process lewat IPC (lihat
 *  main.js) dan selalu dibungkus better-sqlite3 yang bersifat sinkron.
 */

let db = null;

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id          TEXT PRIMARY KEY,
        barcode     TEXT,
        name        TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT 'Umum',
        price       REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
        cost        REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
        stock       REAL NOT NULL DEFAULT 0,
        min_stock   REAL NOT NULL DEFAULT 0,
        unit        TEXT NOT NULL DEFAULT 'pcs',
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_products_name    ON products (name);
      CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);
      CREATE INDEX IF NOT EXISTS idx_products_active  ON products (is_active);

      CREATE TABLE IF NOT EXISTS transactions (
        id              TEXT PRIMARY KEY,
        invoice_no      TEXT NOT NULL UNIQUE,
        subtotal        REAL NOT NULL DEFAULT 0,
        discount_type   TEXT NOT NULL DEFAULT 'none',
        discount_value  REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        total           REAL NOT NULL DEFAULT 0,
        total_cost      REAL NOT NULL DEFAULT 0,
        paid            REAL NOT NULL DEFAULT 0,
        change_due      REAL NOT NULL DEFAULT 0,
        payment_method  TEXT NOT NULL DEFAULT 'cash',
        note            TEXT,
        cashier_name    TEXT,
        status          TEXT NOT NULL DEFAULT 'completed',
        created_at      TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_transactions_status  ON transactions (status);

      CREATE TABLE IF NOT EXISTS transaction_items (
        id             TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        product_id     TEXT,
        barcode        TEXT,
        product_name   TEXT NOT NULL,
        price          REAL NOT NULL DEFAULT 0,
        cost           REAL NOT NULL DEFAULT 0,
        qty            REAL NOT NULL DEFAULT 1,
        discount       REAL NOT NULL DEFAULT 0,
        subtotal       REAL NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_items_transaction ON transaction_items (transaction_id);
      CREATE INDEX IF NOT EXISTS idx_items_product     ON transaction_items (product_id);

      -- hanya boleh ada 1 baris (id = 1): status lisensi aplikasi
      CREATE TABLE IF NOT EXISTS app_license (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        serial_key    TEXT,
        hwid          TEXT,
        is_activated  INTEGER NOT NULL DEFAULT 0,
        activated_at  TEXT,
        nama_toko     TEXT,
        pembeli_nama  TEXT,
        paket_type    TEXT,
        license_type  TEXT,
        expires_at    TEXT,
        app_version   TEXT,
        last_check_at TEXT
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `,
  },
];

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const nowIso = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

/** Buka (atau buat) database + jalankan migrasi. */
function open(userDataPath) {
  if (db) return db;

  fs.mkdirSync(userDataPath, { recursive: true });
  const file = path.join(userDataPath, 'kasir.db');

  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  const current = db.pragma('user_version', { simple: true });
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    }
  }

  seedIfEmpty(db);
  return db;
}

function get() {
  if (!db) throw new Error('Database belum dibuka.');
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

/** Produk contoh agar aplikasi tidak kosong saat pertama dijalankan. */
function seedIfEmpty(handle) {
  const { n } = handle.prepare('SELECT COUNT(*) AS n FROM products').get();
  if (n > 0) return;

  const now = nowIso();
  const insert = handle.prepare(`
    INSERT INTO products (id, barcode, name, category, price, cost, stock, min_stock, unit, is_active, created_at, updated_at)
    VALUES (@id, @barcode, @name, @category, @price, @cost, @stock, @min_stock, @unit, 1, @created_at, @updated_at)
  `);

  const samples = [
    ['8991002101015', 'Indomie Goreng', 'Makanan', 3500, 3000, 40, 10, 'pcs'],
    ['8992760223014', 'Susu Ultra 250ml', 'Minuman', 8000, 6500, 24, 6, 'pcs'],
    ['8999999030001', 'Air Mineral 600ml', 'Minuman', 4000, 3000, 48, 12, 'btl'],
  ];

  const insertAll = handle.transaction((rows) => {
    for (const [barcode, name, category, price, cost, stock, minStock, unit] of rows) {
      insert.run({
        id: uid(),
        barcode,
        name,
        category,
        price,
        cost,
        stock,
        min_stock: minStock,
        unit,
        created_at: now,
        updated_at: now,
      });
    }
  });

  insertAll(samples);
}

/** Nomor invoice harian: INV-YYYYMMDD-0001 */
function nextInvoiceNo(handle) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const row = handle
    .prepare("SELECT COUNT(*) AS n FROM transactions WHERE invoice_no LIKE ?")
    .get(`INV-${ymd}-%`);
  return `INV-${ymd}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

/* ------------------------------------------------------------------ */
/* PRODUCTS                                                            */
/* ------------------------------------------------------------------ */

const products = {
  list({ search = '', includeInactive = false } = {}) {
    const clauses = [];
    const params = {};

    if (!includeInactive) clauses.push('is_active = 1');
    if (search) {
      clauses.push('(name LIKE @q OR barcode LIKE @q OR category LIKE @q)');
      params.q = `%${search}%`;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return get()
      .prepare(`SELECT * FROM products ${where} ORDER BY name COLLATE NOCASE ASC`)
      .all(params);
  },

  get(id) {
    return get().prepare('SELECT * FROM products WHERE id = ?').get(id) ?? null;
  },

  findByBarcode(barcode) {
    if (!barcode) return null;
    return (
      get()
        .prepare('SELECT * FROM products WHERE barcode = ? AND is_active = 1 LIMIT 1')
        .get(String(barcode).trim()) ?? null
    );
  },

  categories() {
    return get()
      .prepare('SELECT DISTINCT category FROM products ORDER BY category COLLATE NOCASE ASC')
      .all()
      .map((r) => r.category);
  },

  create(input) {
    const now = nowIso();
    const row = {
      id: uid(),
      barcode: (input.barcode ?? '').trim() || null,
      name: String(input.name ?? '').trim(),
      category: String(input.category ?? 'Umum').trim() || 'Umum',
      price: round2(input.price ?? 0),
      cost: round2(input.cost ?? 0),
      stock: round2(input.stock ?? 0),
      min_stock: round2(input.min_stock ?? 0),
      unit: String(input.unit ?? 'pcs').trim() || 'pcs',
      is_active: input.is_active === false ? 0 : 1,
      created_at: now,
      updated_at: now,
    };

    if (!row.name) throw new Error('Nama produk wajib diisi.');
    if (row.price < 0 || row.cost < 0 || row.stock < 0) throw new Error('Harga/stok tidak boleh negatif.');

    get()
      .prepare(
        `INSERT INTO products (id, barcode, name, category, price, cost, stock, min_stock, unit, is_active, created_at, updated_at)
         VALUES (@id, @barcode, @name, @category, @price, @cost, @stock, @min_stock, @unit, @is_active, @created_at, @updated_at)`,
      )
      .run(row);

    return row;
  },

  update(id, input) {
    const current = products.get(id);
    if (!current) throw new Error('Produk tidak ditemukan.');

    const next = {
      id,
      barcode: input.barcode === undefined ? current.barcode : (input.barcode ?? '').trim() || null,
      name: input.name === undefined ? current.name : String(input.name).trim(),
      category:
        input.category === undefined ? current.category : String(input.category).trim() || 'Umum',
      price: input.price === undefined ? current.price : round2(input.price),
      cost: input.cost === undefined ? current.cost : round2(input.cost),
      stock: input.stock === undefined ? current.stock : round2(input.stock),
      min_stock: input.min_stock === undefined ? current.min_stock : round2(input.min_stock),
      unit: input.unit === undefined ? current.unit : String(input.unit).trim() || 'pcs',
      is_active: input.is_active === undefined ? current.is_active : input.is_active ? 1 : 0,
      updated_at: nowIso(),
    };

    if (!next.name) throw new Error('Nama produk wajib diisi.');
    if (next.price < 0 || next.cost < 0 || next.stock < 0)
      throw new Error('Harga/stok tidak boleh negatif.');

    get()
      .prepare(
        `UPDATE products
            SET barcode = @barcode, name = @name, category = @category, price = @price,
                cost = @cost, stock = @stock, min_stock = @min_stock, unit = @unit,
                is_active = @is_active, updated_at = @updated_at
          WHERE id = @id`,
      )
      .run(next);

    return products.get(id);
  },

  remove(id) {
    const info = get().prepare('DELETE FROM products WHERE id = ?').run(id);
    if (info.changes === 0) throw new Error('Produk tidak ditemukan.');
    return { ok: true, id };
  },

  /** Tambah / kurangi stok (mis. koreksi atau retur). */
  adjustStock(id, delta) {
    const p = products.get(id);
    if (!p) throw new Error('Produk tidak ditemukan.');
    return products.update(id, { stock: Math.max(0, round2(p.stock + Number(delta || 0))) });
  },

  lowStock() {
    return get()
      .prepare('SELECT * FROM products WHERE is_active = 1 AND stock <= min_stock ORDER BY stock ASC')
      .all();
  },
};

/* ------------------------------------------------------------------ */
/* TRANSACTIONS                                                        */
/* ------------------------------------------------------------------ */

/** Hitung total dari keranjang (logika sama dengan sisi renderer). */
function computeTotals(lines, discountType, discountValue) {
  const subtotal = round2(lines.reduce((sum, l) => sum + (l.price - (l.discount || 0)) * l.qty, 0));
  const totalCost = round2(lines.reduce((sum, l) => sum + l.cost * l.qty, 0));

  let discountAmount = 0;
  if (discountType === 'percent') {
    discountAmount = round2((subtotal * Math.min(Math.max(discountValue || 0, 0), 100)) / 100);
  } else if (discountType === 'fixed') {
    discountAmount = round2(Math.min(Math.max(discountValue || 0, 0), subtotal));
  }

  const total = round2(Math.max(0, subtotal - discountAmount));

  return {
    subtotal,
    discountAmount,
    total,
    totalCost,
    itemCount: lines.reduce((n, l) => n + l.qty, 0),
    profit: round2(total - totalCost),
  };
}

const transactions = {
  /** Simpan transaksi + item + potong stok dalam satu transaksi SQLite. */
  create(input) {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    if (!lines.length) throw new Error('Keranjang masih kosong.');

    const discountType = ['none', 'percent', 'fixed'].includes(input.discountType)
      ? input.discountType
      : 'none';
    const discountValue = round2(input.discountValue ?? 0);
    const totals = computeTotals(lines, discountType, discountValue);

    const paid = round2(input.paid ?? totals.total);
    if (paid < totals.total) throw new Error('Nominal bayar kurang dari total belanja.');

    const paymentMethod = input.paymentMethod || 'cash';
    const handle = get();
    const now = nowIso();
    const id = uid();

    const run = handle.transaction(() => {
      const tx = {
        id,
        invoice_no: nextInvoiceNo(handle),
        subtotal: totals.subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: totals.discountAmount,
        total: totals.total,
        total_cost: totals.totalCost,
        paid,
        change_due: round2(Math.max(0, paid - totals.total)),
        payment_method: paymentMethod,
        note: input.note ? String(input.note).slice(0, 200) : null,
        cashier_name: input.cashierName ? String(input.cashierName).slice(0, 60) : 'Kasir',
        status: input.status === 'void' ? 'void' : 'completed',
        created_at: now,
      };

      handle
        .prepare(
          `INSERT INTO transactions
             (id, invoice_no, subtotal, discount_type, discount_value, discount_amount,
              total, total_cost, paid, change_due, payment_method, note, cashier_name, status, created_at)
           VALUES
             (@id, @invoice_no, @subtotal, @discount_type, @discount_value, @discount_amount,
              @total, @total_cost, @paid, @change_due, @payment_method, @note, @cashier_name, @status, @created_at)`,
        )
        .run(tx);

      const insertItem = handle.prepare(
        `INSERT INTO transaction_items
           (id, transaction_id, product_id, barcode, product_name, price, cost, qty, discount, subtotal)
         VALUES (@id, @transaction_id, @product_id, @barcode, @product_name, @price, @cost, @qty, @discount, @subtotal)`,
      );

      for (const line of lines) {
        insertItem.run({
          id: uid(),
          transaction_id: id,
          product_id: line.product_id ?? null,
          barcode: line.barcode ?? null,
          product_name: line.name,
          price: round2(line.price),
          cost: round2(line.cost),
          qty: round2(line.qty),
          discount: round2(line.discount ?? 0),
          subtotal: round2((line.price - (line.discount ?? 0)) * line.qty),
        });

        // potong stok hanya untuk produk yang terdaftar
        if (tx.status !== 'void' && line.product_id) {
          handle
            .prepare(
              'UPDATE products SET stock = MAX(0, stock - @qty), updated_at = @now WHERE id = @id',
            )
            .run({ id: line.product_id, qty: round2(line.qty), now });
        }
      }

      return tx;
    });

    const tx = run();
    return { transaction: tx, totals, changeDue: tx.change_due };
  },

  list({ from, to, limit = 100, offset = 0, status } = {}) {
    const clauses = [];
    const params = { limit: Number(limit) || 100, offset: Number(offset) || 0 };

    if (from) {
      clauses.push('created_at >= @from');
      params.from = `${from}T00:00:00.000Z`;
    }
    if (to) {
      clauses.push('created_at <= @to');
      params.to = `${to}T23:59:59.999Z`;
    }
    if (status) {
      clauses.push('status = @status');
      params.status = status;
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return get()
      .prepare(`SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
      .all(params);
  },

  count({ from, to, status } = {}) {
    const clauses = [];
    const params = {};
    if (from) {
      clauses.push('created_at >= @from');
      params.from = `${from}T00:00:00.000Z`;
    }
    if (to) {
      clauses.push('created_at <= @to');
      params.to = `${to}T23:59:59.999Z`;
    }
    if (status) {
      clauses.push('status = @status');
      params.status = status;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return get().prepare(`SELECT COUNT(*) AS n FROM transactions ${where}`).get(params)?.n ?? 0;
  },

  get(id) {
    return get().prepare('SELECT * FROM transactions WHERE id = ?').get(id) ?? null;
  },

  items(transactionId) {
    return get()
      .prepare('SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY rowid ASC')
      .all(transactionId);
  },

  /** Batalkan transaksi: kembalikan stok & tandai void. */
  void(id) {
    const handle = get();
    const tx = transactions.get(id);
    if (!tx) throw new Error('Transaksi tidak ditemukan.');
    if (tx.status === 'void') return tx;

    const run = handle.transaction(() => {
      handle.prepare("UPDATE transactions SET status = 'void' WHERE id = ?").run(id);
      for (const item of transactions.items(id)) {
        if (!item.product_id) continue;
        handle
          .prepare('UPDATE products SET stock = stock + @qty, updated_at = @now WHERE id = @id')
          .run({ id: item.product_id, qty: item.qty, now: nowIso() });
      }
    });

    run();
    return transactions.get(id);
  },
};

/* ------------------------------------------------------------------ */
/* REPORTS                                                             */
/* ------------------------------------------------------------------ */

function reportWhere({ from, to }) {
  const clauses = ["t.status = 'completed'"];
  const params = {};
  if (from) {
    clauses.push('t.created_at >= @from');
    params.from = `${from}T00:00:00.000Z`;
  }
  if (to) {
    clauses.push('t.created_at <= @to');
    params.to = `${to}T23:59:59.999Z`;
  }
  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

const reports = {
  summary({ from, to } = {}) {
    const { where, params } = reportWhere({ from, to });
    const row = get()
      .prepare(
        `SELECT
           COUNT(*)                                    AS jumlah_transaksi,
           COALESCE(SUM(t.total), 0)                  AS total_omzet,
           COALESCE(SUM(t.total - t.total_cost), 0)   AS total_laba,
           COALESCE(SUM(t.discount_amount), 0)        AS total_diskon,
           COALESCE(SUM(t.paid), 0)                   AS total_terima
         FROM transactions t ${where}`,
      )
      .get(params);

    const items = get()
      .prepare(
        `SELECT COALESCE(SUM(i.qty), 0) AS total_item
           FROM transaction_items i
           JOIN transactions t ON t.id = i.transaction_id ${where}`,
      )
      .get(params);

    const avg = row.jumlah_transaksi ? round2(row.total_omzet / row.jumlah_transaksi) : 0;

    return {
      jumlah_transaksi: row.jumlah_transaksi,
      total_omzet: round2(row.total_omzet),
      total_laba: round2(row.total_laba),
      total_diskon: round2(row.total_diskon),
      total_terima: round2(row.total_terima),
      total_item: round2(items.total_item),
      rata_rata: avg,
    };
  },

  topProducts({ from, to, limit = 10 } = {}) {
    const { where, params } = reportWhere({ from, to });
    return get()
      .prepare(
        `SELECT i.product_name AS name,
                i.product_id  AS product_id,
                SUM(i.qty)     AS qty,
                SUM(i.subtotal) AS omzet
           FROM transaction_items i
           JOIN transactions t ON t.id = i.transaction_id
           ${where}
          GROUP BY i.product_name, i.product_id
          ORDER BY qty DESC
          LIMIT @limit`,
      )
      .all({ ...params, limit: Number(limit) || 10 })
      .map((r) => ({ ...r, qty: round2(r.qty), omzet: round2(r.omzet) }));
  },

  /** Omzet per hari (untuk grafik sederhana di layar Laporan). */
  daily({ from, to } = {}) {
    const { where, params } = reportWhere({ from, to });
    return get()
      .prepare(
        `SELECT substr(t.created_at, 1, 10) AS tanggal,
                COUNT(*)                     AS transaksi,
                SUM(t.total)                 AS omzet,
                SUM(t.total - t.total_cost)  AS laba
           FROM transactions t ${where}
          GROUP BY tanggal
          ORDER BY tanggal ASC`,
      )
      .all(params)
      .map((r) => ({
        tanggal: r.tanggal,
        transaksi: r.transaksi,
        omzet: round2(r.omzet),
        laba: round2(r.laba),
      }));
  },

  byPayment({ from, to } = {}) {
    const { where, params } = reportWhere({ from, to });
    return get()
      .prepare(
        `SELECT t.payment_method AS metode, COUNT(*) AS n, SUM(t.total) AS omzet
           FROM transactions t ${where}
          GROUP BY t.payment_method
          ORDER BY omzet DESC`,
      )
      .all(params)
      .map((r) => ({ ...r, omzet: round2(r.omzet) }));
  },
};

/* ------------------------------------------------------------------ */
/* LICENSE + SETTINGS                                                   */
/* ------------------------------------------------------------------ */

const license = {
  get() {
    return get().prepare('SELECT * FROM app_license WHERE id = 1').get() ?? null;
  },

  save(data) {
    const existing = license.get();
    const now = nowIso();

    const row = {
      id: 1,
      serial_key: data.serial_key ?? existing?.serial_key ?? null,
      hwid: data.hwid ?? existing?.hwid ?? null,
      is_activated: data.is_activated === undefined ? 1 : data.is_activated ? 1 : 0,
      activated_at: data.activated_at ?? existing?.activated_at ?? now,
      nama_toko: data.nama_toko ?? existing?.nama_toko ?? null,
      pembeli_nama: data.pembeli_nama ?? existing?.pembeli_nama ?? null,
      paket_type: data.paket_type ?? existing?.paket_type ?? null,
      license_type: data.license_type ?? existing?.license_type ?? null,
      expires_at: data.expires_at ?? existing?.expires_at ?? null,
      app_version: data.app_version ?? existing?.app_version ?? null,
      last_check_at: now,
    };

    get()
      .prepare(
        `INSERT INTO app_license
           (id, serial_key, hwid, is_activated, activated_at, nama_toko, pembeli_nama,
            paket_type, license_type, expires_at, app_version, last_check_at)
         VALUES
           (@id, @serial_key, @hwid, @is_activated, @activated_at, @nama_toko, @pembeli_nama,
            @paket_type, @license_type, @expires_at, @app_version, @last_check_at)
         ON CONFLICT(id) DO UPDATE SET
           serial_key   = excluded.serial_key,
           hwid         = excluded.hwid,
           is_activated = excluded.is_activated,
           activated_at = excluded.activated_at,
           nama_toko    = excluded.nama_toko,
           pembeli_nama = excluded.pembeli_nama,
           paket_type   = excluded.paket_type,
           license_type = excluded.license_type,
           expires_at   = excluded.expires_at,
           app_version  = excluded.app_version,
           last_check_at= excluded.last_check_at`,
      )
      .run(row);

    return license.get();
  },

  touch() {
    get()
      .prepare('UPDATE app_license SET last_check_at = ? WHERE id = 1')
      .run(nowIso());
    return license.get();
  },

  clear() {
    get().prepare('DELETE FROM app_license WHERE id = 1').run();
    return { ok: true };
  },
};

const settings = {
  get(key, fallback = null) {
    const row = get().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row || row.value === null) return fallback;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  },

  set(key, value) {
    get()
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, JSON.stringify(value ?? null));
    return value;
  },

  all() {
    const out = {};
    for (const row of get().prepare('SELECT key, value FROM settings').all()) {
      try {
        out[row.key] = JSON.parse(row.value);
      } catch {
        out[row.key] = row.value;
      }
    }
    return out;
  },
};

/* ------------------------------------------------------------------ */

module.exports = {
  open,
  close,
  products,
  transactions,
  reports,
  license,
  settings,
  computeTotals,
};
